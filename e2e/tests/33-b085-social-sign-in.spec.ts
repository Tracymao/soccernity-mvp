import path from 'node:path';
import { test, expect, type Browser, type Page, type Route } from '@playwright/test';
import { api, dobForAge, fillAgeGate } from '../support/helpers';
import { REPO, URLS } from '../support/stack';

// B-085 (Decision Log #378, #468): the social sign-in screens, in a real browser. Only the NEW screens are covered.
// The API runs with no Google or Facebook keys (the launch default), so the REAL answer to "which providers are
// enabled" is none: that case runs against the real API. Everything that needs a provider to have proved who the
// person is (the redirect, the callback outcomes, the email code, the final registration) is answered in the browser
// by Playwright, because no OAuth app exists. The Age Gate, the guardian step and the account-creation form are the
// app's own code.
//
// Figma frames: Login hidden 6965:46142, Register hidden 6965:46204, Enter your email 6966:46142, invalid email
// 6966:46212, cancelled 6966:46289, refused or failed 6966:46362, hand-off 6966:46438, Social Sign-In block 5418:7141.

const SHOTS = path.join(REPO, 'docs', 'b085-screens');
const CORS = {
  'access-control-allow-origin': URLS.web,
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': 'content-type, authorization, x-auth-mode',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  vary: 'Origin',
};

async function mobilePage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  return ctx.newPage();
}

type Handler = (body: any) => { status?: number; body: unknown };

/** Answers /auth/social/** in the browser. Returns the calls it saw, in order. */
async function mockSocial(page: Page, handlers: Record<string, Handler>): Promise<{ path: string; body: any }[]> {
  const seen: { path: string; body: any }[] = [];
  await page.context().route(`${URLS.api}/auth/social/**`, async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const route_ = new URL(request.url()).pathname.replace('/auth/social/', '');
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    seen.push({ path: route_, body });
    const handler = handlers[route_];
    if (!handler) {
      await route.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'application/json' }, body: '{}' });
      return;
    }
    const answer = handler(body);
    await route.fulfill({
      status: answer.status ?? 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify(answer.body),
    });
  });
  return seen;
}

/**
 * Records every URL the page navigates to. The sign-in routes onward to a page that calls the REAL API with the fake
 * token this spec hands out, and that page then signs the person out again, so "where did it land" is read from the
 * navigations, not from the final URL.
 */
function trackNavigations(page: Page): string[] {
  const urls: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) urls.push(new URL(frame.url()).pathname);
  });
  return urls;
}

async function noSideScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

/** What the browser would hold after the app sent it to the provider: the saved state for the callback page. */
async function savePending(page: Page, provider: string, state: string, staySignedIn = false): Promise<void> {
  await page.evaluate(
    ([p, s, stay]) => window.sessionStorage.setItem('sn_social_pending', JSON.stringify({ provider: p, state: s, staySignedIn: stay })),
    [provider, state, staySignedIn] as const,
  );
}

test.describe('no provider enabled (the real API, the launch default)', () => {
  test('the real providers answer is empty', async () => {
    const { status, body } = await api('GET', '/auth/social/providers');
    expect(status).toBe(200);
    expect(body).toEqual({ providers: [] });
  });

  test('Login shows no divider, no buttons and no gap', async ({ browser }) => {
    const page = await mobilePage(browser);
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Or continue with')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
    await expect(page.getByText(/apple/i)).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, 'login-hidden.png'), fullPage: true });
    await page.context().close();
  });

  test('Register shows no divider and no buttons', async ({ browser }) => {
    const page = await mobilePage(browser);
    await page.goto('/signup');
    await fillAgeGate(page, dobForAge(30));
    await expect(page.getByRole('heading', { name: 'Register' })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('Or continue with')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Continue with/ })).toHaveCount(0);
    await page.screenshot({ path: path.join(SHOTS, 'register-hidden.png'), fullPage: true });
    await page.context().close();
  });
});

test.describe('providers enabled', () => {
  test('Login and Register show Google and Facebook, never Apple', async ({ browser }) => {
    const page = await mobilePage(browser);
    await mockSocial(page, { providers: () => ({ body: { providers: ['google', 'facebook'] } }) });
    await page.goto('/login');
    await expect(page.getByText('Or continue with')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeVisible();
    await expect(page.getByText(/apple/i)).toHaveCount(0);
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, 'login-buttons.png'), fullPage: true });

    await page.goto('/signup');
    await fillAgeGate(page, dobForAge(30));
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeVisible();
    await page.context().close();
  });

  test('only the enabled provider gets a button', async ({ browser }) => {
    const page = await mobilePage(browser);
    await mockSocial(page, { providers: () => ({ body: { providers: ['facebook'] } }) });
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Continue with Facebook' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0);
    await page.context().close();
  });

  test('Continue with Facebook asks the API to start, keeps the state, and sends the browser to the provider', async ({ browser }) => {
    const page = await mobilePage(browser);
    const seen = await mockSocial(page, {
      providers: () => ({ body: { providers: ['facebook'] } }),
      // A real provider URL would leave the app; the test's "provider" sends the browser straight back, as a
      // person who clicked Cancel would be.
      'facebook/start': () => ({
        body: { authorizationUrl: `${URLS.web}/auth/social/facebook/callback?error=access_denied&state=xyz` },
      }),
    });
    await page.goto('/login');
    await page.getByLabel('Stay signed in.').check();
    await page.getByRole('button', { name: 'Continue with Facebook' }).click();
    await expect(page.getByRole('heading', { name: 'Sign-in cancelled' })).toBeVisible();
    expect(seen.find((c) => c.path === 'facebook/start')?.body).toEqual({ staySignedIn: true });
    await page.context().close();
  });
});

test.describe('the callback page', () => {
  test('cancelled: the drawn screen, Try again starts again, Back to log in goes to /login', async ({ browser }) => {
    const page = await mobilePage(browser);
    await page.goto('/login');
    await savePending(page, 'facebook', 'st1');
    await page.goto('/auth/social/facebook/callback?error=access_denied&error_reason=user_denied&state=st1');
    await expect(page.getByRole('heading', { name: 'Sign-in cancelled' })).toBeVisible();
    await expect(page.getByText(/You closed the Facebook window before finishing, so you.re not signed in\./)).toBeVisible();
    expect(page.url()).not.toContain('state=');
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, 'cancelled.png'), fullPage: true });

    await page.getByRole('link', { name: 'Back to log in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.context().close();
  });

  test('refused or failed: the drawn screen and callout', async ({ browser }) => {
    const page = await mobilePage(browser);
    await page.goto('/login');
    await savePending(page, 'facebook', 'st1');
    await page.goto('/auth/social/facebook/callback?error=server_error&state=st1');
    await expect(page.getByRole('heading', { name: 'We couldn’t sign you in' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText(
      'Facebook didn’t confirm your sign-in. This can happen if you declined access or the service isn’t available right now.',
    );
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'failed.png'), fullPage: true });
    await page.context().close();
  });

  test('a redirect this browser did not start is refused and the API is never called (login CSRF)', async ({ browser }) => {
    const page = await mobilePage(browser);
    const seen = await mockSocial(page, { 'google/callback': () => ({ body: { status: 'signed_in' } }) });
    await page.goto('/login');
    await savePending(page, 'google', 'mine');
    await page.goto('/auth/social/google/callback?code=c&state=attackers');
    await expect(page.getByRole('heading', { name: 'We couldn’t sign you in' })).toBeVisible();
    expect(seen.filter((c) => c.path.endsWith('/callback'))).toHaveLength(0);
    await page.context().close();
  });

  test('an existing person signs in: the session is held and the page routes on nextStep', async ({ browser }) => {
    const page = await mobilePage(browser);
    await mockSocial(page, {
      'google/callback': () => ({
        body: {
          status: 'signed_in',
          accessToken: 'fake.access.token',
          accessTokenExpiresIn: 900,
          refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: { id: 'u1', nextStep: 'create_profile' },
        },
      }),
    });
    await page.goto('/login');
    await savePending(page, 'google', 'st2');
    const visited = trackNavigations(page);
    await page.goto('/auth/social/google/callback?code=c2&state=st2');
    await expect.poll(() => visited).toContain('/create-profile');
    await page.context().close();
  });
});

test.describe('a new person: Facebook shared no email', () => {
  const profile = { displayName: 'Jane Doe', email: null, emailVerified: false, needsEmail: true };

  test('Enter your email -> code -> hand-off -> Age Gate -> create account', async ({ browser }) => {
    const page = await mobilePage(browser);
    const seen = await mockSocial(page, {
      'facebook/callback': () => ({ body: { status: 'registration_required', socialRegistrationToken: 'rt1', profile } }),
      'email-code': () => ({ body: { sent: true } }),
      'email-code/verify': () => ({ body: { email: 'jane.doe@example.com', emailVerified: true } }),
      register: () => ({
        status: 201,
        body: {
          accessToken: 'fake.access.token',
          accessTokenExpiresIn: 900,
          refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: { id: 'u9', nextStep: 'create_profile' },
          guardian: null,
        },
      }),
    });
    await page.goto('/login');
    await savePending(page, 'facebook', 'st3');
    const visited = trackNavigations(page);
    await page.goto('/auth/social/facebook/callback?code=c3&state=st3');

    // Enter your email (6966:46142)
    await expect(page.getByRole('heading', { name: 'Enter your email' })).toBeVisible();
    await expect(page.getByText(/Facebook didn.t share an email address with us\./)).toBeVisible();
    expect(await noSideScroll(page)).toBe(true);
    await page.screenshot({ path: path.join(SHOTS, 'enter-email.png'), fullPage: true });

    // Invalid email (6966:46212): the drawn message, nothing sent.
    await page.getByLabel('Email').fill('jane.doe@');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('alert')).toHaveText('Enter a valid email address, for example name@example.com.');
    await page.screenshot({ path: path.join(SHOTS, 'enter-email-invalid.png'), fullPage: true });
    expect(seen.filter((c) => c.path === 'email-code')).toHaveLength(0);

    // A valid address sends a code (the API sends a CODE, so the next screen asks for it).
    await page.getByLabel('Email').fill('jane.doe@example.com');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    expect(seen.find((c) => c.path === 'email-code')?.body).toEqual({
      socialRegistrationToken: 'rt1',
      email: 'jane.doe@example.com',
    });
    await page.getByLabel('Code').fill('123456');
    await page.getByRole('button', { name: 'Continue' }).click();

    // Hand-off (6966:46438): nothing has registered yet.
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    await expect(page.getByText('Before we create your account, we need to check your age.')).toBeVisible();
    await expect(page.getByText(/We don.t use a date of birth from Google or Facebook\./)).toBeVisible();
    await page.screenshot({ path: path.join(SHOTS, 'hand-off.png'), fullPage: true });
    expect(seen.filter((c) => c.path === 'register')).toHaveLength(0);
    await page.getByRole('button', { name: 'Continue' }).click();

    // The existing Age Gate, then the account-creation step.
    await expect(page.getByRole('heading', { name: 'Date of birth and country' })).toBeVisible();
    const dob = dobForAge(30);
    await fillAgeGate(page, dob);
    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await expect(page.getByLabel('First name')).toHaveValue('Jane');
    await expect(page.getByLabel('Last name')).toHaveValue('Doe');
    await expect(page.getByLabel('Email')).toHaveValue('jane.doe@example.com');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect.poll(() => visited).toContain('/create-profile');

    const registered = seen.find((c) => c.path === 'register')!.body;
    expect(registered).toMatchObject({
      socialRegistrationToken: 'rt1',
      displayName: 'Jane Doe',
      dateOfBirth: dob.iso,
      countryCode: 'GB',
    });
    expect(registered).not.toHaveProperty('email');
    expect(registered).not.toHaveProperty('password');
    expect(registered).not.toHaveProperty('guardian');
    await page.context().close();
  });
});

test.describe('a new person who is a minor', () => {
  test('the guardian step cannot be skipped and its details are sent', async ({ browser }) => {
    const page = await mobilePage(browser);
    const seen = await mockSocial(page, {
      'google/callback': () => ({
        body: {
          status: 'registration_required',
          socialRegistrationToken: 'rt2',
          profile: { displayName: 'Sam Kid', email: 'sam@example.com', emailVerified: true, needsEmail: false },
        },
      }),
      register: () => ({
        status: 201,
        body: {
          accessToken: 'fake.access.token',
          accessTokenExpiresIn: 900,
          refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          user: { id: 'u10', nextStep: 'restricted_pending' },
          guardian: { id: 'g1', name: 'Pat Kid', email: 'pat@example.com', relationship: 'Parent', consentStatus: 'pending' },
        },
      }),
    });
    await page.goto('/login');
    await savePending(page, 'google', 'st4');
    const visited = trackNavigations(page);
    await page.goto('/auth/social/google/callback?code=c4&state=st4');

    // The provider gave an email: straight to the hand-off.
    await expect(page.getByRole('heading', { name: 'One more step' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
    const dob = dobForAge(14);
    await fillAgeGate(page, dob);

    await expect(page.getByRole('heading', { name: /Ask a parent or guardian/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Create your account' })).toHaveCount(0);
    await page.getByLabel(/Guardian.s full name/).fill('Pat Kid');
    await page.getByLabel(/Guardian.s email address/).fill('pat@example.com');
    await page.getByLabel(/Their relationship to you/).selectOption('Parent');
    await page.getByRole('button', { name: 'Send approval request' }).click();

    await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect.poll(() => visited).toContain('/guardian-consent');
    expect(seen.find((c) => c.path === 'register')?.body).toMatchObject({
      socialRegistrationToken: 'rt2',
      dateOfBirth: dob.iso,
      guardian: { name: 'Pat Kid', email: 'pat@example.com', relationship: 'Parent' },
    });
    await page.context().close();
  });
});
