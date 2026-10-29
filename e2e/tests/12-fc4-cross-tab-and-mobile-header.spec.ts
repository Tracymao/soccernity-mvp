import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page, type Request } from '@playwright/test';
import {
  api,
  heldAccessToken,
  loginViaUi,
  me,
  plantAccessToken,
  refreshWithCookie,
  registerViaApi,
  uniqueUsername,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { URLS, USER_PASSWORD } from '../support/stack';

// FC4 (build register B-164, B-178; Decision Log #408 items 2 and 8).
//   1. Two tabs sharing a "Stay signed in" session must never both rotate the same refresh token.
//   2. The mobile header (<= 820px): signed in = logo, search, messages, avatar that opens the drawer,
//      no nine-icon row; logged out = Login + a menu control that opens the visitor drawer.
// Screenshots (evidence for the visual check against the Figma K4 frames) go to docs/fc4-screens/.

const SHOTS = path.resolve(__dirname, '..', '..', 'docs', 'fc4-screens');
fs.mkdirSync(SHOTS, { recursive: true });

async function verifiedAccount(label: string): Promise<Account> {
  const a = await registerViaApi({ age: 30, label });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const res = await api('PATCH', `/users/${a.userId}`, { token, body: { username: uniqueUsername(label) } });
  expect(res.status).toBe(200);
  return a;
}

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
// Same shape the app decodes (sub, role) but expired and badly signed: the API answers 401.
const expiredToken = (sub: string) =>
  `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'user', iat: 1, exp: 2 })}.x`;

test.describe('cross-tab refresh-cookie rotation (B-164, B-246)', () => {
  // B-246: the refresh token is the httpOnly `sn_rt` cookie, shared by every tab of the browser context, and it
  // ROTATES: the server treats a second use of an old cookie as reuse and revokes the family. Two tabs whose
  // access tokens expire together must therefore never send the SAME cookie at once (the cross-tab lock), and the
  // winner hands the new access token to the other tab over a BroadcastChannel. The access token itself is in
  // each tab's memory, so "expired in both tabs" is set up through the app's own session module.
  test('two tabs that 401 at the same moment never reuse the cookie, both stay signed in, and the cookie rotated', async ({ browser }) => {
    const a = await verifiedAccount('xtab');

    // One browser context = one cookie jar shared by both pages, like two real tabs.
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();

    // Sign in on tab A with "Stay signed in"; tab B then loads the app and restores the SAME session
    // from the shared cookie (its own start-up refresh).
    await tabA.goto('/login');
    await tabA.getByLabel('Email').fill(a.email);
    await tabA.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await tabA.getByLabel('Stay signed in.').check();
    await tabA.getByRole('button', { name: 'Log in' }).click();
    await expect(tabA).toHaveURL(/\/community$/);
    await tabB.goto('/community');
    await expect(tabB.getByRole('button', { name: 'Account menu' })).toBeVisible();

    // All cookies, by name: the cookie's Path is /auth, so a URL-scoped lookup of the API root would not match it.
    const cookieJar = async () => (await context.cookies()).find((c) => c.name === 'sn_rt')!;
    const cookieBefore = (await cookieJar()).value;

    // Record every refresh request either tab makes, and how the server answered.
    const refreshAnswers: Promise<number>[] = [];
    const bodies: (string | null)[] = [];
    const watch = (req: Request) => {
      if (req.url() === `${URLS.api}/auth/refresh`) {
        bodies.push(req.postData());
        refreshAnswers.push(req.response().then((r) => (r ? r.status() : 0)));
      }
    };
    tabA.on('request', watch);
    tabB.on('request', watch);

    // Both tabs now hold an EXPIRED access token in memory...
    await plantAccessToken(tabA, expiredToken(a.userId));
    await plantAccessToken(tabB, expiredToken(a.userId));

    // ...and each fires an authenticated request at the same moment through the app's own fetch
    // (the silent-refresh wrapper installed by main.tsx).
    const call = (page: Page) =>
      page.evaluate(
        async ([apiBase, token]) => {
          const res = await window.fetch(`${apiBase}/posts/feed`, { headers: { Authorization: `Bearer ${token}` } });
          return res.status;
        },
        [URLS.api, expiredToken(a.userId)],
      );
    const [statusA, statusB] = await Promise.all([call(tabA), call(tabB)]);

    expect([statusA, statusB]).toEqual([200, 200]);
    const answers = await Promise.all(refreshAnswers);
    // The lock serialises the tabs: one refresh, or at most two when the second tab's broadcast arrived after it
    // took the lock (then it used the ALREADY ROTATED cookie, which is legitimate). Never a 401 (a reuse).
    expect(answers.length, 'refresh requests').toBeGreaterThanOrEqual(1);
    expect(answers.length, 'refresh requests').toBeLessThanOrEqual(2);
    expect(answers.every((status) => status === 200), `refresh answers ${answers.join(',')}`).toBe(true);
    // No refresh token travels from script: the request has no body.
    expect(bodies.every((b) => b === null)).toBe(true);

    // The session is intact in both tabs, the cookie rotated, and a later request needs no refresh.
    const cookieAfter = (await cookieJar()).value;
    expect(cookieAfter).not.toBe(cookieBefore);
    expect(await heldAccessToken(tabA)).toBeTruthy();
    expect(await heldAccessToken(tabB)).toBeTruthy();
    expect(await heldAccessToken(tabA)).not.toBe(expiredToken(a.userId));
    expect(await heldAccessToken(tabB)).not.toBe(expiredToken(a.userId));
    const laterCall = (page: Page) =>
      page.evaluate(
        async ([apiBase, mod]) => {
          const session = await import(/* @vite-ignore */ mod);
          const res = await window.fetch(`${apiBase}/posts/feed`, {
            headers: { Authorization: `Bearer ${session.getStoredAccessToken()}` },
          });
          return res.status;
        },
        [URLS.api, '/src/lib/session.ts'],
      );
    const refreshesBefore = answers.length;
    expect(await laterCall(tabA)).toBe(200);
    expect(await laterCall(tabB)).toBe(200);
    expect((await Promise.all(refreshAnswers)).length).toBe(refreshesBefore);
    // The OLD cookie is dead server-side (it was used once, by the winner).
    expect((await refreshWithCookie(cookieBefore)).status).toBe(401);
    await context.close();
  });

  test('signing out in one tab signs out the other (BroadcastChannel)', async ({ browser }) => {
    const a = await verifiedAccount('xout');
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    await tabA.goto('/login');
    await tabA.getByLabel('Email').fill(a.email);
    await tabA.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await tabA.getByRole('button', { name: 'Log in' }).click();
    await expect(tabA).toHaveURL(/\/community$/);
    await tabB.goto('/community');
    await expect(tabB.getByRole('button', { name: 'Account menu' })).toBeVisible();

    await tabA.getByRole('button', { name: 'Account menu' }).click();
    await tabA.getByRole('menuitem', { name: 'Log out' }).click();

    // Tab B notices without any navigation: its header falls back to the signed-out chrome.
    await expect(tabB.getByRole('link', { name: 'Login' })).toBeVisible();
    expect(await heldAccessToken(tabB)).toBeNull();
    await context.close();
  });
});

test.describe('mobile header at 390px (B-178)', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  const overflow = (page: Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  test('signed in: no nine-icon row; the avatar opens the drawer; nothing overflows', async ({ page }) => {
    const a = await verifiedAccount('mhin');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);

    const header = page.locator('header.sn-header');
    await expect(header).toBeVisible();
    // The nine icons (Sports Hub ... Academy) and the search box are desktop only.
    await expect(header.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    for (const label of ['Sports Hub', 'Blog', 'Community', 'Leaderboard', 'Bants', 'Clubs', 'Grassroots', 'Scouting', 'Academy']) {
      await expect(header.getByRole('link', { name: label, exact: true })).toHaveCount(0);
    }
    await expect(header.getByRole('searchbox')).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Search' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Messages' })).toBeVisible();
    expect((await header.boundingBox())?.height).toBe(64);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-header-signed-in-closed.png'), clip: { x: 0, y: 0, width: 390, height: 64 } });

    await header.getByRole('button', { name: 'Account menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Log out' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Blog' })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'mobile-drawer-signed-in.png') });
    await drawer.getByRole('link', { name: 'Blog' }).click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(drawer).toHaveCount(0);

    for (const url of ['/community', '/blog', '/sports-hub', '/profile', '/notifications', '/clubs', '/banter', '/leaderboard', '/messages', '/groups', '/grassroots', '/settings', '/search']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      expect(await overflow(page), `${url} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });

  test('logged out: Login + menu control; the menu reaches Sports Hub and Login; nothing overflows', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header.sn-header');
    await expect(header.getByRole('link', { name: 'Login' })).toBeVisible();
    await expect(header.getByRole('link', { name: 'Search' })).toBeVisible();
    await expect(header.getByRole('navigation', { name: 'Primary' })).toHaveCount(0);
    expect((await header.boundingBox())?.height).toBe(64);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-header-logged-out-closed.png'), clip: { x: 0, y: 0, width: 390, height: 64 } });

    await header.getByRole('button', { name: 'Open menu' }).click();
    const drawer = page.getByRole('dialog', { name: 'Navigation' });
    await expect(drawer).toBeVisible();
    const rows = drawer.getByRole('navigation', { name: 'Primary' }).getByRole('link');
    await expect(rows).toHaveText(['Sports Hub', 'Blog', 'Scouting', 'Academy']);
    await expect(drawer.getByRole('link', { name: 'Login' })).toBeVisible();
    await expect(drawer.getByRole('link', { name: 'Sign up' })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-drawer-logged-out.png') });

    await drawer.getByRole('link', { name: 'Sports Hub' }).click();
    await expect(page).toHaveURL(/\/sports-hub$/);
    await expect(drawer).toHaveCount(0);

    await header.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Login' }).click();
    await expect(page).toHaveURL(/\/login$/);

    for (const url of ['/', '/sports-hub', '/blog', '/scouting', '/community', '/search']) {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      expect(await overflow(page), `${url} scrolls sideways`).toBeLessThanOrEqual(1);
    }
  });
});
