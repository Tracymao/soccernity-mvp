import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-067 (Decision Log #472 (b)): edit a message, delete for me, delete for everyone, delete chat, and the
// conversation actions menu, on the Community pop-up and on the mobile conversation page, in real Chrome against
// the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// Four verified adults with usernames: A is the person using the screens; B, C, D and E are the other people, one
// per scenario so the scenarios cannot interfere (a block or a deleted chat would change the others).
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b067-screens');
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

async function threadFor(who: Verified, conversationId: string): Promise<any[]> {
  const res = await api('GET', `/conversations/${conversationId}/messages`, { token: who.token });
  expect(res.status).toBe(200);
  return res.body.items as any[];
}

test.describe.serial('Message actions', () => {
  let a: Verified;
  let b: Verified;
  let c: Verified;
  let d: Verified;
  let e: Verified;
  let convB = '';
  let convC = '';
  let convD = '';
  let convE = '';
  let bTheirs = '';
  let aMine = '';
  let aMineForEveryone = '';
  let aMineLate = '';

  test.beforeAll(async () => {
    a = await verifiedAdult('act-a');
    b = await verifiedAdult('act-b');
    c = await verifiedAdult('act-c');
    d = await verifiedAdult('act-d');
    e = await verifiedAdult('act-e');
    convB = await conversationWith(b, a);
    bTheirs = await send(b, convB, 'B says: are we still on for Saturday');
    aMine = await send(a, convB, 'A says: yes, seven at Rowe Park');
    aMineForEveryone = await send(a, convB, 'A says: oops wrong chat');
    aMineLate = await send(a, convB, 'A says: bring the bibs');
    convC = await conversationWith(c, a);
    await send(c, convC, 'C says hello');
    convD = await conversationWith(d, a);
    await send(d, convD, 'D says hello');
    convE = await conversationWith(e, a);
    await send(e, convE, 'E says hello');
  });

  async function openPopUp(page: Page, who: Verified) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/community');
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(who.username) }).click();
    return { panel, chat: page.getByRole('region', { name: `Chat with ${who.username}`, exact: true }) };
  }

  async function openMenuOnBubble(page: Page, chat: ReturnType<Page['getByRole']>, text: string) {
    const host = chat.locator('.msg-host', { hasText: text });
    await host.hover();
    await host.getByRole('button', { name: 'Message options' }).click();
    return page.getByRole('menu', { name: 'Message actions' });
  }

  test('pop-up: the menu offers Edit and Delete on my message and only Delete for me on theirs', async ({ page }) => {
    const { chat } = await openPopUp(page, b);
    await expect(chat.getByText('A says: yes, seven at Rowe Park')).toBeVisible();

    const mine = await openMenuOnBubble(page, chat, 'A says: yes, seven at Rowe Park');
    await expect(mine.getByRole('menuitem', { name: /Edit/ })).toBeEnabled();
    await expect(mine.getByText('You can edit for 15 minutes')).toBeVisible();
    await expect(mine.getByRole('menuitem', { name: 'Delete', exact: true })).toBeVisible();
    await shot(page, '01-popup-own-menu');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toHaveCount(0);

    const theirs = await openMenuOnBubble(page, chat, 'B says: are we still on for Saturday');
    await expect(theirs.getByRole('menuitem', { name: /Delete for me/ })).toBeVisible();
    await expect(theirs.getByText('Only you will stop seeing it')).toBeVisible();
    await expect(theirs.getByRole('menuitem', { name: /Edit/ })).toHaveCount(0);
    await expect(theirs.getByText(/report/i)).toHaveCount(0);
    await shot(page, '02-popup-their-menu');
  });

  test('pop-up: editing a message saves it, labels it Edited and the other person sees the new text', async ({ page }) => {
    const { chat, panel } = await openPopUp(page, b);
    const menu = await openMenuOnBubble(page, chat, 'A says: yes, seven at Rowe Park');
    await menu.getByRole('menuitem', { name: /Edit/ }).click();

    await expect(chat.getByText('Editing message')).toBeVisible();
    const input = chat.getByRole('textbox', { name: 'Edit message text' });
    await expect(input).toHaveValue('A says: yes, seven at Rowe Park');
    await expect(chat.getByRole('button', { name: 'Save' })).toBeDisabled();
    await shot(page, '03-popup-edit-mode');

    await input.fill('A says: yes, half seven at Rowe Park');
    await chat.getByRole('button', { name: 'Save' }).click();

    await expect(chat.getByText('A says: yes, half seven at Rowe Park')).toBeVisible();
    await expect(chat.getByText('Edited', { exact: true })).toBeVisible();
    await expect(chat.getByText('Editing message')).toHaveCount(0);
    // The sidebar follows only when the edited message is the last one; it is not, so the preview is unchanged.
    await expect(panel.getByText(/bring the bibs/)).toBeVisible();
    await shot(page, '04-popup-edited');

    const row = await db().message.findUnique({ where: { id: aMine } });
    expect(row.editedAt).not.toBeNull();
    // The server keeps the original; the screen never shows it.
    expect(row.originalContentText).toBe('A says: yes, seven at Rowe Park');
    await expect(page.getByText('A says: yes, seven at Rowe Park')).toHaveCount(0);

    const theirView = (await threadFor(b, convB)).find((m) => m.id === aMine);
    expect(theirView.contentText).toBe('A says: yes, half seven at Rowe Park');
    expect(theirView.editedAt).not.toBeNull();
  });

  test('pop-up: when the server says the 15 minutes are over, the window-closed line shows and Save stays off', async ({ page }) => {
    const { chat } = await openPopUp(page, b);
    const menu = await openMenuOnBubble(page, chat, 'A says: bring the bibs');
    await expect(menu.getByRole('menuitem', { name: /Edit/ })).toBeEnabled();
    await menu.getByRole('menuitem', { name: /Edit/ }).click();

    // The page's own clock still says "recent"; the server's clock decides. Move the send time back 20 minutes.
    await db().message.update({ where: { id: aMineLate }, data: { sentAt: new Date(Date.now() - 20 * 60_000) } });

    await chat.getByRole('textbox', { name: 'Edit message text' }).fill('A says: bring the bibs and the bag');
    await chat.getByRole('button', { name: 'Save' }).click();

    await expect(chat.getByRole('alert')).toHaveText('You can only edit a message for 15 minutes. This one can’t be changed now.');
    await expect(chat.getByRole('button', { name: 'Save' })).toBeDisabled();
    await shot(page, '05-popup-edit-window-closed');
    await chat.getByRole('button', { name: 'Cancel' }).click();
    await expect(chat.getByRole('textbox', { name: /Write a message/ })).toBeVisible();

    const row = await db().message.findUnique({ where: { id: aMineLate } });
    expect(row.editedAt).toBeNull();
    expect(row.contentText).toBe('A says: bring the bibs');
  });

  test('pop-up: Delete for me hides a message for me only', async ({ page }) => {
    const { chat } = await openPopUp(page, b);
    const menu = await openMenuOnBubble(page, chat, 'B says: are we still on for Saturday');
    await menu.getByRole('menuitem', { name: /Delete for me/ }).click();

    const sheet = page.getByRole('dialog', { name: 'Delete message' });
    await expect(sheet.getByText('You can delete this message for yourself.')).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Delete for everyone' })).toHaveCount(0);
    await shot(page, '06-popup-delete-choice-theirs');
    await sheet.getByRole('button', { name: 'Delete for me' }).click();

    const confirm = page.getByRole('dialog', { name: 'Delete for me?' });
    await expect(confirm.getByText(/will still see it/)).toBeVisible();
    await confirm.getByRole('button', { name: 'Delete for me' }).click();

    await expect(chat.getByText('B says: are we still on for Saturday')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);

    expect(await db().messageHide.count({ where: { userId: a.userId, messageId: bTheirs } })).toBe(1);
    expect((await threadFor(a, convB)).some((m) => m.id === bTheirs)).toBe(false);
    expect((await threadFor(b, convB)).some((m) => m.id === bTheirs)).toBe(true);

    // Still gone after a reload: the server omits it.
    await page.reload();
    await page.getByRole('complementary', { name: 'Messages' }).getByRole('button', { name: new RegExp(b.username) }).click();
    await expect(page.getByRole('region', { name: `Chat with ${b.username}`, exact: true }).getByText('A says: yes, half seven at Rowe Park')).toBeVisible();
    await expect(page.getByText('B says: are we still on for Saturday')).toHaveCount(0);
  });

  test('pop-up: Delete for everyone asks first, leaves the placeholder for both people, and the server keeps the row', async ({ page }) => {
    const { chat } = await openPopUp(page, b);
    const menu = await openMenuOnBubble(page, chat, 'A says: oops wrong chat');
    await menu.getByRole('menuitem', { name: 'Delete', exact: true }).click();

    const sheet = page.getByRole('dialog', { name: 'Delete message' });
    await expect(sheet.getByRole('button', { name: 'Delete for me' })).toBeVisible();
    await shot(page, '07-popup-delete-choice-own');
    await sheet.getByRole('button', { name: 'Delete for everyone' }).click();

    const confirm = page.getByRole('dialog', { name: 'Delete for everyone?' });
    await expect(confirm.getByText(/This can’t be undone\./)).toBeVisible();
    await expect(confirm.getByText('We may keep a copy of the original for safety and legal reasons. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await shot(page, '08-popup-delete-everyone-confirm');
    await confirm.getByRole('button', { name: 'Delete for everyone' }).click();

    await expect(chat.getByText('This message was deleted')).toBeVisible();
    await expect(chat.getByText('A says: oops wrong chat')).toHaveCount(0);
    await shot(page, '09-popup-placeholder');

    const row = await db().message.findUnique({ where: { id: aMineForEveryone } });
    expect(row.deletedForEveryoneAt).not.toBeNull();
    expect(row.contentText).toBe('A says: oops wrong chat'); // the server keeps it; nothing here promises erasure
    const theirView = (await threadFor(b, convB)).find((m) => m.id === aMineForEveryone);
    expect(theirView).toMatchObject({ deletedForEveryone: true, contentText: null });
  });

  test('pop-up: the conversation menu marks read, opens the profile and blocks', async ({ page }) => {
    const { chat } = await openPopUp(page, c);
    await expect(chat.getByText('C says hello')).toBeVisible();

    await chat.getByRole('button', { name: 'Conversation options' }).click();
    const menu = page.getByRole('menu', { name: 'Conversation actions' });
    await expect(menu.getByRole('menuitem', { name: 'Mark as Read' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'View User Profile' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Block User' })).toBeVisible();
    await expect(menu.getByText('Removes the chat for you only')).toBeVisible();
    await shot(page, '10-popup-conversation-menu');

    await menu.getByRole('menuitem', { name: 'Mark as Read' }).click();
    await expect(page.getByText('Marked as read.')).toBeVisible();

    await chat.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByRole('menuitem', { name: 'Block User' }).click();
    const dialog = page.getByRole('dialog', { name: `Block ${c.username}?` });
    await expect(dialog).toBeVisible();
    await shot(page, '11-popup-block-dialog');
    await dialog.getByRole('button', { name: 'Block' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Blocked.')).toBeVisible();
    expect(await db().block.count({ where: { blockerId: a.userId, blockedId: c.userId } })).toBe(1);

    await chat.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByRole('menuitem', { name: 'View User Profile' }).click();
    await expect(page).toHaveURL(new RegExp(`/users/${c.userId}$`));
  });

  test('pop-up: Delete chat removes it for me only; a new message from them brings it back with just the new message', async ({ page }) => {
    const { chat, panel } = await openPopUp(page, d);
    await expect(chat.getByText('D says hello')).toBeVisible();

    await chat.getByRole('button', { name: 'Conversation options' }).click();
    await page.getByRole('menuitem', { name: /Delete Chat/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete this chat?' });
    await expect(dialog.getByText(/keeps their copy/)).toBeVisible();
    await shot(page, '12-popup-delete-chat-confirm');
    await dialog.getByRole('button', { name: 'Delete chat' }).click();

    await expect(page.getByRole('region', { name: new RegExp(`Chat with ${d.username}`) })).toHaveCount(0);
    await expect(panel.getByText(d.username)).toHaveCount(0);
    expect(await db().conversationHide.count({ where: { userId: a.userId, conversationId: convD } })).toBe(1);
    // D's own copy is untouched.
    expect((await threadFor(d, convD)).length).toBe(1);

    await send(d, convD, 'D says: are you there');
    await page.reload();
    const sidebar = page.getByRole('complementary', { name: 'Messages' });
    await expect(sidebar.getByText(d.username)).toBeVisible();
    await sidebar.getByRole('button', { name: new RegExp(d.username) }).click();
    const reopened = page.getByRole('region', { name: `Chat with ${d.username}`, exact: true });
    await expect(reopened.getByText('D says: are you there')).toBeVisible();
    await expect(reopened.getByText('D says hello')).toHaveCount(0);
  });

  test('mobile page: long-press opens the menu, edit saves, the time line says Edited, and Delete chat goes back to the inbox', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/messages');
    await page.getByText(e.username).click();
    await expect(page).toHaveURL(/\/messages\/[^/]+$/);

    const mine = await send(a, convE, 'A says: running ten minutes late');
    await page.reload();
    await expect(page.getByText('A says: running ten minutes late')).toBeVisible();

    // A long-press: touchstart, hold, no touchend. (Reload loses the router state, so the header is generic.)
    const host = page.locator('.msg-host', { hasText: 'A says: running ten minutes late' });
    await host.dispatchEvent('touchstart');
    await page.waitForTimeout(700);
    const menu = page.getByRole('menu', { name: 'Message actions' });
    await expect(menu).toBeVisible();
    await shot(page, '13-mobile-long-press-menu');
    await menu.getByRole('menuitem', { name: /Edit/ }).click();

    await expect(page.getByText('Editing message')).toBeVisible();
    await page.getByRole('textbox', { name: 'Edit message text' }).fill('A says: running five minutes late');
    await shot(page, '14-mobile-edit-mode');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('A says: running five minutes late')).toBeVisible();
    await expect(page.getByText(/· Edited/)).toBeVisible();
    await shot(page, '15-mobile-edited');
    expect((await db().message.findUnique({ where: { id: mine } })).editedAt).not.toBeNull();

    // Delete for everyone from the mobile page: the choice is a sheet at the bottom of the screen.
    const second = await send(a, convE, 'A says: ignore that');
    await page.reload();
    await expect(page.getByText('A says: ignore that')).toBeVisible();
    const host2 = page.locator('.msg-host', { hasText: 'A says: ignore that' });
    await host2.hover();
    await host2.getByRole('button', { name: 'Message options' }).click();
    await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Delete message' });
    await expect(sheet).toBeVisible();
    await shot(page, '16-mobile-delete-sheet');
    await sheet.getByRole('button', { name: 'Delete for everyone' }).click();
    await page.getByRole('dialog', { name: 'Delete for everyone?' }).getByRole('button', { name: 'Delete for everyone' }).click();
    await expect(page.getByText('This message was deleted')).toBeVisible();
    await shot(page, '17-mobile-placeholder');
    expect((await db().message.findUnique({ where: { id: second } })).deletedForEveryoneAt).not.toBeNull();

    // Conversation menu, then Delete chat: back to the inbox, conversation gone from it.
    await page.getByRole('button', { name: 'Conversation options' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mark as Read' })).toBeVisible();
    await shot(page, '18-mobile-conversation-menu');
    await page.getByRole('menuitem', { name: /Delete Chat/ }).click();
    await page.getByRole('dialog', { name: 'Delete this chat?' }).getByRole('button', { name: 'Delete chat' }).click();
    await expect(page).toHaveURL(/\/messages$/);
    await expect(page.getByText(e.username)).toHaveCount(0);
    expect(await db().conversationHide.count({ where: { userId: a.userId, conversationId: convE } })).toBe(1);
  });
});
