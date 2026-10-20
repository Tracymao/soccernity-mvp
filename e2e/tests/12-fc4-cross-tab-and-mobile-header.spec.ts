import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page, type Request } from '@playwright/test';
import {
  api,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  userLogin,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { URLS } from '../support/stack';

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

test.describe('cross-tab refresh-token rotation (B-164)', () => {
  test('two tabs that 401 at the same moment rotate the refresh token ONCE and both stay signed in', async ({ browser }) => {
    const a = await verifiedAccount('xtab');
    const login = await userLogin(a.email);
    expect(login.status).toBeLessThan(300);
    const refreshToken: string = login.body.refreshToken;

    // One browser context = one origin storage shared by both pages, like two real tabs.
    const context = await browser.newContext();
    const tabA = await context.newPage();
    const tabB = await context.newPage();
    const refreshCalls: string[] = [];
    const watch = (req: Request) => {
      if (req.url() === `${URLS.api}/auth/refresh`) refreshCalls.push(req.postData() ?? '');
    };
    tabA.on('request', watch);
    tabB.on('request', watch);

    // Both tabs load the app; then a "Stay signed in" session (localStorage) with an EXPIRED access
    // token and a live refresh token is planted for the shared origin.
    await tabA.goto('/login');
    await tabB.goto('/login');
    await tabA.evaluate(
      ([expired, refresh]) => {
        window.localStorage.setItem('sn_access_token', expired);
        window.localStorage.setItem('sn_refresh_token', refresh);
      },
      [expiredToken(a.userId), refreshToken],
    );

    // Each tab fires an authenticated request at the same moment through the app's own fetch
    // (the silent-refresh wrapper installed by main.tsx).
    const call = (page: Page) =>
      page.evaluate(async (apiBase) => {
        const token = window.localStorage.getItem('sn_access_token');
        const res = await window.fetch(`${apiBase}/posts/feed`, { headers: { Authorization: `Bearer ${token}` } });
        return res.status;
      }, URLS.api);
    const [statusA, statusB] = await Promise.all([call(tabA), call(tabB)]);

    expect([statusA, statusB]).toEqual([200, 200]);
    expect(refreshCalls, 'the refresh endpoint was called more than once').toHaveLength(1);
    expect(JSON.parse(refreshCalls[0]).refreshToken).toBe(refreshToken);

    // Rotated exactly once, the session is intact, and a later request still works.
    const stored = await tabA.evaluate(() => ({
      access: window.localStorage.getItem('sn_access_token'),
      refresh: window.localStorage.getItem('sn_refresh_token'),
    }));
    expect(stored.refresh).toBeTruthy();
    expect(stored.refresh).not.toBe(refreshToken);
    expect(stored.access).not.toBe(expiredToken(a.userId));
    expect(await call(tabB)).toBe(200);
    expect(refreshCalls).toHaveLength(1);
    // The OLD refresh token is dead server-side (it was used once, by the winner).
    const reuse = await api('POST', '/auth/refresh', { body: { refreshToken } });
    expect(reuse.status).toBe(401);
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
