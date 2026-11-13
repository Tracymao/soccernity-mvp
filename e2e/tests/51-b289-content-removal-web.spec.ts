import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import {
  api,
  getAdminToken,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';

// B-289 (Decision Log #483): content a moderator removed, on the web, in real Chrome against the real API,
// Postgres and Redis. Scoped to this work. The removal itself is made the real way: a report through the real
// POST /reports by the person who may report it, then Remove Content through the real admin PATCH. What is asserted
// is what the people in the conversation, the comment thread and the post see afterwards.
//
//   - a removed MESSAGE: the placeholder in the thread (mobile page and Community pop-up) and as the inbox preview,
//     the same for both people, no text, no menu, no edit, no delete, no report;
//   - a removed COMMENT: the placeholder in the thread, no author, no text, no actions;
//   - a removed POST: the notice for its author on a direct visit; everyone else still gets "Post not found".
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'fc-content-removal-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const TAG = '[COPY PENDING LEGAL REVIEW]';
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

async function startConversation(from: Verified, to: Verified): Promise<string> {
  const started = await api('POST', '/conversations', { token: from.token, body: { recipientId: to.userId } });
  expect([200, 201]).toContain(started.status);
  return started.body.id as string;
}

async function send(from: Verified, conversationId: string, text: string): Promise<string> {
  const sent = await api('POST', `/conversations/${conversationId}/messages`, { token: from.token, body: { contentText: text } });
  expect([200, 201]).toContain(sent.status);
  return sent.body.id as string;
}

// Report it the real way, then a moderator removes it the real way. Returns the report id.
async function reportAndRemove(reporter: Verified, targetType: 'message' | 'comment' | 'post', targetId: string): Promise<string> {
  const reported = await api('POST', '/reports', {
    token: reporter.token,
    body: { targetType, targetId, reasonCategory: 'harassment_or_bullying', reason: `Please remove this ${targetType}.` },
  });
  expect(reported.status).toBe(201);
  const reportId = reported.body.id as string;
  const admin = await getAdminToken();
  const actioned = await api('PATCH', `/admin/moderation/reports/${reportId}`, { token: admin, body: { action: 'content_removed' } });
  expect(actioned.status).toBe(200);
  expect(actioned.body.contentRemoval).toBe('removed');
  return reportId;
}

async function openPopUp(page: Page, viewer: Verified, other: Verified) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await loginViaUi(page, viewer.email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
  await page.goto('/community');
  const panel = page.getByRole('complementary', { name: 'Messages' });
  await panel.getByRole('button', { name: new RegExp(other.username) }).click();
  return { panel, chat: page.getByRole('region', { name: `Chat with ${other.username}`, exact: true }) };
}

const removedMessageLabel = 'This message was removed by Soccernity';

test.describe.serial('messages a moderator removed', () => {
  let sender: Verified;
  let recipient: Verified;
  let conversationId = '';
  const BEFORE = `Before ${RUN}: are we training on Saturday?`;
  const REMOVED = `Removed ${RUN}: this text must never reach the page again`;
  const AFTER = `After ${RUN}: see you there`;

  test.beforeAll(async () => {
    sender = await verifiedAdult('rm-sender');
    recipient = await verifiedAdult('rm-recip');
    conversationId = await startConversation(sender, recipient);
    await send(sender, conversationId, BEFORE);
    const removedId = await send(sender, conversationId, REMOVED);
    await send(recipient, conversationId, AFTER);
    await reportAndRemove(recipient, 'message', removedId);
  });

  test('the API answers both people with the stub and nothing else', async () => {
    for (const who of [sender, recipient]) {
      const thread = await api('GET', `/conversations/${conversationId}/messages`, { token: who.token });
      expect(thread.status).toBe(200);
      const stubs = thread.body.items.filter((m: any) => m.removedByModeration);
      expect(stubs).toHaveLength(1);
      // PR #724 (B-296, Decision Log #489): the stub also says whether the VIEWER sent it, and nothing about who did.
      expect(Object.keys(stubs[0]).sort()).toEqual(['id', 'isMine', 'removedByModeration', 'sentAt']);
      expect(stubs[0].isMine).toBe(who === sender);
      expect(JSON.stringify(thread.body)).not.toContain(REMOVED);
    }
  });

  test('the recipient: the Community pop-up shows the placeholder in place, with no menu on it', async ({ page }) => {
    const { chat } = await openPopUp(page, recipient, sender);
    await expect(chat.getByText(AFTER)).toBeVisible();
    const placeholder = chat.getByTestId('removed-placeholder');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toContainText(removedMessageLabel);
    await expect(placeholder).toContainText(TAG);
    await expect(page.getByText('This message was deleted')).toHaveCount(0);
    await expect(page.getByText(REMOVED)).toHaveCount(0);
    // Nothing to press on it: no "...", no menu, not even on a long press or a right click.
    await expect(placeholder.getByRole('button')).toHaveCount(0);
    await placeholder.click({ button: 'right' });
    await expect(page.getByRole('menu')).toHaveCount(0);
    // The two real messages around it keep their own "..." button.
    await expect(chat.getByRole('button', { name: 'Message options' })).toHaveCount(2);
    // In order: before, placeholder, after.
    const text = await chat.innerText();
    expect(text.indexOf(BEFORE)).toBeLessThan(text.indexOf(removedMessageLabel));
    expect(text.indexOf(removedMessageLabel)).toBeLessThan(text.indexOf(AFTER));
    await shot(page, 'D1-message-popup-recipient');
  });

  test('the sender sees the same placeholder on the mobile page, and the inbox preview', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, sender.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto(`/messages/${conversationId}`);
    await expect(page.getByText(BEFORE)).toBeVisible();
    const placeholder = page.getByTestId('removed-placeholder');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toContainText(removedMessageLabel);
    await expect(placeholder).toContainText(TAG);
    await expect(page.getByText(REMOVED)).toHaveCount(0);
    await expect(placeholder.getByRole('button')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, 'M1-message-mobile-sender');

    // The sender cannot edit or delete it either: the API refuses, by code.
    const messages = await api('GET', `/conversations/${conversationId}/messages`, { token: sender.token });
    const stub = messages.body.items.find((m: any) => m.removedByModeration);
    const edit = await api('PATCH', `/conversations/${conversationId}/messages/${stub.id}`, { token: sender.token, body: { contentText: 'sneaky' } });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('message_removed');
    const del = await api('DELETE', `/conversations/${conversationId}/messages/${stub.id}?scope=everyone`, { token: sender.token });
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('message_removed');
  });

  test('the inbox shows the removed wording as the preview when the removed message is the last one', async ({ page }) => {
    // A new thread whose only message is the removed one.
    const loneSender = await verifiedAdult('rm-lone');
    const loneRecipient = await verifiedAdult('rm-lone-r');
    const conv = await startConversation(loneSender, loneRecipient);
    const lone = await send(loneSender, conv, `Lone ${RUN}: only message`);
    await reportAndRemove(loneRecipient, 'message', lone);

    const list = await api('GET', '/conversations', { token: loneRecipient.token });
    expect(list.body.items[0].lastMessage.removedByModeration).toBe(true);
    expect(JSON.stringify(list.body)).not.toContain('Lone');

    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, loneRecipient.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto('/messages');
    const row = page.locator('a, li').filter({ hasText: loneSender.username }).first();
    await expect(row).toContainText(removedMessageLabel);
    await expect(page.getByText(/Lone .*only message/)).toHaveCount(0);
    await expect(page.getByText('This message was deleted')).toHaveCount(0);
    await shot(page, 'M3-inbox-preview');
  });
});

test.describe.serial('a comment and a post a moderator removed', () => {
  let author: Verified;
  let commenter: Verified;
  let bystander: Verified;
  let postId = '';
  let removedPostId = '';
  const POST_TEXT = `Match day ${RUN}: travelling with the team`;
  const COMMENT_LIVE = `Safe travels ${RUN}!`;
  const COMMENT_REMOVED = `Removed comment ${RUN}: never shown again`;
  const POST_REMOVED_TEXT = `Removed post ${RUN}: never shown again`;

  test.beforeAll(async () => {
    author = await verifiedAdult('rm-author');
    commenter = await verifiedAdult('rm-commenter');
    bystander = await verifiedAdult('rm-bystander');
    const created = await api('POST', '/posts', { token: author.token, body: { contentText: POST_TEXT } });
    expect(created.status).toBe(201);
    postId = created.body.id as string;
    const live = await api('POST', `/posts/${postId}/comments`, { token: bystander.token, body: { contentText: COMMENT_LIVE } });
    expect(live.status).toBe(201);
    const removed = await api('POST', `/posts/${postId}/comments`, { token: commenter.token, body: { contentText: COMMENT_REMOVED } });
    expect(removed.status).toBe(201);
    await reportAndRemove(bystander, 'comment', removed.body.id as string);

    const removedPost = await api('POST', '/posts', { token: commenter.token, body: { contentText: POST_REMOVED_TEXT } });
    expect(removedPost.status).toBe(201);
    removedPostId = removedPost.body.id as string;
    await reportAndRemove(bystander, 'post', removedPostId);
  });

  test('the comment thread shows the placeholder: no author, no text, no actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, author.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto(`/posts/${postId}`);
    await expect(page.getByText(POST_TEXT)).toBeVisible();
    await expect(page.getByText(COMMENT_LIVE)).toBeVisible();
    const placeholder = page.getByTestId('removed-placeholder');
    await expect(placeholder).toHaveCount(1);
    await expect(placeholder).toContainText('This comment was removed by Soccernity');
    await expect(placeholder).toContainText(TAG);
    await expect(page.getByText(COMMENT_REMOVED)).toHaveCount(0);
    await expect(page.getByText(commenter.username)).toHaveCount(0);
    await expect(placeholder.getByRole('button')).toHaveCount(0);
    // The author of the post can still hide the live comment: one Hide, none for the removed one.
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, 'M4-comment-mobile');
  });

  test('the comment thread is the same on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginViaUi(page, bystander.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto(`/posts/${postId}`);
    await expect(page.getByTestId('removed-placeholder')).toContainText('This comment was removed by Soccernity');
    await shot(page, 'D3-comment-desktop');
  });

  test('the author of a removed post sees the notice on a direct visit; everyone else sees "Post not found"', async ({ page, browser }) => {
    // The API first: the author gets the stub, everyone else the ordinary 404.
    const asAuthor = await api('GET', `/posts/${removedPostId}`, { token: commenter.token });
    expect(asAuthor.status).toBe(200);
    expect(asAuthor.body).toEqual({ id: removedPostId, removedByModeration: true });
    const asOther = await api('GET', `/posts/${removedPostId}`, { token: author.token });
    expect(asOther.status).toBe(404);

    await page.setViewportSize({ width: 390, height: 844 });
    await loginViaUi(page, commenter.email);
    await page.waitForURL((url) => !/\/login$/.test(url.pathname));
    await page.goto(`/posts/${removedPostId}`);
    const notice = page.getByTestId('removed-placeholder');
    await expect(notice).toContainText('Soccernity removed this post.');
    await expect(notice).toContainText(TAG);
    await expect(page.getByText(POST_REMOVED_TEXT)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /comment|like|save/i })).toHaveCount(0);
    await shot(page, 'M5-post-notice-mobile');
    await page.getByRole('link', { name: 'Back to home' }).click();
    await expect(page).not.toHaveURL(/\/posts\//);

    // Someone else: the one generic "Post not found", no word about a removal.
    const other = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await loginViaUi(other, author.email);
    await other.waitForURL((url) => !/\/login$/.test(url.pathname));
    await other.goto(`/posts/${removedPostId}`);
    await expect(other.getByText(/Post not found/)).toBeVisible();
    await expect(other.getByTestId('removed-placeholder')).toHaveCount(0);
    await expect(other.getByText(/removed/i)).toHaveCount(0);
    await other.close();
  });

  test('a removed post is gone from the feed of the people who follow its author', async () => {
    const follow = await api('POST', `/users/${commenter.userId}/follow`, { token: author.token });
    expect([200, 201]).toContain(follow.status);
    const feed = await api('GET', '/posts/feed', { token: author.token });
    expect(feed.status).toBe(200);
    expect(JSON.stringify(feed.body)).not.toContain(removedPostId);
  });
});
