import { test, expect } from '@playwright/test';
import {
  api,
  clearBrowserSession,
  everythingScriptCanRead,
  heldAccessToken,
  plantAccessToken,
  refreshCookie,
  refreshWithCookie,
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
import { URLS, USER_PASSWORD } from '../support/stack';

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

  // B-246 (Decision Log #422): the access token is in MEMORY only; the refresh token is an httpOnly
  // cookie script cannot read. "Stay signed in" decides whether that cookie outlives the browser.
  test('the session is in memory + an httpOnly cookie: no token in either storage; "Stay signed in" makes the cookie persistent', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'stay' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);

    const held = await heldAccessToken(page);
    expect(held).toBeTruthy();
    // Nothing script can read holds the access token or a token-named key.
    const readable = await everythingScriptCanRead(page);
    expect(readable).not.toContain(held as string);
    expect(readable).not.toMatch(/sn_access_token|sn_refresh_token|sn_rt/);

    // Without "Stay signed in": a SESSION cookie (no expiry), httpOnly, SameSite=Strict, host-only, path /auth.
    const sessionCookie = await refreshCookie(page);
    expect(sessionCookie, 'the API set the sn_rt refresh cookie').toBeDefined();
    expect(sessionCookie!.httpOnly).toBe(true);
    expect(sessionCookie!.sameSite).toBe('Strict');
    expect(sessionCookie!.path).toBe('/auth');
    expect(sessionCookie!.expires).toBe(-1);
    await clearBrowserSession(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(a.email);
    await page.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await page.getByLabel('Stay signed in.').check();
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    // With it: a PERSISTENT cookie (the 30-day refresh lifetime), still httpOnly + Strict.
    const persistent = await refreshCookie(page);
    expect(persistent).toBeDefined();
    expect(persistent!.httpOnly).toBe(true);
    expect(persistent!.sameSite).toBe('Strict');
    expect(persistent!.expires).toBeGreaterThan(Date.now() / 1000 + 20 * 24 * 3600);
    expect(await everythingScriptCanRead(page)).not.toMatch(/sn_access_token|sn_refresh_token|sn_rt/);
  });

  // B-248 (Decision Log #422 item 3): cookie mode is the API's DEFAULT for a request from an allowlisted
  // browser Origin. A browser call that forgets the X-Auth-Mode header must STILL get no refresh token in the
  // body and the httpOnly cookie instead. (The admin side is covered by the API jest e2e: admin login is
  // throttled to 5 per 15 minutes, Decision Log #190.)
  test('B-248: a header-less browser POST /auth/login gets the sn_rt cookie and no refreshToken in the body', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'hdrless' });
    await page.goto('/login'); // any page on the web origin; the browser adds the Origin header itself
    const outcome = await page.evaluate(
      async ({ api, email, password }) => {
        // Deliberately NO X-Auth-Mode header.
        const res = await fetch(`${api}/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        return { status: res.status, body: await res.json() };
      },
      { api: URLS.api, email: a.email, password: USER_PASSWORD },
    );
    expect(outcome.status).toBe(200);
    expect(typeof outcome.body.accessToken).toBe('string');
    expect(outcome.body).not.toHaveProperty('refreshToken');

    const cookie = await refreshCookie(page);
    expect(cookie, 'the API set the sn_rt refresh cookie without the header').toBeDefined();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    expect(cookie!.path).toBe('/auth');
  });

  test('a reload restores the session from the cookie before anything renders (no login flash)', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'restore' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('rest'));
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    const before = (await refreshCookie(page))!.value;

    // Watch every DOM mutation: a signed-out prompt must never be painted on the way.
    let flashed = false;
    await page.exposeFunction('__sawLoginPrompt', () => {
      flashed = true;
    });
    await page.addInitScript(() => {
      new MutationObserver(() => {
        if (document.body?.innerText.includes('Log in to see your feed')) (window as any).__sawLoginPrompt();
      }).observe(document, { childList: true, subtree: true, characterData: true });
    });

    await page.reload();
    await expect(page).toHaveURL(/\/community$/);
    await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
    expect(flashed, 'the signed-out feed prompt flashed up during the restore').toBe(false);
    // The restore refreshed through the cookie, which rotated.
    expect((await refreshCookie(page))!.value).not.toBe(before);
    expect(await heldAccessToken(page)).toBeTruthy();
    expect(await everythingScriptCanRead(page)).not.toMatch(/sn_access_token|sn_refresh_token|sn_rt/);
  });

  test('a signed-out cold load restores nothing and shows no error banner or app console error', async ({ page }) => {
    // Every console error with the URL it came from, and every non-OK response.
    const consoleErrors: { text: string; url: string }[] = [];
    const notOk: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push({ text: m.text(), url: m.location().url });
    });
    page.on('pageerror', (e) => consoleErrors.push({ text: String(e), url: '' }));
    page.on('response', (r) => {
      if (r.status() >= 400) notOk.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    expect(await heldAccessToken(page)).toBeNull();
    await expect(page.getByRole('alert')).toHaveCount(0);
    // The ONLY failed request is the start-up refresh answering 401 (no cookie): by design, not an error banner.
    expect(notOk.filter((line) => !line.includes('/favicon'))).toEqual([`401 POST ${URLS.api}/auth/refresh`]);
    // Console: nothing from the app. The browser itself logs a one-line note for any 4xx response; allow only
    // the note for that refresh (and a missing favicon).
    const appErrors = consoleErrors.filter((e) => !e.url.endsWith('/auth/refresh') && !e.url.includes('/favicon'));
    expect(appErrors).toEqual([]);
  });

  test('an expired access token is silently refreshed through the cookie (and the cookie rotates)', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'refresh' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('refr'));
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    const before = (await refreshCookie(page))!.value;
    // Same shape the app decodes (sub, role) but expired and badly signed: the server answers 401.
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const expired = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: a.userId, role: 'user', iat: 1, exp: 2 })}.x`;
    await plantAccessToken(page, expired);

    // An authenticated call through the app's own fetch (the silent-refresh wrapper): it 401s on the
    // expired token, refreshes through the cookie (no body), and is replayed once with the new token.
    const status = await page.evaluate(
      async ([apiBase, id, token]) => {
        const res = await window.fetch(`${apiBase}/users/${id}`, { headers: { Authorization: `Bearer ${token}` } });
        return res.status;
      },
      [URLS.api, a.userId, expired],
    );
    expect(status).toBe(200);
    const after = await heldAccessToken(page);
    expect(after).toBeTruthy();
    expect(after).not.toBe(expired);
    expect((await refreshCookie(page))!.value).not.toBe(before);
    await page.goto('/profile');
    await expect(page.getByText('Log in to view your profile.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toBeVisible();
  });

  test('log out calls the server, clears the session and the cookie, and the old refresh cookie is dead', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'logout' });
    await verifyEmailViaApi(a);
    await setUsername(a, uniqueUsername('lo'));
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    const oldCookie = (await refreshCookie(page))!.value;
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await heldAccessToken(page)).toBeNull();
    await expect.poll(async () => await refreshCookie(page), { message: 'POST /auth/logout cleared sn_rt' }).toBeUndefined();
    const reuse = await refreshWithCookie(oldCookie);
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
