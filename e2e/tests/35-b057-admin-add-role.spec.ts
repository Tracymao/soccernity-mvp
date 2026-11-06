import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { createRequire } from 'module';
import { api, adminToken, db } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { REPO, URLS } from '../support/stack';

const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));

// B-057: the Add Role page (Figma 1658:2456) against the real POST /admin/staff, in real Chrome with the real API,
// Postgres and Redis. Scoped to this screen; the other Playwright specs are not run by it.
//
// The QA admin is a superadmin, so it can add accounts. A moderator is created through that same real endpoint and
// signed in (through the console's start-up refresh, answered with that admin's access token) for the "not allowed"
// case. Admin logins are limited to 5 per 15 minutes per IP (Decision Log #190); this spec spends 4: the shared
// cached QA admin token, the generated-password sign-in, the set-password sign-in, and the moderator's.
test.use({ viewport: { width: 1440, height: 1184 } });

const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b057-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const RUN = Date.now().toString(36);
const emailFor = (label: string) => `qa-b057-${label}-${RUN}@soccernity.test`;

async function adminPageAs(browser: Browser, token: string): Promise<Page> {
  const ctx = await browser.newContext({ baseURL: URLS.admin });
  const cors = {
    'access-control-allow-origin': URLS.admin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-headers': 'content-type, authorization, x-auth-mode',
    'access-control-allow-methods': 'POST, OPTIONS',
    vary: 'Origin',
  };
  await ctx.route(`${URLS.api}/admin/auth/refresh`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({
        accessToken: token,
        accessTokenExpiresIn: 900,
        refreshTokenExpiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      }),
    });
  });
  return ctx.newPage();
}

test.describe.serial('admin Add Role', () => {
  test('the Roles list links to the form, and the form shows the frame fields', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings`);
    await page.getByRole('link', { name: 'Add Role' }).click();
    await expect(page).toHaveURL(/\/settings\/roles\/new$/);
    await expect(page.getByText('Add a New Role')).toBeVisible();
    for (const label of ['Email', 'Name', 'Role', 'Create Password', 'Confirm Password']) {
      await expect(page.getByLabel(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole('option', { name: 'Super Admin' })).toBeAttached();
    await shot(page, '01-form');

    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Enter an email address.')).toBeVisible();
    await expect(page.getByText('Enter a name.')).toBeVisible();
    await expect(page.getByText('Choose a role.')).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    await shot(page, '02-errors');
    await page.context().close();
  });

  test('a password mismatch is refused in the browser and nothing is created', async ({ browser }) => {
    const email = emailFor('mismatch');
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings/roles/new`);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Name', { exact: true }).fill('Mismatch Person');
    await page.getByLabel('Role', { exact: true }).selectOption('editor');
    await page.getByLabel('Create Password', { exact: true }).fill('password-one-1');
    await page.getByLabel('Confirm Password', { exact: true }).fill('password-two-2');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText("The passwords don't match.")).toBeVisible();
    expect(await db().adminUser.findUnique({ where: { email } })).toBeNull();
    await shot(page, '03-mismatch');
    await page.context().close();
  });

  test('with no password typed the system generates one, shows it once, and the new admin can sign in with it', async ({ browser }) => {
    const email = emailFor('generated');
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings/roles/new`);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Name', { exact: true }).fill('Generated Pass');
    await page.getByLabel('Role', { exact: true }).selectOption('moderator');
    await page.getByRole('button', { name: 'Submit' }).click();

    await expect(page.getByText('Account created')).toBeVisible();
    await expect(page.getByText('Generated Pass can now sign in as Moderator.')).toBeVisible();
    const generated = (await page.getByTestId('generated-password').textContent()) ?? '';
    expect(generated.length).toBeGreaterThanOrEqual(8);
    await shot(page, '04-created-generated');

    const row = await db().adminUser.findUnique({ where: { email } });
    expect(row.role).toBe('moderator');
    expect(row.fullName).toBe('Generated Pass');
    expect(row.passwordHash).not.toBe(generated);
    const log = await db().adminActionLog.findFirst({ where: { targetId: row.id, action: 'admin_user.created' } });
    expect(log).not.toBeNull();
    expect(JSON.stringify(log)).not.toContain(generated);

    // The password really works, so it is the real one and not a display artefact.
    const token = await adminToken(email, generated);
    expect(token.length).toBeGreaterThan(20);

    // Nothing in storage or cookies.
    const stored = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
    expect(stored).not.toContain(generated);

    await page.getByRole('button', { name: 'Add another' }).click();
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('');
    await expect(page.getByText(generated)).toHaveCount(0);
    await page.context().close();
  });

  test('a password set by the admin is used, never shown, and works', async ({ browser }) => {
    const email = emailFor('chosen');
    const chosen = `chosen-${RUN}-pw1`;
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings/roles/new`);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Name', { exact: true }).fill('Chosen Pass');
    await page.getByLabel('Role', { exact: true }).selectOption('editor');
    await page.getByLabel('Create Password', { exact: true }).fill(chosen);
    await page.getByLabel('Confirm Password', { exact: true }).fill(chosen);
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Account created')).toBeVisible();
    await expect(page.getByTestId('generated-password')).toHaveCount(0);
    await expect(page.getByText(chosen)).toHaveCount(0);
    await expect(page.getByText(/They sign in with the password you set/)).toBeVisible();
    await shot(page, '05-created-chosen');
    const token = await adminToken(email, chosen);
    expect(token.length).toBeGreaterThan(20);
    await page.context().close();
  });

  test('an email that already has an account is refused on the Email field and the form is kept', async ({ browser }) => {
    const email = emailFor('chosen'); // created by the previous test
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/settings/roles/new`);
    await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
    await page.getByLabel('Name', { exact: true }).fill('Second Person');
    await page.getByLabel('Role', { exact: true }).selectOption('moderator');
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('An admin account with this email already exists.')).toBeVisible();
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Second Person');
    await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
    expect(await db().adminUser.count({ where: { email } })).toBe(1);
    await shot(page, '06-duplicate');
    await page.context().close();
  });

  test('a moderator sees "not allowed" and no form, and the real endpoint refuses them too', async ({ browser }) => {
    const email = emailFor('generated');
    const modRow = await db().adminUser.findUnique({ where: { email } }); // the moderator made two tests ago
    expect(modRow.role).toBe('moderator');
    // The generated password was not kept, so give this moderator a known one straight in Postgres, then sign in.
    const argon2 = requireFromApi('argon2');
    const pw = `mod-${RUN}-pw1`;
    await db().adminUser.update({ where: { id: modRow.id }, data: { passwordHash: await argon2.hash(pw) } });
    const token = await adminToken(email, pw);

    const direct = await api('POST', '/admin/staff', {
      token,
      body: { email: emailFor('nope'), fullName: 'Nope', role: 'editor' },
    });
    expect(direct.status).toBe(403);
    expect(await db().adminUser.findUnique({ where: { email: emailFor('nope') } })).toBeNull();

    const page = await adminPageAs(browser, token);
    await page.goto(`${URLS.admin}/settings/roles/new`);
    await expect(page.getByText("You aren't allowed to add accounts. Only a Super Admin can.")).toBeVisible();
    await expect(page.getByLabel('Email', { exact: true })).toHaveCount(0);
    await shot(page, '07-not-allowed');
    await page.context().close();
  });
});
