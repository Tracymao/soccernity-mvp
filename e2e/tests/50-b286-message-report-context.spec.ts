import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

// B-286 (Decision Log #477): the optional "Add messages for context" step of Report a message, and the "Messages
// around the reported one" section of Report Detail, in real Chrome against the real API (backend PR #705),
// Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// Verified adults with usernames: A reports, B sends the reported message. The thread is 20 messages (8 before the
// reported one, the reported one, 11 after), so the whole thread loads in one page and the window is 8 before and
// 10 after: 18 messages are offered, the 11th after is outside it.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b286-message-report-context-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string): Promise<Verified> {
  const a = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const username = uniqueUsername(label);
  expect((await api('PATCH', `/users/${a.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...a, token, username };
}

async function send(from: Verified, conversationId: string, text: string): Promise<string> {
  const r = await api('POST', `/conversations/${conversationId}/messages`, { token: from.token, body: { contentText: text } });
  expect([200, 201]).toContain(r.status);
  return r.body.id as string;
}

async function reportsAbout(messageId: string): Promise<any[]> {
  return db().report.findMany({ where: { targetType: 'message', targetId: messageId }, orderBy: { createdAt: 'asc' } });
}

// The context rows of a report, straight from Postgres (raw SQL: independent of the generated client's age).
async function contextIdsOf(reportId: string): Promise<string[]> {
  const rows: Array<{ messageId: string }> = await db().$queryRaw`
    SELECT "messageId" FROM "ReportContextMessage" WHERE "reportId" = ${reportId}`;
  return rows.map((r) => r.messageId);
}

test.describe.serial('Report a message: add messages for context', () => {
  let a: Verified;
  let b: Verified;
  let conv = '';
  const before: Array<{ id: string; text: string }> = [];
  const after: Array<{ id: string; text: string }> = [];
  let reported = { id: '', text: '' };

  test.beforeAll(async () => {
    a = await verifiedAdult('ctx-a');
    b = await verifiedAdult('ctx-b');
    const started = await api('POST', '/conversations', { token: b.token, body: { recipientId: a.userId } });
    expect([200, 201]).toContain(started.status);
    conv = started.body.id as string;
    // 8 before (B, A, B, A ...), the reported one (B), 11 after (A, B, A ...).
    for (let i = 1; i <= 8; i++) {
      const sender = i % 2 === 1 ? b : a;
      const text = `before-${i} ${RUN}`;
      before.push({ id: await send(sender, conv, text), text });
    }
    reported = { text: `REPORTED ${RUN}: you are useless, quit the team`, id: '' };
    reported.id = await send(b, conv, reported.text);
    for (let i = 1; i <= 11; i++) {
      const sender = i % 2 === 1 ? a : b;
      const text = `after-${i} ${RUN}`;
      after.push({ id: await send(sender, conv, text), text });
    }
  });

  async function openPopUp(page: Page) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/community');
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(b.username) }).click();
    return page.getByRole('region', { name: `Chat with ${b.username}`, exact: true });
  }

  async function toContextStep(page: Page, chat: ReturnType<Page['getByRole']>) {
    const host = chat.locator('.msg-host', { hasText: reported.text });
    await host.scrollIntoViewIfNeeded();
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    await page.getByRole('menu', { name: 'Message actions' }).getByRole('menuitem', { name: 'Report' }).click();
    const first = page.getByRole('dialog', { name: 'Report this message' });
    await first.getByRole('radio', { name: 'Harassment or bullying' }).check();
    await first.getByRole('button', { name: 'Next' }).click();
    return page.getByRole('dialog', { name: 'Add messages for context' });
  }

  test('the step offers the window around the reported message, none chosen, the reported one not selectable', async ({ page }) => {
    const chat = await openPopUp(page);
    await expect(chat.getByText(reported.text)).toBeVisible();
    const dialog = await toContextStep(page, chat);
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Optional. Pick messages from this chat that help our team understand what happened.');
    await expect(dialog).toContainText('Our safeguarding team will see the messages you choose, and the message you are reporting.');
    await expect(dialog.getByText('0 of 20 selected')).toBeVisible();
    // 8 before + 10 after: the 11th after the reported message is outside the window.
    await expect(dialog.getByRole('checkbox')).toHaveCount(18);
    for (const box of await dialog.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
    await expect(dialog.getByText(after[10].text)).toHaveCount(0);
    await expect(dialog.getByText(before[0].text)).toBeVisible();
    await expect(dialog.getByText(after[9].text)).toBeVisible();
    const reportedRow = dialog.locator('.report-context__row--reported');
    await expect(reportedRow).toContainText('Reported message');
    await expect(reportedRow).toContainText(reported.text);
    await expect(reportedRow.getByRole('checkbox')).toHaveCount(0);
    // Your own messages read You.
    await expect(dialog.locator('.report-context__row', { hasText: before[1].text })).toContainText('You');
    await shot(page, '01-popup-context-step-default');
    // Nothing was sent by looking.
    expect(await reportsAbout(reported.id)).toHaveLength(0);
  });

  test('choosing three messages sends exactly those ids; they are stored and the confirmation says how many', async ({ page }) => {
    const chat = await openPopUp(page);
    const dialog = await toContextStep(page, chat);
    await dialog.getByText(before[7].text).click();
    await dialog.getByText(after[0].text).click();
    await dialog.getByText(after[1].text).click();
    await expect(dialog.getByText('3 of 20 selected')).toBeVisible();
    await shot(page, '02-popup-context-step-some-selected');
    await dialog.getByRole('button', { name: 'Submit with 3 messages' }).click();
    await expect(page.getByText('Reported — thanks')).toBeVisible();
    await expect(page.getByText('3 messages from the chat were included with your report.')).toBeVisible();
    await shot(page, '03-popup-context-sent');

    const rows = await reportsAbout(reported.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].reporterId).toBe(a.userId);
    expect([...(await contextIdsOf(rows[0].id))].sort()).toEqual([before[7].id, after[0].id, after[1].id].sort());
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('admin: the card lists the chosen messages with the reported one highlighted in its place', async ({ browser }) => {
    const rows = await reportsAbout(reported.id);
    const reportId = rows[0].id as string;
    const page = await adminPage(browser);
    await page.setViewportSize({ width: 1440, height: 1184 });
    await page.goto(`${URLS.admin}/moderation/reports/${reportId}`);
    const card = page.locator('.mod-card', { hasText: 'Messages around the reported one' });
    await expect(card).toBeVisible();
    const items = card.getByRole('listitem');
    await expect(items).toHaveCount(4);
    // Oldest first: the last "before", the reported message, then the two chosen "after" messages.
    await expect(items.nth(0)).toContainText(before[7].text);
    await expect(items.nth(1)).toContainText(reported.text);
    await expect(items.nth(1)).toContainText('Reported message');
    await expect(items.nth(1)).toHaveAttribute('aria-current', 'true');
    await expect(items.nth(2)).toContainText(after[0].text);
    await expect(items.nth(3)).toContainText(after[1].text);
    // The reporter (A) sent before-8 and after-1 (even and odd positions as built above); B sent after-2.
    await expect(items.nth(0)).toContainText('Reporter');
    await expect(items.nth(2)).toContainText('Reporter');
    await expect(items.nth(3)).not.toContainText('Reporter');
    // Messages that were not chosen are not shown and nothing offers to remove anything.
    await expect(card.getByText(before[0].text)).toHaveCount(0);
    await expect(card.getByRole('button')).toHaveCount(0);
    await shot(page, '04-admin-card');
    await page.context().close();
  });

  test('Include the messages shown chooses every offered message and the ids stored are the whole window', async ({ page }) => {
    const chat = await openPopUp(page);
    const dialog = await toContextStep(page, chat);
    await dialog.getByRole('button', { name: 'Include the messages shown' }).click();
    await expect(dialog.getByText('18 of 20 selected')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'All shown messages included' })).toBeDisabled();
    await shot(page, '05-popup-all-included');
    await dialog.getByRole('button', { name: 'Submit with 18 messages' }).click();
    await expect(page.getByText('18 messages from the chat were included with your report.')).toBeVisible();

    // A second report for the same message while the first is open returns the first and adds the new ids to it
    // (the server's rule): still ONE report, now holding the whole window (the 3 chosen before are inside it).
    const rows = await reportsAbout(reported.id);
    expect(rows).toHaveLength(1);
    const expected = [...before.map((m) => m.id), ...after.slice(0, 10).map((m) => m.id)];
    expect([...(await contextIdsOf(rows[0].id))].sort()).toEqual([...expected].sort());
  });

  test('Back keeps the first step, Escape cancels without sending, and nothing chosen sends no context', async ({ page }) => {
    // A fresh message to report so earlier tests cannot interfere.
    const fresh = `FRESH ${RUN}: one more`;
    const freshId = await send(b, conv, fresh);
    const chat = await openPopUp(page);
    const host = chat.locator('.msg-host', { hasText: fresh });
    await host.scrollIntoViewIfNeeded();
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    await page.getByRole('menu', { name: 'Message actions' }).getByRole('menuitem', { name: 'Report' }).click();
    const first = page.getByRole('dialog', { name: 'Report this message' });
    await first.getByRole('radio', { name: 'Spam or scam' }).check();
    await first.getByRole('button', { name: 'Next' }).click();
    const step = page.getByRole('dialog', { name: 'Add messages for context' });
    await step.getByRole('checkbox').first().check();
    await step.getByRole('button', { name: 'Back' }).click();
    const again = page.getByRole('dialog', { name: 'Report this message' });
    await expect(again.getByRole('radio', { name: 'Spam or scam' })).toBeChecked();
    await again.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('dialog', { name: 'Add messages for context' }).getByText('1 of 20 selected')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await reportsAbout(freshId)).toHaveLength(0);

    // Now send it with nothing chosen: one report, no context rows, no "included" line.
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    await page.getByRole('menu', { name: 'Message actions' }).getByRole('menuitem', { name: 'Report' }).click();
    const second = page.getByRole('dialog', { name: 'Report this message' });
    await second.getByRole('radio', { name: 'Spam or scam' }).check();
    await second.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('dialog', { name: 'Add messages for context' }).getByRole('button', { name: 'Submit report' }).click();
    await expect(page.getByText('Reported — thanks')).toBeVisible();
    await expect(page.getByText(/included with your report/)).toHaveCount(0);
    const rows = await reportsAbout(freshId);
    expect(rows).toHaveLength(1);
    expect(await contextIdsOf(rows[0].id)).toEqual([]);
  });

  test('mobile page at 390px: the step fits, its list scrolls, the buttons stay reachable and there is no sideways scroll', async ({ page }) => {
    const mobileText = `MOBILE ${RUN}: last one`;
    await send(b, conv, mobileText);
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/messages');
    await page.getByText(b.username).click();
    await expect(page.getByText(mobileText)).toBeVisible();
    const host = page.locator('.msg-host', { hasText: mobileText });
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    await page.getByRole('menu', { name: 'Message actions' }).getByRole('menuitem', { name: 'Report' }).click();
    const first = page.getByRole('dialog', { name: 'Report this message' });
    await first.getByRole('radio', { name: 'Hate or abusive language' }).check();
    await first.getByRole('button', { name: 'Next' }).click();
    const step = page.getByRole('dialog', { name: 'Add messages for context' });
    await expect(step).toBeVisible();
    await expect(step.getByRole('button', { name: 'Submit report' })).toBeInViewport();
    await expect(step.getByRole('button', { name: 'Back' })).toBeInViewport();
    await shot(page, '06-mobile-context-step');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await step.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('dialog', { name: 'Report this message' }).getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
