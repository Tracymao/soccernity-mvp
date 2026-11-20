import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, loginViaUi, me, registerViaApi, uniqueUsername, verifyEmailViaApi, type Account } from '../support/helpers';

// B-061 (Decision Log #472 (d) and (i)): the Direct Messages and Your Posts leaves under Privacy, in real
// Chrome against the real API, Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// REAL: the saved choice (read back through GET /users/me/settings and from Postgres), the choice surviving a
// reload, and the real DM rule (a second account asking to start a chat is refused while "No one" is saved, and
// allowed again once "Everyone the rules allow" is saved). STUBBED IN THE BROWSER: the failed save (a 500 on the
// PATCH), which cannot be produced against a healthy server.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b061-settings-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

async function withUsername(acct: Account, label: string): Promise<void> {
  await db().user.update({ where: { id: acct.userId }, data: { username: uniqueUsername(label) } });
}

const settingsOf = async (acct: Account) => {
  const { token } = await me(acct);
  return (await api('GET', '/users/me/settings', { token })).body;
};

test.describe.serial('Privacy leaves: Direct Messages and Your Posts', () => {
  let owner: Account;
  let asker: Account;

  test.beforeAll(async () => {
    owner = await registerViaApi({ age: 30, label: 'pvl-owner' });
    asker = await registerViaApi({ age: 30, label: 'pvl-asker' });
    await verifyEmailViaApi(owner);
    await verifyEmailViaApi(asker);
    await withUsername(owner, 'owner');
    await withUsername(asker, 'asker');
  });

  test('Privacy rows are real links to the two leaves', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/privacy');
    await expect(page.getByText('Not available yet.')).toHaveCount(0);
    await expect(page.getByRole('link', { name: /direct message/i })).toHaveAttribute('href', '/settings/privacy/direct-messages');
    await expect(page.getByRole('link', { name: /your post/i })).toHaveAttribute('href', '/settings/privacy/your-posts');
    await page.getByRole('link', { name: /direct message/i }).click();
    await expect(page).toHaveURL(/\/settings\/privacy\/direct-messages$/);
    await expect(page.getByRole('heading', { name: 'Direct Messages' })).toBeVisible();
  });

  test('Direct Messages: default, the choice saves, survives a reload, and the real DM rule follows it', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/privacy/direct-messages');

    await expect(page.getByRole('radio', { name: /everyone the rules allow/i })).toBeChecked();
    await expect(page.getByText('Read receipts', { exact: true })).toBeVisible();
    // Read receipts is a live switch since B-061 (default On for an adult).
    await expect(page.getByRole('switch', { name: 'Read receipts' })).toBeEnabled();
    await expect(page.getByRole('switch', { name: 'Read receipts' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(/This can only make messaging stricter/)).toBeVisible();
    await shot(page, '01-direct-messages-default-desktop');

    await page.getByText('No one', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /no one/i })).toBeChecked();
    await expect(page.getByRole('radio', { name: /no one/i })).toBeEnabled();
    expect((await settingsOf(owner)).dmPermission).toBe('none');
    expect((await db().user.findUnique({ where: { id: owner.userId } })).dmPermission).toBe('none');
    await shot(page, '02-direct-messages-no-one-desktop');

    await page.reload();
    await expect(page.getByRole('radio', { name: /no one/i })).toBeChecked();

    // The real rule: while "No one" is saved, a new conversation is refused as if the person did not exist.
    const { token } = await me(asker);
    const refused = await api('POST', '/conversations', { token, body: { recipientId: owner.userId } });
    expect(refused.status).toBe(404);

    await page.getByText('Everyone the rules allow', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /everyone the rules allow/i })).toBeChecked();
    await expect(page.getByRole('radio', { name: /everyone the rules allow/i })).toBeEnabled();
    expect((await settingsOf(owner)).dmPermission).toBe('everyone');
    const allowed = await api('POST', '/conversations', { token, body: { recipientId: owner.userId } });
    expect([200, 201]).toContain(allowed.status);
  });

  test('Direct Messages: a failed save puts the choice back and says so', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/privacy/direct-messages');
    await expect(page.getByRole('radio', { name: /everyone the rules allow/i })).toBeChecked();

    await page.route('**/users/me/settings', (route) => {
      if (route.request().method() === 'PATCH') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await page.getByText('People I follow', { exact: true }).click();

    await expect(page.getByRole('alert')).toHaveText('Couldn’t save your change. Your setting is back to what it was.');
    await expect(page.getByRole('radio', { name: /everyone the rules allow/i })).toBeChecked();
    await expect(page.getByRole('radio', { name: /people i follow/i })).not.toBeChecked();
    await shot(page, '03-direct-messages-save-failed-desktop');
    // Nothing was saved.
    expect((await settingsOf(owner)).dmPermission).toBe('everyone');
  });

  test('Your Posts: the switch saves, survives a reload and shows in the settings read', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/privacy/your-posts');
    const sw = page.getByRole('switch', { name: 'Mark media you post as having material that may be sensitive' });
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await shot(page, '04-your-posts-off-desktop');

    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(sw).toBeEnabled();
    expect((await settingsOf(owner)).mediaSensitive).toBe(true);
    expect((await db().user.findUnique({ where: { id: owner.userId } })).mediaSensitive).toBe(true);
    await shot(page, '05-your-posts-on-desktop');

    await page.reload();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    // The other setting is untouched by this one.
    expect((await settingsOf(owner)).dmPermission).toBe('everyone');

    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(sw).toBeEnabled();
    expect((await settingsOf(owner)).mediaSensitive).toBe(false);
  });

  test('Your Posts: a failed save puts the switch back and says it is back to Off', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/settings/privacy/your-posts');
    const sw = page.getByRole('switch', { name: 'Mark media you post as having material that may be sensitive' });
    await expect(sw).toHaveAttribute('aria-checked', 'false');

    await page.route('**/users/me/settings', (route) => {
      if (route.request().method() === 'PATCH') return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
      return route.continue();
    });
    await sw.click();

    await expect(page.getByRole('alert')).toHaveText('Couldn’t save your change. The setting is back to Off.');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await shot(page, '06-your-posts-save-failed-desktop');
    expect((await settingsOf(owner)).mediaSensitive).toBe(false);
  });

  test('390px: both leaves fit without sideways scroll and the Settings back bar replaces the arrow', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    await signIn(page, owner.email);
    for (const [route, name, probe] of [
      ['/settings/privacy/direct-messages', '07-direct-messages-mobile', page.getByRole('radio', { name: /no one/i })],
      ['/settings/privacy/your-posts', '08-your-posts-mobile', page.getByRole('switch')],
    ] as const) {
      await page.goto(route);
      await expect(probe).toBeVisible({ timeout: 15_000 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(page.getByRole('link', { name: 'Back to Privacy' })).toBeHidden();
      await shot(page, name);
    }
    await ctx.close();
  });
});
