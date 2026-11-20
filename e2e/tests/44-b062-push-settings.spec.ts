import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { db, loginViaUi, registerViaApi, verifyEmailViaApi, type Account, userByEmail } from '../support/helpers';

// B-062 / B-285 (Decision Log #472 (e)): the Push leaf of Settings and the browser side of web push,
// in real Chrome against the real API, Postgres and Redis. Scoped to this work only.
//
// REAL: the service worker (/sw.js is fetched, registered and activated by Chrome), the settings page,
// GET /notification-settings/push, POST and DELETE of the subscription, the rows in Postgres, the sign-out.
// STUBBED IN THE BROWSER (init script): only the push service itself. Headless Chrome cannot reach FCM, so
// PushManager.prototype.subscribe / getSubscription are replaced by an in-page store (kept in localStorage so a
// reload keeps it) that hands back a subscription-shaped object on a known FCM-looking address. The notification
// permission is the browser's own (context.grantPermissions) except in the Blocked test, which fakes "denied".
// NOT verified here: delivery of a real push to a real browser.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b062-push-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const PAGE = '/settings/notifications/push';
const SWITCH = 'Turn on push notifications';
const TAGGED = 'Push notifications only say “You have a new notification”. Open Soccernity to see what it is. [COPY PENDING LEGAL REVIEW]';

// Replaces the push service. The "subscription" lives in localStorage under a key the test can read.
const FAKE_PUSH = `
  (() => {
    const KEY = '__fake_push_subscription';
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
    const build = (data) => ({
      endpoint: data.endpoint,
      toJSON: () => ({ endpoint: data.endpoint, keys: { p256dh: data.p256dh, auth: data.auth } }),
      unsubscribe: async () => { localStorage.removeItem(KEY); return true; },
    });
    if (!window.PushManager) return;
    PushManager.prototype.getSubscription = async function () {
      const data = read();
      return data ? build(data) : null;
    };
    PushManager.prototype.subscribe = async function (options) {
      if (!options || options.userVisibleOnly !== true || !options.applicationServerKey || options.applicationServerKey.byteLength !== 65) {
        throw new Error('subscribe called without userVisibleOnly or a 65-byte application server key');
      }
      const data = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-' + Math.random().toString(36).slice(2),
        p256dh: 'BE2eP256dhKey' + Math.random().toString(36).slice(2),
        auth: 'e2eAuth' + Math.random().toString(36).slice(2),
      };
      localStorage.setItem(KEY, JSON.stringify(data));
      return build(data);
    };
  })();
`;

async function fakeEndpoint(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const raw = localStorage.getItem('__fake_push_subscription');
    return raw ? (JSON.parse(raw) as { endpoint: string }).endpoint : null;
  });
}

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

async function rowsFor(email: string) {
  const user = await userByEmail(email);
  return db().pushSubscription.findMany({ where: { userId: user.id } });
}

test.describe.serial('Settings > Notification Preferences > Push', () => {
  let owner: Account;

  test.beforeAll(async () => {
    owner = await registerViaApi({ age: 30, label: 'push' });
    await verifyEmailViaApi(owner);
  });

  // Each test is a fresh browser context (so a fresh fake push store); rows an earlier test left on the
  // server belong to a browser that no longer exists, so start every test with none.
  test.beforeEach(async () => {
    const user = await userByEmail(owner.email);
    await db().pushSubscription.deleteMany({ where: { userId: user.id } });
  });

  test('the worker is a real JavaScript file served from the root', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toMatch(/javascript/);
    const body = await res.text();
    expect(body).toContain('showNotification');
    expect(body).toContain('/notifications');
  });

  test('Off by default; turning on registers the worker, subscribes and stores the row; it survives a reload', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.addInitScript(FAKE_PUSH);
    await signIn(page, owner.email);
    await page.goto(PAGE);

    await expect(page.getByRole('heading', { name: 'Push notifications' })).toBeVisible();
    await expect(page.getByText('Manage push notifications on this browser.')).toBeVisible();
    const toggle = page.getByRole('switch', { name: SWITCH });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(TAGGED)).toBeVisible();
    await expect(page.getByText('This setting applies to this browser only. Turn it on separately on each browser or device you use.')).toBeVisible();
    await shot(page, '01-push-off-desktop');
    expect(await rowsFor(owner.email)).toHaveLength(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(toggle).toBeEnabled();

    // The real worker is registered at scope "/" and running.
    const registration = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      return reg ? { script: (reg.active ?? reg.waiting ?? reg.installing)?.scriptURL ?? '', scope: reg.scope } : null;
    });
    expect(registration?.script).toMatch(/\/sw\.js$/);
    expect(registration?.scope).toMatch(/\/$/);

    // The real row is in Postgres with the endpoint the browser handed over.
    const endpoint = await fakeEndpoint(page);
    expect(endpoint).toMatch(/^https:\/\/fcm\.googleapis\.com\//);
    const rows = await rowsFor(owner.email);
    expect(rows).toHaveLength(1);
    expect(rows[0].endpoint).toBe(endpoint);
    expect(rows[0].p256dh).toBeTruthy();
    expect(rows[0].auth).toBeTruthy();
    await shot(page, '02-push-on-desktop');

    await page.reload();
    await expect(page.getByRole('switch', { name: SWITCH })).toHaveAttribute('aria-checked', 'true');
  });

  test('turning off unsubscribes this browser and deletes the row', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.addInitScript(FAKE_PUSH);
    await signIn(page, owner.email);
    await page.goto(PAGE);
    const toggle = page.getByRole('switch', { name: SWITCH });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(await rowsFor(owner.email)).toHaveLength(1);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await rowsFor(owner.email)).length).toBe(0);
    expect(await fakeEndpoint(page)).toBeNull();

    await page.reload();
    await expect(page.getByRole('switch', { name: SWITCH })).toHaveAttribute('aria-checked', 'false');
  });

  test('PRIVACY RULE: signing out removes this browser\'s subscription from the browser and the server', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.addInitScript(FAKE_PUSH);
    await signIn(page, owner.email);
    await page.goto(PAGE);
    await page.getByRole('switch', { name: SWITCH }).click();
    await expect(page.getByRole('switch', { name: SWITCH })).toHaveAttribute('aria-checked', 'true');
    expect(await rowsFor(owner.email)).toHaveLength(1);

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);

    // The browser's subscription is gone, and so is the server row (the next person to sign in here gets nothing).
    await expect.poll(() => fakeEndpoint(page)).toBeNull();
    await expect.poll(async () => (await rowsFor(owner.email)).length).toBe(0);
  });

  test('Blocked by browser: switch disabled, the blocked callout, and Check again reads the permission again', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __perm: string }).__perm = 'denied';
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => (window as unknown as { __perm: string }).__perm });
    });
    await page.addInitScript(FAKE_PUSH);
    await signIn(page, owner.email);
    await page.goto(PAGE);

    const toggle = page.getByRole('switch', { name: SWITCH });
    await expect(toggle).toBeDisabled();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(/Notifications are blocked in this browser\. To turn push on, allow notifications for Soccernity/)).toBeVisible();
    await expect(page.getByText(/COPY PENDING LEGAL REVIEW/)).toHaveCount(0);
    await shot(page, '03-push-blocked-desktop');

    await page.evaluate(() => { (window as unknown as { __perm: string }).__perm = 'granted'; });
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(toggle).toBeEnabled();
    await expect(page.getByText(/Notifications are blocked/)).toHaveCount(0);
    expect(await rowsFor(owner.email)).toHaveLength(0);
  });

  test('Not supported: a browser without PushManager', async ({ page }) => {
    await page.addInitScript(() => {
      // @ts-expect-error simulate a browser with no push support
      delete window.PushManager;
    });
    await signIn(page, owner.email);
    await page.goto(PAGE);
    await expect(page.getByText(/This browser or device can’t receive push notifications\. You’ll still see your notifications in Soccernity\./)).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
    await shot(page, '04-push-not-supported-desktop');
  });

  test('Not supported: the server says push is not available yet (the keys are not set)', async ({ page }) => {
    await page.route('**/notification-settings/push', (route) =>
      route.request().method() === 'GET' ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: false }) }) : route.fallback(),
    );
    await page.addInitScript(FAKE_PUSH);
    await signIn(page, owner.email);
    await page.goto(PAGE);
    await expect(page.getByText(/can’t receive push notifications/)).toBeVisible();
    await expect(page.getByRole('switch')).toHaveCount(0);
  });

  test('390px: the Off and On layouts fit without sideways scroll', async ({ page, context }) => {
    await context.grantPermissions(['notifications']);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(FAKE_PUSH);
    await signIn(page, owner.email);
    await page.goto(PAGE);
    const toggle = page.getByRole('switch', { name: SWITCH });
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await shot(page, '05-push-off-mobile');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await shot(page, '06-push-on-mobile');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
  });
});
