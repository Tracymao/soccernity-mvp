import { createHmac } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import {
  api,
  everythingScriptCanRead,
  loginViaUi,
  me,
  registerViaApi,
  uniqueUsername,
  userLogin,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { USER_PASSWORD } from '../support/stack';

// B-087 / B-111: the user-side two-factor screens (authenticator app) against the real API,
// Postgres and Redis. One serial journey: enrol, sign out, sign in with a code, sign in with a
// backup code, regenerate, turn off. Only this PR's work is covered here.
//
// The TOTP helper lives in this spec on purpose (shared files under e2e/support are not edited).
// RFC 6238, SHA-1, 6 digits, 30 s -- the same parameters the API uses.

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error(`not base32: ${ch}`);
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** The code for the 30-second step that contains `atMs`, moved by `stepOffset` steps. */
function totp(secret: string, stepOffset = 0, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30) + stepOffset;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin =
    ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

const PAGE = '/settings/security/two-factor';

/** Sign out through the real header: avatar -> "Log out". */
async function logOutViaHeader(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function readBackupCodes(page: Page): Promise<string[]> {
  await expect(page.getByLabel(/^Code \d+$/)).toHaveCount(10);
  const out: string[] = [];
  for (let i = 1; i <= 10; i += 1) {
    out.push((await page.getByLabel(`Code ${i}`, { exact: true }).innerText()).trim());
  }
  return out;
}

test.describe.serial('user two-factor (B-087 / B-111)', () => {
  let acct: Account;
  let secret = '';
  let firstCodes: string[] = [];
  let secondCodes: string[] = [];

  test.beforeAll(async () => {
    acct = await registerViaApi({ age: 30, label: 'tf-user' });
    await verifyEmailViaApi(acct);
    const { token } = await me(acct);
    const res = await api('PATCH', `/users/${acct.userId}`, { token, body: { username: uniqueUsername('tf') } });
    expect(res.status).toBe(200);
  });

  test('enrol: QR step, manual key, the 6-digit code, backup codes shown once, success', async ({ page }) => {
    await loginViaUi(page, acct.email);
    await expect(page).toHaveURL(/\/community$/);
    await page.goto(PAGE);

    await expect(page.getByText('Authenticator app', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Turn on' }).click();

    // Step 1: the QR code is drawn in the browser from the otpauth URI.
    await expect(page.getByText('Scan the QR code')).toBeVisible();
    await expect(page.getByRole('img', { name: /qr code for your authenticator app/i }).locator('svg')).toBeVisible();

    // The manual key is the same secret the QR encodes.
    await page.getByRole('button', { name: /can.t scan/i }).click();
    await expect(page.getByText('Enter the setup key')).toBeVisible();
    secret = ((await page.getByLabel('Setup key').innerText()) || '').replace(/\s+/g, '');
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);

    // A wrong code first: the drawn message, boxes cleared, nothing turned on.
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Enter the 6-digit code')).toBeVisible();
    const wrong = totp(secret, 5); // five steps away: outside the +-1 window
    await page.getByLabel('Digit 1 of 6').fill(wrong);
    await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That code didn’t work. Check your authenticator app and try again.',
    );

    // The right code turns it on and shows the ten backup codes once.
    await page.getByLabel('Digit 1 of 6').fill(totp(secret));
    await page.getByRole('button', { name: 'Turn on two-factor authentication' }).click();
    await expect(page.getByText('Save your backup codes')).toBeVisible();
    firstCodes = await readBackupCodes(page);
    expect(new Set(firstCodes).size).toBe(10);
    for (const c of firstCodes) expect(c).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);

    // Nothing sensitive in storage or cookies script can read.
    const readable = await everythingScriptCanRead(page);
    expect(readable).not.toContain(secret);
    for (const c of firstCodes) expect(readable).not.toContain(c.replace('-', ''));

    await page.getByRole('button', { name: /saved my codes/i }).click();
    await expect(page.getByText('Two-factor authentication is on', { exact: true })).toBeVisible();
    // The codes are gone from the page.
    await expect(page.getByLabel('Code 1', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('10 backup codes left.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Authenticator app: on' })).toBeVisible();

    // Reload: the status is read from the server, and the codes do not come back.
    await page.reload();
    await expect(page.getByText('10 backup codes left.')).toBeVisible();
  });

  test('sign out, then sign in with an authenticator code', async ({ page }) => {
    // The server refuses a TOTP step it has already accepted, so use the next step (inside the
    // +-1 window the server allows).
    await loginViaUi(page, acct.email);
    await expect(page.getByRole('heading', { name: 'Enter the 6-digit code' })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    // A wrong code first: the drawn message, nothing signed in.
    await page.getByLabel('Digit 1 of 6').fill(totp(secret, 5));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That code didn’t work. Check your authenticator app and try again.',
    );

    await page.getByLabel('Digit 1 of 6').fill(totp(secret, 1));
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/community$/);

    // Signed in for real: the settings page loads the status with the new session.
    await page.goto(PAGE);
    await expect(page.getByText('10 backup codes left.')).toBeVisible();
    await logOutViaHeader(page);
  });

  test('sign in with a backup code; the same code does not work twice', async ({ page }) => {
    const used = firstCodes[0];
    await loginViaUi(page, acct.email);
    await page.getByRole('button', { name: /can.t use your authenticator app\?/i }).click();
    await expect(page.getByRole('heading', { name: 'Enter a backup code' })).toBeVisible();
    await page.getByLabel('Backup code').fill(used);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/community$/);

    await page.goto(PAGE);
    await expect(page.getByText('9 backup codes left.')).toBeVisible();
    await logOutViaHeader(page);

    // The spent code is refused, with the drawn backup-code message.
    await loginViaUi(page, acct.email);
    await page.getByRole('button', { name: /can.t use your authenticator app\?/i }).click();
    await page.getByLabel('Backup code').fill(used);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That code didn’t work. Check your backup code and try again.',
    );
    await expect(page).toHaveURL(/\/login$/);
  });

  test('regenerate backup codes: wrong password refused, right password shows ten new codes and kills the old ones', async ({
    page,
  }) => {
    await loginViaUi(page, acct.email);
    await page.getByRole('button', { name: /can.t use your authenticator app\?/i }).click();
    await page.getByLabel('Backup code').fill(firstCodes[1]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/community$/);

    await page.goto(PAGE);
    await page.getByRole('button', { name: 'Get new backup codes' }).click();
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Get new backup codes' }).click();
    await expect(page.getByRole('alert')).toHaveText('That password is incorrect.');

    await page.getByLabel('Password').fill(USER_PASSWORD);
    await page.getByRole('button', { name: 'Get new backup codes' }).click();
    await expect(page.getByText('Save your backup codes')).toBeVisible();
    secondCodes = await readBackupCodes(page);
    expect(secondCodes.filter((c) => firstCodes.includes(c))).toHaveLength(0);
    await page.getByRole('button', { name: /saved my codes/i }).click();
    await expect(page.getByText('10 backup codes left.')).toBeVisible();

    // An old code (never used) no longer works; a new one does. Straight to the API: no UI needed.
    const challenge = await userLogin(acct.email);
    expect(challenge.body.twoFactorRequired).toBe(true);
    const old = await api('POST', '/auth/login/two-factor', {
      body: { challengeToken: challenge.body.challengeToken, code: firstCodes[2] },
    });
    expect(old.status).toBe(401);
    const fresh = await api('POST', '/auth/login/two-factor', {
      body: { challengeToken: challenge.body.challengeToken, code: secondCodes[0] },
    });
    expect([200, 201]).toContain(fresh.status);
    await logOutViaHeader(page);
  });

  test('turn off: wrong password refused, right password turns it off and sign-in is password-only again', async ({
    page,
  }) => {
    await loginViaUi(page, acct.email);
    await page.getByRole('button', { name: /can.t use your authenticator app\?/i }).click();
    await page.getByLabel('Backup code').fill(secondCodes[1]);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/community$/);

    await page.goto(PAGE);
    await page.getByRole('button', { name: 'Turn off', exact: true }).click();
    await expect(page.getByText('Turning this off makes your account less secure.')).toBeVisible();
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Turn off two-factor authentication' }).click();
    await expect(page.getByRole('alert')).toHaveText('That password is incorrect.');

    await page.getByLabel('Password').fill(USER_PASSWORD);
    await page.getByRole('button', { name: 'Turn off two-factor authentication' }).click();
    await expect(page.getByText('Two-factor authentication is off.')).toBeVisible();
    await expect(page.getByRole('img', { name: 'Authenticator app: off' })).toBeVisible();

    // Password-only sign-in again: tokens straight away, no challenge.
    const res = await userLogin(acct.email);
    expect(res.status === 200 || res.status === 201).toBe(true);
    expect(res.body.twoFactorRequired).toBeUndefined();
    expect(typeof res.body.accessToken).toBe('string');
  });
});
