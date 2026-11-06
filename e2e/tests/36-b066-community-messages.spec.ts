import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-066 (Decision Log #378): the message sidebar and chat pop-ups on the Community page, in real Chrome against
// the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// Three verified adults with usernames: A is the person using the page; B and C each start a conversation with
// A and send it a message, so A has two unread conversations. Everything on screen comes from the real
// GET /conversations and /conversations/:id/messages.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b066-screens');
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

/** `from` starts a conversation with `to` and sends one message; returns the conversation id. */
async function startAndSend(from: Verified, to: Verified, text: string): Promise<string> {
  const started = await api('POST', '/conversations', { token: from.token, body: { recipientId: to.userId } });
  expect([200, 201]).toContain(started.status);
  const id = started.body.id as string;
  const sent = await api('POST', `/conversations/${id}/messages`, { token: from.token, body: { contentText: text } });
  expect([200, 201]).toContain(sent.status);
  return id;
}

test.describe.serial('Community message sidebar and chat pop-ups', () => {
  let a: Verified;
  let b: Verified;
  let c: Verified;
  let convB = '';
  let convC = '';

  test.beforeAll(async () => {
    a = await verifiedAdult('msg-a');
    b = await verifiedAdult('msg-b');
    c = await verifiedAdult('msg-c');
    convB = await startAndSend(b, a, 'Morning from B');
    convC = await startAndSend(c, a, 'Hey from C');
  });

  async function openCommunity(page: Page) {
    await loginViaUi(page, a.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/community');
  }

  test('the sidebar lists both conversations with their last message and an unread dot', async ({ page }) => {
    await openCommunity(page);
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await expect(panel.getByRole('heading', { name: 'Messages' })).toBeVisible();
    await expect(panel.getByText(b.username)).toBeVisible();
    await expect(panel.getByText(c.username)).toBeVisible();
    await expect(panel.getByText('Morning from B')).toBeVisible();
    await expect(panel.getByText('Hey from C')).toBeVisible();
    await expect(panel.getByAltText('1 unread')).toHaveCount(2);
    await expect(panel.getByRole('link', { name: 'New message' })).toHaveAttribute('href', '/messages/new');
    await shot(page, '01-sidebar');
  });

  test('opening a conversation shows its messages, marks it read and clears the dot', async ({ page }) => {
    await openCommunity(page);
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(b.username) }).click();

    const chat = page.getByRole('region', { name: `Chat with ${b.username}` });
    await expect(chat.getByText('Morning from B')).toBeVisible();
    await expect(panel.getByAltText('1 unread')).toHaveCount(1);
    await shot(page, '02-chat-open');

    // The server's own record: B's message to A is now read.
    await expect
      .poll(async () => (await db().message.findMany({ where: { conversationId: convB, senderId: b.userId } }))[0].readAt !== null)
      .toBe(true);
  });

  test('sending a message from the pop-up reaches the other person and updates the sidebar', async ({ page }) => {
    await openCommunity(page);
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(b.username) }).click();
    const chat = page.getByRole('region', { name: `Chat with ${b.username}` });
    await expect(chat.getByText('Morning from B')).toBeVisible();

    await chat.getByLabel(`Write a message to ${b.username}`).fill('Morning back from A');
    await chat.getByRole('button', { name: 'Send' }).click();
    await expect(chat.getByText('Morning back from A')).toBeVisible();
    await expect(panel.getByText('You: Morning back from A')).toBeVisible();

    // B sees it through the real API.
    const thread = await api('GET', `/conversations/${convB}/messages`, { token: b.token });
    expect(JSON.stringify(thread.body)).toContain('Morning back from A');
    await shot(page, '03-sent');
  });

  test('a second chat minimises the first; the bar expands it again; close removes it', async ({ page }) => {
    await openCommunity(page);
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('button', { name: new RegExp(b.username) }).click();
    await expect(page.getByRole('region', { name: `Chat with ${b.username}` })).toBeVisible();
    await panel.getByRole('button', { name: new RegExp(c.username) }).click();

    await expect(page.getByRole('region', { name: `Chat with ${c.username}` })).toBeVisible();
    const bar = page.getByRole('region', { name: `Chat with ${b.username} (minimised)` });
    await expect(bar).toBeVisible();
    await shot(page, '04-two-chats');

    await bar.getByRole('button', { name: `Open chat with ${b.username}` }).click();
    await expect(page.getByRole('region', { name: `Chat with ${b.username}`, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: `Chat with ${c.username} (minimised)` })).toBeVisible();

    await page.getByRole('region', { name: `Chat with ${b.username}`, exact: true }).getByRole('button', { name: 'Close chat' }).click();
    await expect(page.getByRole('region', { name: new RegExp(`Chat with ${b.username}`) })).toHaveCount(0);
  });

  test('the search box filters the loaded conversations by name', async ({ page }) => {
    await openCommunity(page);
    const panel = page.getByRole('complementary', { name: 'Messages' });
    await panel.getByRole('searchbox', { name: 'Search messages' }).fill(c.username);
    await expect(panel.getByText(c.username)).toBeVisible();
    await expect(panel.getByText(b.username)).toHaveCount(0);
    await panel.getByRole('searchbox', { name: 'Search messages' }).fill('no-such-person-zzz');
    await expect(panel.getByText('No conversations match that name.')).toBeVisible();
  });

  test('at phone width there is no sidebar and no conversations request; /messages still works', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let conversationRequests = 0;
    page.on('request', (req) => {
      if (/\/conversations(\?|$)/.test(new URL(req.url()).pathname + new URL(req.url()).search)) conversationRequests += 1;
    });
    await openCommunity(page);
    await expect(page.getByText(/Your feed is quiet|Post something|Loading your feed/).first()).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Messages' })).toHaveCount(0);
    expect(conversationRequests).toBe(0);

    await page.goto('/messages');
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible();
    await expect(page.getByText(b.username)).toBeVisible();
    await shot(page, '05-mobile-messages-page');
  });
});
