import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-284 / B-067 (Decision Log #465, #472 (b)): report a message from its menu, on the Community pop-up and on the
// mobile conversation page, in real Chrome against the real API, Postgres and Redis (backend PR #685). Scoped to
// this work; no other Playwright spec is run by it.
//
// Verified adults with usernames: A reports; B, C, D send. One sender per scenario so scenarios cannot interfere.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b284-message-report-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string): Promise<Verified> {
  const a = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const username = uniqueUsername(label);
  expect((await api('PATCH', `/users/${a.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...a, token, username };
}

async function conversationWith(from: Verified, to: Verified): Promise<string> {
  const started = await api('POST', '/conversations', { token: from.token, body: { recipientId: to.userId } });
  expect([200, 201]).toContain(started.status);
  return started.body.id as string;
}

async function send(from: Verified, conversationId: string, text: string): Promise<string> {
  const sent = await api('POST', `/conversations/${conversationId}/messages`, { token: from.token, body: { contentText: text } });
  expect([200, 201]).toContain(sent.status);
  return sent.body.id as string;
}

async function reportsAbout(messageId: string): Promise<any[]> {
  return db().report.findMany({ where: { targetType: 'message', targetId: messageId } });
}

test.describe.serial('Report a message', () => {
  let a: Verified;
  let b: Verified;
  let c: Verified;
  let d: Verified;
  let convB = '';
  let convC = '';
  let convD = '';
  let bMessage = '';
  let cMessage = '';
  let dMessage = '';

  test.beforeAll(async () => {
    a = await verifiedAdult('rep-a');
    b = await verifiedAdult('rep-b');
    c = await verifiedAdult('rep-c');
    d = await verifiedAdult('rep-d');
    convB = await conversationWith(b, a);
    bMessage = await send(b, convB, 'B says: this is the message to report');
    await send(a, convB, 'A says: my own reply');
    convC = await conversationWith(c, a);
    cMessage = await send(c, convC, 'C says: one more for the mobile page');
    convD = await conversationWith(d, a);
    dMessage = await send(d, convD, 'D says: this one will be deleted behind the page');
  });

  async function openPopUp(page: Page, who: Verified) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/community');
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(who.username) }).click();
    return page.getByRole('region', { name: `Chat with ${who.username}`, exact: true });
  }

  async function openMenuOnBubble(page: Page, chat: ReturnType<Page['getByRole']>, text: string) {
    const host = chat.locator('.msg-host', { hasText: text });
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    return page.getByRole('menu', { name: 'Message actions' });
  }

  test('pop-up: Report is on their message only, in the frame order, and files a real report', async ({ page }) => {
    const chat = await openPopUp(page, b);
    await expect(chat.getByText('A says: my own reply')).toBeVisible();

    // Your own message: no Report.
    const mine = await openMenuOnBubble(page, chat, 'A says: my own reply');
    await expect(mine.getByRole('menuitem', { name: 'Report' })).toHaveCount(0);
    await page.keyboard.press('Escape');

    // Their message: Report, then Delete for me.
    const theirs = await openMenuOnBubble(page, chat, 'B says: this is the message to report');
    const items = theirs.getByRole('menuitem');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toHaveText('Report');
    await expect(items.nth(1)).toContainText('Delete for me');
    await shot(page, '01-popup-their-menu');

    await theirs.getByRole('menuitem', { name: 'Report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this message' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('menu')).toHaveCount(0);
    // The dialog never carries the message text.
    await expect(dialog).not.toContainText('this is the message to report');
    await expect(dialog.getByRole('radio')).toHaveCount(9);
    // This thread has other messages, so the first step moves on to the optional context step (B-286).
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled();
    await shot(page, '02-popup-report-nothing-chosen');

    await dialog.getByRole('radio', { name: 'Spam or scam' }).check();
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeEnabled();
    await shot(page, '03-popup-report-chosen');
    await dialog.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('dialog', { name: 'Add messages for context' }).getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByText('Reported — thanks')).toBeVisible();
    await shot(page, '04-popup-reported');

    const rows = await reportsAbout(bMessage);
    expect(rows).toHaveLength(1);
    expect(rows[0].reporterId).toBe(a.userId);
    expect(rows[0].reasonCategory).toBe('spam_or_scam');
    expect(rows[0].status).toBe('open');

    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);

    // The sender was told nothing: no notification row for the report mentions it, and their thread is unchanged.
    const thread = await api('GET', `/conversations/${convB}/messages`, { token: b.token });
    expect(thread.body.items.map((m: any) => m.id)).toContain(bMessage);
    expect(await db().notification.count({ where: { userId: b.userId, type: 'moderation_decision' } })).toBe(0);
  });

  test('pop-up: a repeat report while the first is open is a success and adds no second report', async ({ page }) => {
    const chat = await openPopUp(page, b);
    const menu = await openMenuOnBubble(page, chat, 'B says: this is the message to report');
    await menu.getByRole('menuitem', { name: 'Report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this message' });
    await dialog.getByRole('radio', { name: 'Harassment or bullying' }).check();
    await dialog.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('dialog', { name: 'Add messages for context' }).getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByText('Reported — thanks')).toBeVisible();
    expect(await reportsAbout(bMessage)).toHaveLength(1);
  });

  test('pop-up: Block User is drawn in the alert colour', async ({ page }) => {
    await openPopUp(page, b);
    await page.getByRole('button', { name: 'Conversation options' }).click();
    const item = page.getByRole('menuitem', { name: 'Block User' });
    await expect(item).toBeVisible();
    await expect(item).toHaveCSS('color', 'rgb(250, 6, 6)');
    await expect(page.getByRole('menuitem', { name: 'Mark as Read' })).not.toHaveCSS('color', 'rgb(250, 6, 6)');
    await shot(page, '05-popup-conversation-menu-block-red');
  });

  test('pop-up: a message the server will no longer accept a report for shows the plain could-not-send line', async ({ page }) => {
    const chat = await openPopUp(page, d);
    await expect(chat.getByText('D says: this one will be deleted behind the page')).toBeVisible();
    // D deletes it for everyone while A still has it on screen.
    const gone = await api('DELETE', `/conversations/${convD}/messages/${dMessage}?scope=everyone`, { token: d.token });
    expect(gone.status).toBe(204);

    const menu = await openMenuOnBubble(page, chat, 'D says: this one will be deleted behind the page');
    await menu.getByRole('menuitem', { name: 'Report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Report this message' });
    await dialog.getByRole('radio', { name: 'Spam or scam' }).check();
    await dialog.getByRole('button', { name: 'Submit report' }).click();
    const alert = dialog.getByRole('alert');
    await expect(alert).toHaveText("Couldn't submit that report. Please try again.");
    await expect(dialog).not.toContainText(/not found/i);
    await expect(dialog.getByRole('radio', { name: 'Spam or scam' })).toBeChecked();
    await shot(page, '06-popup-could-not-send');
    expect(await reportsAbout(dMessage)).toHaveLength(0);
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('mobile page: Report on their message at 390px, then the report is filed and the dialog closes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/messages');
    await page.getByText(c.username).click();
    await expect(page).toHaveURL(/\/messages\/[^/]+$/);
    await expect(page.getByText('C says: one more for the mobile page')).toBeVisible();

    const host = page.locator('.msg-host', { hasText: 'C says: one more for the mobile page' });
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    const menu = page.getByRole('menu', { name: 'Message actions' });
    await expect(menu.getByRole('menuitem').nth(0)).toHaveText('Report');
    await shot(page, '07-mobile-their-menu');
    await menu.getByRole('menuitem', { name: 'Report' }).click();

    const dialog = page.getByRole('dialog', { name: 'Report this message' });
    await expect(dialog).toBeVisible();
    await shot(page, '08-mobile-report-nothing-chosen');
    await dialog.getByRole('radio', { name: 'Hate or abusive language' }).check();
    await shot(page, '09-mobile-report-chosen');
    await dialog.getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByText('Reported — thanks')).toBeVisible();
    await shot(page, '10-mobile-reported');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    const rows = await reportsAbout(cMessage);
    expect(rows).toHaveLength(1);
    expect(rows[0].reasonCategory).toBe('hate_or_abusive_language');

    // No sideways scroll at 390px.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
