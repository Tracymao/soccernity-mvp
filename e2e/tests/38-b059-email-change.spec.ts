import * as fs from 'fs';
import * as path from 'path';
import { createHash, createHmac, randomBytes } from 'crypto';
import { test, expect, type Page } from '@playwright/test';
import {
  api,
  db,
  emailsFor,
  guardianConfirmViaApi,
  loginViaUi,
  me,
  registerViaApi,
  uniqueEmail,
  userByEmail,
  userLogin,
  verifyEmailViaApi,
  type Account,
} from '../support/helpers';
import { USER_PASSWORD } from '../support/stack';

// B-059 (Decision Log #472): Account Information and the email-change steps, in real Chrome against the real API,
// Postgres and Redis. Scoped to this work; no other Playwright spec is run by it.
//
// Real email is not sent in tests, and the email-change emails are deliberately QUIET in the API log (the link must
// not reach a log), so the link cannot be read from there. The clearly labelled workaround: the request is made
// through the real UI and API, then the secret of that REAL pending request is replaced in Postgres with one this
// spec knows (only its SHA-256 is stored, so the real secret cannot be recovered). The confirm route is then exercised
// with a genuine, single-use, server-checked link for that request.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b059-email-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const INFO = '/settings/account/information';
const FLOW = '/settings/account/information/change-email';

// RFC 6238 TOTP (SHA-1, 6 digits, 30 s): the same parameters the API uses. Kept in this spec on purpose.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret: string, stepOffset = 0): string {
  let bits = '';
  for (const ch of secret.replace(/[\s=]/g, '').toUpperCase()) bits += BASE32.indexOf(ch).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30) + stepOffset));
  const hmac = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const o = hmac[hmac.length - 1] & 0x0f;
  const bin = ((hmac[o] & 0x7f) << 24) | (hmac[o + 1] << 16) | (hmac[o + 2] << 8) | hmac[o + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

async function signIn(page: Page, email: string, password = USER_PASSWORD): Promise<void> {
  await loginViaUi(page, email, password);
  await expect(page).not.toHaveURL(/\/login/);
}

/** Settings > Account > the Account information row, the way a person gets there. */
async function openInfo(page: Page): Promise<void> {
  await page.goto('/settings/account');
  await page.getByRole('link', { name: /account information/i }).click();
  await expect(page).toHaveURL(new RegExp(`${INFO}$`));
  await expect(page.getByRole('heading', { name: 'Account Information' })).toBeVisible();
}

async function startFlow(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Change email' }).click();
  await expect(page).toHaveURL(new RegExp(`${FLOW}$`));
  await expect(page.getByText('Enter your password to continue.')).toBeVisible();
}

async function passwordStep(page: Page, password = USER_PASSWORD): Promise<void> {
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter the new address you want to use.')).toBeVisible();
}

async function sendLink(page: Page, address: string): Promise<void> {
  await page.getByLabel('New email address').fill(address);
  await page.getByRole('button', { name: 'Send link' }).click();
}

async function emailRowsFor(userId: string): Promise<any[]> {
  return db().emailChangeRequest.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

/** Gives the user's one pending REAL request a secret this spec knows; returns the path of its link. */
async function knownLinkFor(userId: string): Promise<string> {
  const rows = await emailRowsFor(userId);
  expect(rows).toHaveLength(1);
  const secret = `qa-${randomBytes(16).toString('hex')}`;
  await db().emailChangeRequest.update({
    where: { id: rows[0].id },
    data: { tokenHash: createHash('sha256').update(secret).digest('hex') },
  });
  return `/email-change/confirm?token=${secret}`;
}

test.describe.serial('Account Information and email change', () => {
  let acct: Account;
  const newEmail = uniqueEmail('new-addr');

  test.beforeAll(async () => {
    acct = await registerViaApi({ age: 30, label: 'ec' });
    await verifyEmailViaApi(acct);
  });

  test('the Account row opens Account Information; email and date of birth are read-only; the phone is saved', async ({ page }) => {
    await signIn(page, acct.email);
    await openInfo(page);
    await expect(page.getByLabel('Email')).toHaveValue(acct.email);
    await expect(page.getByLabel('Email')).toHaveJSProperty('readOnly', true);
    await expect(page.getByLabel('Date of birth')).toHaveJSProperty('readOnly', true);
    await expect(page.getByText('Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await expect(page.getByText('Username and country are changed in Edit Profile.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    await page.getByLabel('Phone Number').fill('12');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Enter a phone number with 7 to 20 digits, spaces or dashes.')).toBeVisible();

    await page.getByLabel('Phone Number').fill('+2348100000123');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Phone number saved.')).toBeVisible();
    expect((await userByEmail(acct.email)).phone).toBe('+2348100000123');
    await shot(page, '01-account-information-desktop');
  });

  test('wrong password: the real server refuses it, the frame error shows on the password step', async ({ page }) => {
    await signIn(page, acct.email);
    await openInfo(page);
    await startFlow(page);
    await shot(page, '02-confirm-password-desktop');
    await passwordStep(page, 'not-my-password');
    await sendLink(page, newEmail);
    await expect(page.getByText('That password isn’t right. Check it and try again.')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Forgot your password?' })).toBeVisible();
    await shot(page, '03-wrong-password-desktop');
    expect(await emailRowsFor(acct.userId)).toHaveLength(0);
  });

  test('a taken address gets the same "Check your inbox" screen as any other (Decision Log #476)', async ({ page }) => {
    const taken = await registerViaApi({ age: 30, label: 'ec-taken' });
    await signIn(page, acct.email);
    await openInfo(page);
    await startFlow(page);
    await passwordStep(page);

    await sendLink(page, taken.email);
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByText(`We sent a link to ${taken.email}.`)).toBeVisible();
    await expect(page.getByText('We couldn’t use that email address.')).toHaveCount(0);
    await shot(page, '04-taken-address-same-screen-desktop');
    // Nothing is linked to the account: the taken address gets a different email, not a confirm link.
    expect(await emailRowsFor(acct.userId)).toHaveLength(0);
  });

  test('a good change: link sent, old address told, the emailed link verifies it, sessions end, the new address logs in', async ({ page, context }) => {
    // A second session whose refresh token the change must end.
    const other = await userLogin(acct.email, USER_PASSWORD);
    expect(other.status).toBeLessThan(300);

    await signIn(page, acct.email);
    await openInfo(page);
    await startFlow(page);
    await passwordStep(page);
    await sendLink(page, newEmail);

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByText(`We sent a link to ${newEmail}.`)).toBeVisible();
    await expect(page.getByText('Your email stays the same until you use the link. The link only works for a limited time.')).toBeVisible();
    await expect(page.getByText('We’ve also told your current address about this change. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await expect(page.getByText('Your guardian will be told about this change.')).toHaveCount(0);
    // Nothing on screen states a lifetime or a wait.
    expect(await page.locator('body').innerText()).not.toMatch(/\b\d+\s*(minutes?|hours?|seconds?|days?)\b/i);
    await shot(page, '05-check-your-inbox-desktop');

    // The server really did it: one pending request, the link went to the NEW address, the notice to the OLD one.
    const rows = await emailRowsFor(acct.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].newEmail).toBe(newEmail.toLowerCase());
    expect((await userByEmail(acct.email)).email).toBe(acct.email); // unchanged until the link is used
    const firstLink = await knownLinkFor(acct.userId);

    // Send the link again: a new request replaces the first, the first link stops working.
    await page.getByRole('button', { name: 'Send the link again' }).click();
    await expect(page.getByText('We sent the link again.')).toBeVisible();
    expect(await emailRowsFor(acct.userId)).toHaveLength(1);
    const secondLink = await knownLinkFor(acct.userId);

    // The first (superseded) link is dead: Link expired, nothing changed.
    const stale = await context.newPage();
    await stale.goto(firstLink);
    await expect(stale.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await shot(stale, '06-link-expired-desktop');
    await expect(stale.getByRole('link', { name: 'Start again' })).toBeVisible();
    await expect(stale.getByRole('link', { name: 'Back to Account Information' })).toBeVisible();
    await stale.close();
    expect((await userByEmail(acct.email)).email).toBe(acct.email);

    // The current link, opened from the emailed address in a fresh page, is public and works once.
    const confirm = await context.newPage();
    await confirm.goto(secondLink);
    await expect(confirm.getByRole('heading', { name: 'Your email is changed' })).toBeVisible();
    await expect(confirm.getByText('Use it to log in from now on.')).toBeVisible();
    await shot(confirm, '07-verified-desktop');

    const after = await db().user.findUnique({ where: { id: acct.userId } });
    expect(after.email).toBe(newEmail.toLowerCase());
    expect(after.verificationStatus).toBe('verified');

    // Every session ended: the other session's refresh token is dead, and this browser is signed out.
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: other.body.refreshToken } })).status).toBe(401);
    await confirm.goto('/settings/account');
    await expect(confirm.getByText(/log in to manage your account/i)).toBeVisible();

    // A used link cannot be used again.
    await confirm.goto(secondLink);
    await expect(confirm.getByRole('heading', { name: 'This link has expired' })).toBeVisible();

    // The old address no longer signs in; the new one does.
    expect((await userLogin(acct.email, USER_PASSWORD)).status).toBe(401);
    expect((await userLogin(newEmail, USER_PASSWORD)).status).toBeLessThan(300);
    await confirm.close();
    acct = { ...acct, email: newEmail };
  });

  test('a link with no token or an unknown token is Link expired, with no sign-in needed', async ({ page }) => {
    await page.goto('/email-change/confirm');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
    await page.goto('/email-change/confirm?token=not-a-real-token');
    await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
  });

  test('390px: Account Information and the steps fit, buttons stack', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    await signIn(page, acct.email);
    await page.goto(INFO);
    await expect(page.getByRole('heading', { name: 'Account Information' })).toBeVisible();
    for (const url of [INFO, FLOW]) {
      await page.goto(url);
      await expect(page.getByRole('heading', { name: /Account Information|Change email/ })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    }
    await shot(page, '08-confirm-password-mobile');
    await page.goto(INFO);
    await expect(page.getByLabel('Email')).toBeVisible();
    await shot(page, '09-account-information-mobile');
    await context.close();
  });
});

test.describe.serial('email change with two-factor on', () => {
  let acct: Account;
  let secret = '';
  const newEmail = uniqueEmail('tf-new');

  test.beforeAll(async () => {
    acct = await registerViaApi({ age: 30, label: 'ec-tf' });
    await verifyEmailViaApi(acct);
  });

  test('the code step appears only after the server asks, a wrong code is refused, the right one sends the link', async ({ page }) => {
    // Sign in first, THEN turn two-factor on through the API: a code step is used once per 30-second step (replay is
    // refused), so the enrolment code, a sign-in code and this flow's code would otherwise collide.
    await signIn(page, acct.email);
    const { token } = await me(acct);
    const start = await api('POST', '/auth/two-factor/enrol/start', { token });
    expect(start.status).toBeLessThan(300);
    secret = start.body.secret;
    const enrol = await api('POST', '/auth/two-factor/enrol/confirm', { token, body: { code: totp(secret) } });
    expect(enrol.status).toBeLessThan(300);

    await page.goto(INFO);
    await startFlow(page);
    await passwordStep(page);
    // Nothing asked for a code yet.
    await expect(page.getByLabel('Authenticator code')).toHaveCount(0);
    await sendLink(page, newEmail);

    await expect(page.getByLabel('Authenticator code')).toBeVisible();
    await expect(page.getByText('Enter the 6-digit code from your authenticator app.')).toBeVisible();
    await shot(page, '10-two-factor-code-desktop');

    await page.getByLabel('Authenticator code').fill('000000');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('That code didn’t work. Check it and try again.')).toBeVisible();
    expect(await emailRowsFor(acct.userId)).toHaveLength(0);

    await page.getByLabel('Authenticator code').fill(totp(secret, 1)); // the next step: the enrolment used this one
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    expect(await emailRowsFor(acct.userId)).toHaveLength(1);
  });
});

test.describe.serial('email change for a minor', () => {
  test('an under-18 with a confirmed guardian is told the guardian will be told, and the guardian is emailed', async ({ page }) => {
    const minor = await registerViaApi({ age: 14, label: 'ec-minor' });
    await verifyEmailViaApi(minor);
    await guardianConfirmViaApi(minor);
    const target = uniqueEmail('minor-new');

    await signIn(page, minor.email);
    await page.goto(INFO);
    await startFlow(page);
    await passwordStep(page);
    await sendLink(page, target);

    await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    await expect(page.getByText('We’ve also told your current address about this change. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await expect(page.getByText('Your guardian will be told about this change. [COPY PENDING LEGAL REVIEW]')).toBeVisible();
    await shot(page, '11-check-your-inbox-under-18-desktop');

    // Using the link tells the guardian (the one real guardian notice of this event).
    const link = await knownLinkFor(minor.userId);
    const before = emailsFor(minor.guardianEmail!, 'guardian-security-notice').length;
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Your email is changed' })).toBeVisible();
    await expect.poll(() => emailsFor(minor.guardianEmail!, 'guardian-security-notice').length).toBeGreaterThan(before);
    expect((await db().user.findUnique({ where: { id: minor.userId } })).email).toBe(target.toLowerCase());
  });

  test('a restricted-pending minor gets a plain line, not a raw error, and nothing is created', async ({ page }) => {
    const minor = await registerViaApi({ age: 13, label: 'ec-pending' });
    await verifyEmailViaApi(minor);
    // The guardian has NOT confirmed: the account is restricted-pending. Read-only pages open by URL.
    await signIn(page, minor.email);
    await page.goto(FLOW);
    await expect(page.getByText('Enter your password to continue.')).toBeVisible();
    await passwordStep(page);
    await sendLink(page, uniqueEmail('pending-new'));
    await expect(
      page.getByText('Changing your email isn’t available until your guardian has approved your account.'),
    ).toBeVisible();
    await shot(page, '12-restricted-pending-desktop');
    expect(await emailRowsFor(minor.userId)).toHaveLength(0);
  });
});
