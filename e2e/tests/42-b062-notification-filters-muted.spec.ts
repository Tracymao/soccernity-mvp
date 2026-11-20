import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, loginViaUi, me, registerViaApi, verifyEmailViaApi, type Account } from '../support/helpers';

// B-062 (Decision Log #472 (c)): the Filters and Muted accounts leaves, live against
// GET and PATCH /notification-settings, in real Chrome against the real API, Postgres and Redis.
// Scoped to this work; no other Playwright spec is run by it.
//
// REAL: every toggle saves through the real PATCH and is read back through the real GET; the
// state survives a reload; and the setting really suppresses a new follow notification.
// STUBBED IN THE BROWSER: only the failed-save case (the PATCH is aborted for one call).
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b062-filters-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

async function stored(token: string) {
  const res = await api('GET', '/notification-settings', { token });
  expect(res.status).toBe(200);
  return res.body;
}

const QUALITY = 'Quality filter';
const NOT_FOLLOWING = 'People you don’t follow';
const NOT_FOLLOWERS = 'People who don’t follow you';
const NEW_ACCOUNTS = 'People with a new account';

test.describe.serial('Notification Preferences: Filters and Muted accounts', () => {
  let owner: Account;
  let stranger: Account;
  let ownerToken: string;

  test.beforeAll(async () => {
    owner = await registerViaApi({ age: 30, label: 'nfm' });
    await verifyEmailViaApi(owner);
    stranger = await registerViaApi({ age: 31, label: 'nfs' });
    await verifyEmailViaApi(stranger);
    ownerToken = (await me(owner)).token;
  });

  test('the hub links both leaves; Filters starts off, saves on change and survives a reload', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/notifications');
    await page.getByRole('link', { name: /^Filters/ }).click();
    await expect(page).toHaveURL(/\/settings\/notifications\/filters$/);
    await expect(page.getByRole('heading', { name: 'Filters' })).toBeVisible();
    await expect(page.getByText('Choose which notifications you see.')).toBeVisible();
    await expect(
      page.getByText('Hides likes, comments and follows from accounts you don’t follow and haven’t interacted with in the last 30 days.'),
    ).toBeVisible();
    await expect(page.getByText('Messages, fixtures, results and Contest notifications are not affected.')).toBeVisible();

    const toggle = page.getByRole('switch', { name: QUALITY });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await shot(page, '01-filters-off-desktop');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeEnabled();
    expect((await stored(ownerToken)).qualityFilter).toBe(true);
    await shot(page, '02-filters-on-desktop');

    await page.reload();
    await expect(page.getByRole('switch', { name: QUALITY })).toHaveAttribute('aria-checked', 'true');
  });

  test('Muted accounts: three rows in the frame order, each saves its own option', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/notifications');
    await page.getByRole('link', { name: /^Muted accounts/ }).click();
    await expect(page).toHaveURL(/\/settings\/notifications\/muted-accounts$/);
    await expect(page.getByRole('heading', { name: 'Muted accounts' })).toBeVisible();
    await expect(page.getByText('Mute notifications from these people.')).toBeVisible();

    const rows = page.getByRole('switch');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAccessibleName(NOT_FOLLOWING);
    await expect(rows.nth(1)).toHaveAccessibleName(NOT_FOLLOWERS);
    await expect(rows.nth(2)).toHaveAccessibleName(NEW_ACCOUNTS);
    for (let i = 0; i < 3; i += 1) await expect(rows.nth(i)).toHaveAttribute('aria-checked', 'false');
    await shot(page, '03-muted-all-off-desktop');

    await rows.nth(0).click();
    await expect(rows.nth(0)).toHaveAttribute('aria-checked', 'true');
    await expect(rows.nth(0)).toBeEnabled();
    await rows.nth(2).click();
    await expect(rows.nth(2)).toHaveAttribute('aria-checked', 'true');
    await expect(rows.nth(2)).toBeEnabled();

    const now = await stored(ownerToken);
    expect(now).toEqual({
      qualityFilter: true,
      muteNonFollowing: true,
      muteNonFollowers: false,
      muteNewAccounts: true,
    });
    await shot(page, '04-muted-two-on-desktop');

    await page.reload();
    await expect(page.getByRole('switch', { name: NOT_FOLLOWING })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('switch', { name: NOT_FOLLOWERS })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: NEW_ACCOUNTS })).toHaveAttribute('aria-checked', 'true');

    // Turning one back off saves false.
    await page.getByRole('switch', { name: NOT_FOLLOWING }).click();
    await expect(page.getByRole('switch', { name: NOT_FOLLOWING })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('switch', { name: NOT_FOLLOWING })).toBeEnabled();
    expect((await stored(ownerToken)).muteNonFollowing).toBe(false);
  });

  test('a failed save puts the toggle back and says so', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/notifications/muted-accounts');
    const toggle = page.getByRole('switch', { name: NOT_FOLLOWERS });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    let failed = false;
    await page.route('**/notification-settings', async (route) => {
      if (route.request().method() === 'PATCH' && !failed) {
        failed = true;
        await route.abort('failed');
        return;
      }
      await route.continue();
    });
    await toggle.click();
    await expect(page.getByRole('alert')).toContainText('Couldn’t save that change');
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toBeEnabled();
    expect((await stored(ownerToken)).muteNonFollowers).toBe(false);
    await shot(page, '05-failed-save-desktop');

    // The next attempt goes through and clears the message.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect((await stored(ownerToken)).muteNonFollowers).toBe(true);
    // Leave this one off for the next test.
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(toggle).toBeEnabled();
  });

  test('the setting really works: with "people you don’t follow" on, a stranger’s follow makes no notification', async () => {
    // owner currently has muteNewAccounts and qualityFilter on; turn muteNonFollowing on via the API
    // (the UI path is covered above) and let a stranger follow the owner.
    await api('PATCH', '/notification-settings', { token: ownerToken, body: { muteNonFollowing: true } });
    const strangerToken = (await me(stranger)).token;
    const follow = await api('POST', `/users/${owner.userId}/follow`, { token: strangerToken });
    expect(follow.status).toBeLessThan(300);
    const list = await api('GET', '/notifications', { token: ownerToken });
    expect(list.status).toBe(200);
    expect(list.body.items.filter((n: { type: string }) => n.type === 'follow')).toHaveLength(0);

    // Switched off again, the next follow would notify (a different stranger so the follow is new).
    await api('DELETE', `/users/${owner.userId}/follow`, { token: strangerToken });
    await api('PATCH', '/notification-settings', {
      token: ownerToken,
      body: { muteNonFollowing: false, muteNewAccounts: false, qualityFilter: false },
    });
    const again = await api('POST', `/users/${owner.userId}/follow`, { token: strangerToken });
    expect(again.status).toBeLessThan(300);
    const after = await api('GET', '/notifications', { token: ownerToken });
    expect(after.body.items.filter((n: { type: string }) => n.type === 'follow')).toHaveLength(1);
  });

  test('390px: both leaves fit with no sideways scroll', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, owner.email);
    for (const [route, name] of [
      ['/settings/notifications/filters', '06-filters-mobile'],
      ['/settings/notifications/muted-accounts', '07-muted-mobile'],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('switch').first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await shot(page, name);
    }
  });
});
