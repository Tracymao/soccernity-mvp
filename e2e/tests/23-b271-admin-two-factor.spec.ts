import * as crypto from 'crypto';
import * as path from 'path';
import { createRequire } from 'module';
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { api, db } from '../support/helpers';
import { REPO, URLS } from '../support/stack';

// B-271: the Admin Console two-factor screens, in real Chrome against the real API, Postgres and Redis.
//  - sign in with an authenticator code (wrong code first, then the right one) and with a backup code
//  - regenerate backup codes from the profile card
//  - a superadmin resets another admin's two-factor (and cannot reset their own)
//  - enrolment AT SIGN-IN: only meaningful with ADMIN_2FA_ENFORCED=true in the API's environment, so that test skips
//    otherwise. Run it with:   ADMIN_2FA_ENFORCED=true npx playwright test 23     (the stack inherits the variable)
//
// The admin login is throttled to 5 per 15 minutes per IP (Decision Log #190) and the API is restarted by global
// setup on every run, so this spec spends its budget deliberately: S1 API login, T API login, S1 UI sign-in (code),
// S1 UI sign-in (backup code), E UI sign-in (enrolment, enforced run only) = 5.
//
// The TOTP helper (RFC 6238, SHA-1, 6 digits, 30 s) lives in this spec on purpose; nothing else in the suite needs it.
const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));
const ENFORCED = process.env.ADMIN_2FA_ENFORCED === 'true';
const PASSWORD = 'Two-factor#2026-pass';
const INVALID_CODE = 'That code did not work. Check it and try again.';

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of input.replace(/[\s=]/g, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The code an authenticator app shows `stepOffset` 30-second steps from now (the API accepts one step either side). */
function totp(secret: string, stepOffset = 0): string {
  const counter = Math.floor(Date.now() / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}

interface Admin {
  id: string;
  email: string;
  name: string;
  secret: string;
  backupCodes: string[];
}

function uniqueAdminEmail(label: string): string {
  return `qa-2fa-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}@soccernity.test`;
}

async function createAdmin(label: string, name: string): Promise<{ id: string; email: string }> {
  const argon2 = requireFromApi('argon2');
  const email = uniqueAdminEmail(label);
  const row = await db().adminUser.create({
    data: { email, fullName: name, passwordHash: await argon2.hash(PASSWORD), role: 'superadmin', accountStatus: 'active' },
  });
  return { id: row.id, email };
}

/** Turns two-factor on for an admin through the API, whichever way the stack's enforcement setting requires. */
async function enrolViaApi(label: string, name: string): Promise<Admin> {
  const { id, email } = await createAdmin(label, name);
  const login = await api('POST', '/admin/auth/login', { body: { email, password: PASSWORD } });
  expect(login.status).toBe(200);
  let secret: string;
  let backupCodes: string[];
  if (login.body.twoFactorEnrolmentRequired) {
    // ADMIN_2FA_ENFORCED=true: the password step answers an enrolment token, not a session.
    const token = login.body.enrolmentToken as string;
    const start = await api('POST', '/admin/auth/login/two-factor/enrol/start', { body: { enrolmentToken: token } });
    expect(start.status).toBe(200);
    secret = start.body.secret;
    const confirm = await api('POST', '/admin/auth/login/two-factor/enrol/confirm', {
      body: { enrolmentToken: token, code: totp(secret) },
    });
    expect(confirm.status).toBe(200);
    backupCodes = confirm.body.backupCodes;
  } else {
    const accessToken = login.body.accessToken as string;
    const start = await api('POST', '/admin/auth/two-factor/enrol/start', { token: accessToken });
    expect(start.status).toBe(200);
    secret = start.body.secret;
    const confirm = await api('POST', '/admin/auth/two-factor/enrol/confirm', {
      token: accessToken,
      body: { code: totp(secret) },
    });
    expect(confirm.status).toBe(200);
    backupCodes = confirm.body.backupCodes;
  }
  expect(backupCodes).toHaveLength(10);
  return { id, email, name, secret, backupCodes };
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

async function storageHoldsNoToken(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const dump = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie;
    return !/eyJ[A-Za-z0-9_-]{10,}/.test(dump) && !/sn_admin/i.test(dump);
  });
}

async function newAdminPage(browser: Browser): Promise<{ ctx: BrowserContext; page: Page; errors: string[] }> {
  const ctx = await browser.newContext({ baseURL: URLS.admin, viewport: { width: 1440, height: 1184 } });
  const page = await ctx.newPage();
  return { ctx, page, errors: collectErrors(page) };
}

async function passwordStep(page: Page, email: string): Promise<void> {
  await page.goto(`${URLS.admin}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

test.describe.serial('admin two-factor screens (B-271)', () => {
  let s1: Admin; // the superadmin who signs in
  let target: Admin; // another admin, reset by s1
  let sessionA: { ctx: BrowserContext; page: Page; errors: string[] };
  let freshCodes: string[] = [];

  test.beforeAll(async () => {
    s1 = await enrolViaApi('s1', 'Ada Superadmin');
    target = await enrolViaApi('target', 'Amara Okafor');
  });

  test.afterAll(async () => {
    await sessionA?.ctx.close();
  });

  test('a wrong authenticator code is refused with the API message; the right code signs in; no token reaches storage', async ({ browser }) => {
    sessionA = await newAdminPage(browser);
    const { page, errors } = sessionA;
    await passwordStep(page, s1.email);

    await expect(page.getByRole('heading', { name: /Enter your authentication code/ })).toBeVisible();
    // The password step is NOT a session: still on the sign-in screen, no Console.
    await expect(page.getByLabel('Password')).toHaveCount(0);

    await page.getByLabel('Authentication code').fill('000000');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(INVALID_CODE);
    await expect(page).toHaveURL(/\/login/);

    // One step ahead is inside the API's window and later than the step the enrolment used, so it is not a replay.
    await page.getByLabel('Authentication code').fill(totp(s1.secret, 1));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(await storageHoldsNoToken(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the profile card shows two-factor On, and regenerating backup codes needs the password and shows the new codes once', async () => {
    const { page, errors } = sessionA;
    await page.goto(`${URLS.admin}/profile`);
    const card = page.getByRole('region', { name: 'Two-factor authentication' });
    await expect(card.getByText('On', { exact: true })).toBeVisible();
    await expect(card.getByText('10 of 10')).toBeVisible();
    // Required for admin accounts, so there is no Turn off.
    await expect(card.getByRole('button', { name: /turn off|disable/i })).toHaveCount(0);

    const before = await db().adminBackupCode.findMany({ where: { adminId: s1.id, usedAt: null } });
    expect(before).toHaveLength(10);

    await card.getByRole('button', { name: 'Regenerate backup codes' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Password').fill('wrong-password-123');
    await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Incorrect password');

    await dialog.getByLabel('Password').fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Regenerate', exact: true }).click();
    await expect(dialog.getByRole('listitem')).toHaveCount(10);
    freshCodes = (await dialog.getByRole('listitem').allInnerTexts()).map((t) => t.replace('-', ''));
    expect(freshCodes.every((c) => /^[A-HJ-NP-Z2-9]{10}$/.test(c))).toBe(true);

    // Shown once: Done stays disabled until the operator says they saved them, and Escape does not close it.
    const done = dialog.getByRole('button', { name: 'Done' });
    await expect(done).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('I have saved these codes').check();
    await done.click();
    await expect(dialog).toHaveCount(0);
    await expect(card.getByText('10 of 10')).toBeVisible();

    // The old codes are gone and replaced by ten new ones, stored hashed.
    const after = await db().adminBackupCode.findMany({ where: { adminId: s1.id, usedAt: null } });
    expect(after).toHaveLength(10);
    const oldIds = new Set(before.map((r: { id: string }) => r.id));
    expect(after.some((r: { id: string }) => oldIds.has(r.id))).toBe(false);
    expect(after.every((r: { codeHash: string }) => r.codeHash.startsWith('$argon2'))).toBe(true);
    expect(errors).toEqual([]);
  });

  test('a superadmin resets another admin; a second reset says there is nothing to reset; your own record cannot be reset', async () => {
    const { page, errors } = sessionA;
    expect(await db().adminUser.findUnique({ where: { id: target.id }, select: { totpEnabledAt: true } })).toMatchObject({
      totpEnabledAt: expect.any(Date),
    });

    await page.goto(`${URLS.admin}/settings/roles/edit/${target.id}`);
    const card = page.getByRole('region', { name: 'Two-factor authentication' });
    await card.getByRole('button', { name: 'Reset two-factor' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: /Reset two-factor for Amara Okafor\?/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Reset two-factor' }).click();
    await expect(page.getByText('Two-factor reset', { exact: false }).first()).toBeVisible();
    await expect(dialog).toHaveCount(0);

    const row = await db().adminUser.findUnique({ where: { id: target.id }, select: { totpEnabledAt: true, totpSecretEncrypted: true } });
    expect(row.totpEnabledAt).toBeNull();
    expect(row.totpSecretEncrypted).toBeNull();
    expect(await db().adminBackupCode.count({ where: { adminId: target.id } })).toBe(0);
    const audit = await db().adminActionLog.findFirst({ where: { targetId: target.id, action: 'admin_user.two_factor_reset' } });
    expect(audit).not.toBeNull();

    // Reset again: nothing to reset (409), shown as a plain banner, not an error page.
    await card.getByRole('button', { name: 'Reset two-factor' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Reset two-factor' }).click();
    await expect(page.getByText('There is nothing to reset for this admin.', { exact: false })).toBeVisible();

    // Your own record: the button is disabled and says another superadmin must do it.
    await page.goto(`${URLS.admin}/settings/roles/edit/${s1.id}`);
    await expect(page.getByRole('region', { name: 'Two-factor authentication' }).getByRole('button', { name: 'Reset two-factor' })).toBeDisabled();
    await expect(page.getByText('You cannot reset your own two-factor authentication.', { exact: false })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('a backup code signs in once the authenticator code is not used', async ({ browser }) => {
    const b = await newAdminPage(browser);
    await passwordStep(b.page, s1.email);
    await expect(b.page.getByRole('heading', { name: /Enter your authentication code/ })).toBeVisible();
    await b.page.getByRole('button', { name: 'Use a backup code instead' }).click();
    await expect(b.page.getByRole('heading', { name: /Enter a backup code/ })).toBeVisible();

    // Not one of the codes that existed before the regenerate: those are gone, so a spent/old code is refused.
    await b.page.getByLabel('Backup code').fill(s1.backupCodes[0]);
    await b.page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(b.page.getByRole('alert')).toHaveText(INVALID_CODE);

    await b.page.getByLabel('Backup code').fill(freshCodes[0]);
    await b.page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(b.page).toHaveURL(/\/dashboard/);
    expect(await storageHoldsNoToken(b.page)).toBe(true);
    expect(b.errors).toEqual([]);
    expect(await db().adminBackupCode.count({ where: { adminId: s1.id, usedAt: { not: null } } })).toBe(1);
    await b.ctx.close();
  });

  test('enrolment at sign-in (ADMIN_2FA_ENFORCED=true): scan or type the key, confirm, then save the backup codes before entering the Console', async ({ browser }) => {
    test.skip(!ENFORCED, 'Needs ADMIN_2FA_ENFORCED=true in the API environment: run with ADMIN_2FA_ENFORCED=true npx playwright test 23');
    const e = await createAdmin('enrol', 'Eve Enrol');
    const { ctx, page, errors } = await newAdminPage(browser);
    await passwordStep(page, e.email);

    await expect(page.getByRole('heading', { name: /Set up two-factor authentication/ })).toBeVisible();
    await expect(page.locator('svg').first()).toBeVisible(); // the QR code, drawn in the browser
    await page.getByRole('button', { name: /Can.t scan\? Enter a setup key instead/ }).click();
    const key = (await page.getByLabel('Setup key').innerText()).replace(/\s+/g, '');
    expect(key).toMatch(/^[A-Z2-7]{16,}$/);
    await page.getByRole('button', { name: 'Back to the QR code' }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();

    await page.getByLabel('Authentication code').fill('000000');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(INVALID_CODE);

    await page.getByLabel('Authentication code').fill(totp(key));
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Save your backup codes/ })).toBeVisible();
    await expect(page.getByRole('listitem')).toHaveCount(10);

    // The server already issued the session, but the Console stays closed until the codes are saved.
    const cont = page.getByRole('button', { name: 'Continue to the Admin Console' });
    await expect(cont).toBeDisabled();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('I have saved these codes').check();
    await cont.click();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(await storageHoldsNoToken(page)).toBe(true);
    expect(await db().adminUser.findUnique({ where: { id: e.id }, select: { totpEnabledAt: true } })).toMatchObject({
      totpEnabledAt: expect.any(Date),
    });
    expect(errors).toEqual([]);
    await ctx.close();
  });
});
