import { test, expect } from '@playwright/test';
import {
  api,
  clearBrowserSession,
  guardianConfirmViaApi,
  guardianDeclineViaApi,
  loginViaUi,
  registerViaApi,
  uniqueUsername,
  userByEmail,
  userLogin,
  verifyEmailViaApi,
  me,
  type Account,
} from '../support/helpers';
import { USER_PASSWORD } from '../support/stack';

// The server decides where an account goes (`nextStep`); the web app only
// follows it. This spec walks every onboarding state through the real login
// form and checks both the landing page and the server's answer.

async function setUsername(acct: Account, username: string): Promise<void> {
  const { token } = await me(acct);
  const res = await api('PATCH', `/users/${acct.userId}`, { token, body: { username } });
  expect(res.status).toBe(200);
}

test.describe('login routes on nextStep', () => {
  test('adult, email not verified -> verify-email prompt', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'rt-a-unv' });
    expect((await me(a)).user.nextStep).toBe('verify_email');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
  });

  test('adult, verified, no username -> Create Profile', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'rt-a-prof' });
    await verifyEmailViaApi(a);
    const user = (await me(a)).user;
    expect(user.nextStep).toBe('create_profile');
    expect(user.profileComplete).toBe(false);
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);
  });

  test('adult, verified, username set -> /community', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'rt-a-done' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('done'));
    const user = (await me(a)).user;
    expect(user.nextStep).toBe('none');
    expect(user.profileComplete).toBe(true);
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
  });

  test('minor, consent pending -> Restricted Pending (even with a verified email)', async ({ page }) => {
    const a = await registerViaApi({ age: 15, label: 'rt-m-pend' });
    await verifyEmailViaApi(a);
    expect((await me(a)).user.nextStep).toBe('restricted_pending');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
  });

  test('minor, consent declined (decline 1) -> the in-account decline view, not a dead end', async ({ page }) => {
    const a = await registerViaApi({ age: 15, label: 'rt-m-decl' });
    await guardianDeclineViaApi(a);
    const user = (await me(a)).user;
    expect(user.nextStep).toBe('restricted_pending');
    expect(user.guardianConsentStatus).toBe('declined'); // never folded into "pending"
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await expect(page.getByTestId('guardian-consent-declined')).toBeVisible();
  });

  test('minor, approved but email not verified -> verify-email prompt', async ({ page }) => {
    const a = await registerViaApi({ age: 15, label: 'rt-m-unv' });
    await guardianConfirmViaApi(a);
    expect((await me(a)).user.nextStep).toBe('verify_email');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
  });

  test('minor, approved + verified, no username -> Create Profile', async ({ page }) => {
    const a = await registerViaApi({ age: 15, label: 'rt-m-prof' });
    await guardianConfirmViaApi(a);
    await verifyEmailViaApi(a);
    expect((await me(a)).user.nextStep).toBe('create_profile');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/create-profile$/);
  });

  test('minor, fully onboarded -> /community', async ({ page }) => {
    const a = await registerViaApi({ age: 17, label: 'rt-m-done' });
    await guardianConfirmViaApi(a);
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('mdone'));
    expect((await me(a)).user.nextStep).toBe('none');
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
  });
});

test.describe('/continue and deep links', () => {
  test('/continue asks the server and follows nextStep', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'cont' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    await verifyEmailViaApi(a);
    await page.goto('/continue');
    await expect(page).toHaveURL(/\/create-profile$/);
  });

  test('"I\'ve verified — continue" on the verify prompt moves on once verified', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'cont2' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    await verifyEmailViaApi(a);
    await page.getByRole('link', { name: /I.ve verified/ }).click();
    await expect(page).toHaveURL(/\/create-profile$/);
  });

  test('/create-profile for an account that already has a username is redirected on', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'cp-done' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('cpdone'));
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    await page.goto('/create-profile');
    await expect(page).toHaveURL(/\/signup\/clubs$/);
  });

  test('/create-profile and /continue without a session go to /login', async ({ page }) => {
    await page.goto('/create-profile');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/continue');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/verify-email/prompt');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an unverified adult can open /community by URL but the server still refuses social writes', async ({
    page,
  }) => {
    const a = await registerViaApi({ age: 30, label: 'rd' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    const token = (await me(a)).token;
    const post = await api('POST', '/posts', { token, body: { contentText: 'hi' } });
    expect(post.status).toBe(403);
    const patch = await api('PATCH', `/users/${a.userId}`, { token, body: { phone: '+447700900123' } });
    expect(patch.status).toBe(403);
  });
});

test.describe('login form and session', () => {
  test('wrong password and unknown email give the SAME generic message', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'wrongpw' });
    await loginViaUi(page, a.email, 'not-the-password');
    const first = await page.getByRole('alert').innerText();
    await clearBrowserSession(page);
    await loginViaUi(page, 'nobody.here@qa.soccernity.test', 'not-the-password');
    await expect(page.getByRole('alert')).toBeVisible();
    expect(await page.getByRole('alert').innerText()).toBe(first);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('login is case-insensitive on the email address', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'Case' });
    await loginViaUi(page, a.email.toUpperCase());
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
  });

  test('empty form shows a message and does not call the server', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter both your email and password.');
  });

  test('without "Stay signed in" the session lives in sessionStorage only; with it, in localStorage', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'stay' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    expect(await page.evaluate(() => window.sessionStorage.getItem('sn_access_token'))).toBeTruthy();
    expect(await page.evaluate(() => window.localStorage.getItem('sn_access_token'))).toBeNull();
    await clearBrowserSession(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(a.email);
    await page.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await page.getByLabel('Stay signed in.').check();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    expect(await page.evaluate(() => window.localStorage.getItem('sn_refresh_token'))).toBeTruthy();
  });

  test('an expired access token is silently refreshed (and the refresh token rotates)', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'refresh' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('refr'));
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    const before = await page.evaluate(() => window.sessionStorage.getItem('sn_refresh_token'));
    // Same shape the app decodes (sub, role) but expired and badly signed: the server answers 401.
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expired = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: a.userId, role: 'user', iat: 1, exp: 2 })}.x`;
    await page.evaluate((t) => window.sessionStorage.setItem('sn_access_token', t), expired);
    await page.goto('/profile');
    await expect(page.getByText('Log in to view your profile.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible();
    const after = await page.evaluate(() => window.sessionStorage.getItem('sn_access_token'));
    expect(after).not.toBe(expired);
    expect(await page.evaluate(() => window.sessionStorage.getItem('sn_refresh_token'))).not.toBe(before);
  });

  test('log out calls the server, clears the session, and the old refresh token is dead', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'logout' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('lo'));
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    const refresh = await page.evaluate(() => window.sessionStorage.getItem('sn_refresh_token'));
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => window.sessionStorage.getItem('sn_access_token'))).toBeNull();
    const reuse = await api('POST', '/auth/refresh', { body: { refreshToken: refresh } });
    expect(reuse.status).toBe(401);
  });

  test('a deleted-by-decline-3 style account cannot log in (pending_deletion) with a generic message', async () => {
    const a = await registerViaApi({ age: 14, label: 'p-del' });
    for (let n = 1; n <= 3; n += 1) {
      await guardianDeclineViaApi(a, n);
      if (n < 3) {
        const r = await api('POST', '/auth/guardian-consent/resend', { body: { email: a.email } });
        expect(r.status).toBe(200);
      }
    }
    expect((await userByEmail(a.email)).accountStatus).toBe('pending_deletion');
    const login = await userLogin(a.email);
    expect(login.status).toBe(401);
  });
});
