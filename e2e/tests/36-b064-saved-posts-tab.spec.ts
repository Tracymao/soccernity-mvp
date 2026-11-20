import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import {
  api,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';

// B-064 (Decision Log #378, #22): the Saved tab on the OWN profile, in real Chrome against the real API, Postgres
// and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// Posts and saves are made through the real API (POST /posts, POST /posts/:id/save); everything the tab shows comes
// from the real GET /users/:id/saved-posts. A post that its author deleted after it was saved must be absent.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b064-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

interface Member extends Account {
  token: string;
  username: string;
}

/** A verified adult with a username, so the server lets them post and save. */
async function member(label: string): Promise<Member> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const token = (await me(acct)).token;
  const username = uniqueUsername(label.slice(0, 4));
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...acct, token, username };
}

async function makePost(author: Member, text: string): Promise<string> {
  const res = await api('POST', '/posts', { token: author.token, body: { contentText: text } });
  expect([200, 201]).toContain(res.status);
  return res.body.id as string;
}

async function save(who: Member, postId: string): Promise<void> {
  const res = await api('POST', `/posts/${postId}/save`, { token: who.token });
  expect([200, 201]).toContain(res.status);
}

/** Logs in through the form and waits until the app has left /login (the session lives in memory, so a reload
 *  before that would restore nothing). */
async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

async function openSavedTab(page: Page): Promise<void> {
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Saved' }).click();
}

test.describe.serial('Saved tab on the own profile', () => {
  let viewer: Member;
  let author: Member;
  let saved: { id: string; text: string }[] = [];
  let deletedText = '';

  test.beforeAll(async () => {
    viewer = await member('svw');
    author = await member('sau');
    // 22 saved posts, so the first page (20) has a next page. Saved in order, so the LAST one saved is the first shown.
    for (let i = 1; i <= 22; i++) {
      const text = `Saved post number ${i}`;
      const id = await makePost(author, text);
      saved.push({ id, text });
      await save(viewer, id);
    }
    // A post saved and then deleted by its author: the server must leave it out.
    deletedText = 'This post was deleted after it was saved';
    const gone = await makePost(author, deletedText);
    await save(viewer, gone);
    expect([200, 204]).toContain((await api('DELETE', `/posts/${gone}`, { token: author.token })).status);
  });

  test('the server answers 403 for another person\'s saved posts, so the tab is own-profile only', async () => {
    const res = await api('GET', `/users/${author.userId}/saved-posts`, { token: viewer.token });
    expect(res.status).toBe(403);
  });

  test('lists the saved posts newest-saved first, leaves out the deleted one, and loads the next page', async ({ page }) => {
    await signIn(page, viewer.email);
    await openSavedTab(page);

    await expect(page.getByText('Saved post number 22', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved post number 3', { exact: true })).toBeVisible();
    // 20 on the first page: numbers 22 down to 3.
    await expect(page.getByText('Saved post number 2', { exact: true })).toHaveCount(0);
    await expect(page.getByText(deletedText)).toHaveCount(0);
    // Newest saved is first.
    const first = page.locator('article.post').first();
    await expect(first).toContainText('Saved post number 22');
    // Every card offers the pressed Saved button.
    await expect(page.locator('article.post').first().getByRole('button', { name: /Saved/ })).toBeVisible();
    await shot(page, '01-list-desktop');

    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(page.getByText('Saved post number 2', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved post number 1', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
    await expect(page.getByText(deletedText)).toHaveCount(0);
    expect(await page.locator('article.post').count()).toBe(22);
  });

  test('unsaving from a card removes it now and after a reload', async ({ page }) => {
    await signIn(page, viewer.email);
    await openSavedTab(page);
    const card = page.locator('article.post', { hasText: 'Saved post number 21' });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: /Saved/ }).click();
    await expect(page.getByText('Saved post number 21', { exact: true })).toHaveCount(0);

    const after = await api('GET', `/users/${viewer.userId}/saved-posts?limit=50`, { token: viewer.token });
    expect(after.status).toBe(200);
    const texts = (after.body.items as { post: { contentText: string } }[]).map((i) => i.post.contentText);
    expect(texts).not.toContain('Saved post number 21');
    expect(texts).toHaveLength(21);

    await openSavedTab(page);
    await expect(page.getByText('Saved post number 22', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved post number 21', { exact: true })).toHaveCount(0);
  });

  test('at 390px the tab fits the screen, with the tab strip and cards visible', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, viewer.email);
    await openSavedTab(page);
    await expect(page.getByText('Saved post number 22', { exact: true })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, '02-list-390');
  });

  test('a person with nothing saved sees the empty state', async ({ page }) => {
    const empty = await member('sem');
    await signIn(page, empty.email);
    await openSavedTab(page);
    await expect(page.getByRole('status').filter({ hasText: /haven.t saved any posts yet/i })).toBeVisible();
    await shot(page, '03-empty');
  });

  test('someone else\'s profile has no Saved tab', async ({ page }) => {
    await signIn(page, viewer.email);
    await page.goto(`/users/${author.userId}`);
    await expect(page.getByRole('heading', { name: author.username })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Saved' })).toHaveCount(0);
  });
});
