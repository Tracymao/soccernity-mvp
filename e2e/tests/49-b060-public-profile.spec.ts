import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-060 Public profile toggle, the web leg (backend: PR #689): the live switch on Settings > Privacy, the private
// card a non-follower sees on /users/:id, the Follow-then-full-profile flow, the owner's one-line note, the
// under-18 variant, and the ordinary "Post not found" for a hidden post. Real Chrome against the real API,
// Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// REAL: the saved setting (read back through GET /users/me/settings and from Postgres), the server deciding who
// gets the minimal card (a non-follower) and who gets the full profile (a follower, the owner), the follow rows,
// the report row, the hidden post. STUBBED IN THE BROWSER: the failed save (a 500 on the PATCH), which cannot be
// produced against a healthy server.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b060-public-profile-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

type Verified = Account & { token: string; username: string };

async function verifiedAdult(label: string): Promise<Verified> {
  const acct = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(acct);
  const { token } = await me(acct);
  const username = uniqueUsername(label);
  expect((await api('PATCH', `/users/${acct.userId}`, { token, body: { username } })).status).toBe(200);
  return { ...acct, token, username };
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await page.waitForURL((url) => !/\/login$/.test(url.pathname));
}

async function setPublic(who: Verified, on: boolean): Promise<void> {
  const res = await api('PATCH', '/users/me/settings', { token: who.token, body: { isProfilePublic: on } });
  expect(res.status).toBe(200);
  expect(res.body.isProfilePublic).toBe(on);
}

const BIO = 'Winger from Lagos, training Saturdays';

test.describe.serial('Public profile', () => {
  let owner: Verified; // turns the profile private
  let stranger: Verified; // does not follow
  let follower: Verified; // follows from the start
  let postId = '';

  test.beforeAll(async () => {
    owner = await verifiedAdult('pp-own');
    stranger = await verifiedAdult('pp-str');
    follower = await verifiedAdult('pp-fol');
    expect((await api('PATCH', `/users/${owner.userId}`, { token: owner.token, body: { bio: BIO } })).status).toBe(200);
    const post = await api('POST', '/posts', { token: owner.token, body: { contentText: 'Match day at Rowe Park' } });
    expect([200, 201]).toContain(post.status);
    postId = post.body.id as string;
    expect((await api('POST', `/users/${owner.userId}/follow`, { token: follower.token })).status).toBe(200);
  });

  test('Settings: a live switch, On by default, that saves, shows Saving, and survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, owner.email);
    await page.goto('/settings/privacy');

    const toggle = page.getByRole('switch', { name: 'Public profile' });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(
      page.getByText('When this is off, only people who follow you can see your profile, posts, and activity.'),
    ).toBeVisible();
    // Every other row is exactly as it was: Marketing emails is still the disabled "Coming soon" row.
    await expect(page.getByText('Coming soon')).toBeVisible();
    expect((await api('GET', '/users/me/settings', { token: owner.token })).body.isProfilePublic).toBe(true);
    await shot(page, '01-toggle-on-desktop');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toBeEnabled();
    await expect.poll(async () => (await api('GET', '/users/me/settings', { token: owner.token })).body.isProfilePublic).toBe(false);
    expect((await db().user.findUnique({ where: { id: owner.userId }, select: { isProfilePublic: true } })).isProfilePublic).toBe(false);
    await shot(page, '02-toggle-off-desktop');

    await page.reload();
    await expect(page.getByRole('switch', { name: 'Public profile' })).toHaveAttribute('aria-checked', 'false');
  });

  test('Own profile: one small line while the profile is private', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, owner.email);
    await page.goto('/profile');
    await expect(page.getByTestId('private-profile-note')).toContainText('Only people who follow you can see your profile.');
    await shot(page, '03-own-profile-note-desktop');
  });

  test('Non-follower: the private card only, nothing else of the profile (desktop)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, stranger.email);
    await page.goto(`/users/${owner.userId}`);

    const card = page.getByTestId('private-profile');
    await expect(card).toBeVisible();
    await expect(page.getByRole('heading', { name: owner.username })).toBeVisible();
    await expect(page.getByText('This profile is private')).toBeVisible();
    await expect(page.getByText('Follow to see their profile, posts and activity.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
    await expect(page.getByText(BIO)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Message' })).toHaveCount(0);
    await shot(page, '04-private-card-desktop');

    // The real server answer, not a stub: the minimal card.
    const real = await api('GET', `/users/${owner.userId}/public-profile`, { token: stranger.token });
    expect(real.status).toBe(200);
    expect(real.body.isPrivate).toBe(true);
    expect(real.body.bio).toBeNull();
  });

  test('Private card: the More menu has ONLY Report user and Block, and Report user files a user report', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, stranger.email);
    await page.goto(`/users/${owner.userId}`);
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Report user', `Block ${owner.username}`]);
    await shot(page, '05-private-card-menu-desktop');

    await page.getByRole('menuitem', { name: 'Report user' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Report this user');
    await dialog.getByRole('radio').first().check();
    await dialog.getByRole('button', { name: 'Submit report' }).click();
    await expect(dialog).toContainText('Reported');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);

    const rows = await db().report.findMany({ where: { reporterId: stranger.userId, targetType: 'user', targetId: owner.userId } });
    expect(rows).toHaveLength(1);
  });

  test('Non-follower: the same card at 390 px, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signIn(page, stranger.email);
    await page.goto(`/users/${owner.userId}`);
    await expect(page.getByTestId('private-profile')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, '06-private-card-mobile');
  });

  test('A hidden post is the ordinary "Post not found" for a non-follower, with no hint about privacy', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, stranger.email);
    await page.goto(`/posts/${postId}`);
    await expect(page.getByText(/Post not found/)).toBeVisible();
    await expect(page.getByText(/private/i)).toHaveCount(0);
    await shot(page, '07-hidden-post-desktop');
    const missing = await api('GET', `/posts/00000000-0000-4000-8000-000000000000`, { token: stranger.token });
    const hidden = await api('GET', `/posts/${postId}`, { token: stranger.token });
    expect(hidden.status).toBe(404);
    expect(hidden.status).toBe(missing.status);
  });

  test('Following reveals the full profile (Follow, then the page reads the profile again)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, stranger.email);
    await page.goto(`/users/${owner.userId}`);
    await page.getByRole('button', { name: 'Follow', exact: true }).click();

    await expect(page.getByText(BIO)).toBeVisible();
    await expect(page.getByTestId('private-profile')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Following' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Message' })).toBeVisible();
    expect(await db().follow.count({ where: { followerId: stranger.userId, followeeId: owner.userId } })).toBe(1);
    await shot(page, '08-after-follow-desktop');

    // And the hidden post is now visible to them.
    await page.goto(`/posts/${postId}`);
    await expect(page.getByText('Match day at Rowe Park')).toBeVisible();
  });

  test('Unfollowing turns the profile back into the private card', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, stranger.email);
    await page.goto(`/users/${owner.userId}`);
    await page.getByRole('button', { name: 'Following' }).click();
    await expect(page.getByText('This profile is private')).toBeVisible();
    await expect(page.getByText(BIO)).toHaveCount(0);
    expect(await db().follow.count({ where: { followerId: stranger.userId, followeeId: owner.userId } })).toBe(0);
  });

  test('A follower sees the normal profile with no extra mark', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, follower.email);
    await page.goto(`/users/${owner.userId}`);
    await expect(page.getByText(BIO)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Following' })).toBeVisible();
    await expect(page.getByText(/private/i)).toHaveCount(0);
    await shot(page, '09-follower-desktop');
  });

  test('A public profile is unchanged for a stranger once the owner turns it back on', async ({ page }) => {
    await setPublic(owner, true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, stranger.email);
    await page.goto(`/users/${owner.userId}`);
    await expect(page.getByText(BIO)).toBeVisible();
    await expect(page.getByTestId('private-profile')).toHaveCount(0);
    await page.getByRole('button', { name: 'More options' }).click();
    await expect(page.getByRole('menuitem')).toHaveText(['Copy Profile Link', `Block ${owner.username}`]);
  });

  test('Settings: a failed save puts the switch back and shows the banner above the row (stubbed 500)', async ({ page }) => {
    await setPublic(owner, true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, owner.email);
    await page.goto('/settings/privacy');
    const toggle = page.getByRole('switch', { name: 'Public profile' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await page.route('**/users/me/settings', (route) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{}' }) : route.continue(),
    );
    await toggle.click();

    const banner = page.getByRole('alert');
    await expect(banner).toContainText('Couldn’t save your change. Your setting is back to what it was.');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeEnabled();
    await shot(page, '10-save-failed-desktop');
    expect((await api('GET', '/users/me/settings', { token: owner.token })).body.isProfilePublic).toBe(true);
  });

  test('Settings at 390 px: the row and the switch, no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await signIn(page, owner.email);
    await page.goto('/settings/privacy');
    await expect(page.getByRole('switch', { name: 'Public profile' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(page, '11-toggle-mobile');
  });

  test('Under 18: no Public profile row, and the server refuses the change with the stable code', async ({ page }) => {
    const minor = await registerViaApi({ age: 15, label: 'pp-min' });
    await signIn(page, minor.email);
    await page.goto('/settings/privacy');
    await expect(page.getByText('Guardian approval')).toBeVisible();
    await expect(page.getByText('Public profile')).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Public profile' })).toHaveCount(0);
    await shot(page, '12-under-18-desktop');

    const { token } = await me(minor);
    const refused = await api('PATCH', '/users/me/settings', { token, body: { isProfilePublic: false } });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('profile_visibility_not_available');
    expect((await api('GET', '/users/me/settings', { token })).body.isProfilePublic).toBe(true);
  });
});
