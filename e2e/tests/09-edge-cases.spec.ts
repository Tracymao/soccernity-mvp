import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  GUARDIAN,
  api,
  db,
  dobForAge,
  emailsFor,
  expireEmailVerifyToken,
  guardianConfirmViaApi,
  linkPath,
  loginViaUi,
  me,
  registerViaApi,
  signUpViaUi,
  uniqueEmail,
  uniqueUsername,
  userByEmail,
  verifyEmailViaApi,
  waitForEmail,
} from '../support/helpers';

async function guardianPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

test.describe('email verification edge cases', () => {
  test('/verify-email with no token says so and offers a way out', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page.getByRole('heading', { name: /missing its verification token/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Contact support/ })).toHaveAttribute('href', /^mailto:support@soccernity\.com/);
  });

  test('/verify-email with a made-up token shows the generic invalid-link state', async ({ page }) => {
    await page.goto('/verify-email?token=00000000-0000-4000-8000-000000000000');
    await expect(page.getByRole('heading', { name: /no longer valid/ })).toBeVisible();
  });

  test('an expired verification link is refused', async ({ page }) => {
    const a = await registerViaApi({ age: 30, label: 'vexp' });
    const mail = await waitForEmail(a.email, 'verify-email');
    await expireEmailVerifyToken(new URL(mail.data.link).searchParams.get('token')!);
    await page.goto(linkPath(mail.data.link));
    await expect(page.getByRole('heading', { name: /no longer valid/ })).toBeVisible();
    expect((await userByEmail(a.email)).verificationStatus).not.toBe('verified');
  });

  test('POST /auth/resend-verification-email answers identically for known, unknown and verified addresses and sends a working link', async () => {
    const unverified = await registerViaApi({ age: 30, label: 'rsv1' });
    const verified = await registerViaApi({ age: 30, label: 'rsv2' });
    await verifyEmailViaApi(verified);
    const known = await api('POST', '/auth/resend-verification-email', { body: { email: unverified.email } });
    const unknown = await api('POST', '/auth/resend-verification-email', { body: { email: uniqueEmail('nobody') } });
    const already = await api('POST', '/auth/resend-verification-email', { body: { email: verified.email } });
    expect(known.status).toBe(unknown.status);
    expect(known.status).toBe(already.status);
    expect(JSON.stringify(known.body)).toBe(JSON.stringify(unknown.body));
    expect(JSON.stringify(known.body)).toBe(JSON.stringify(already.body));
    await waitForEmail(unverified.email, 'verify-email', 2);
    expect(emailsFor(verified.email, 'verify-email')).toHaveLength(1);
  });

  test('D-08: the verify-email prompt page has a "resend the email" action (the endpoint exists)', async ({ page }) => {
    test.fail(true, 'D-08: VerifyEmailPromptPage only says "contact support"; POST /auth/resend-verification-email has no UI');
    const a = await registerViaApi({ age: 30, label: 'rsv3' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    await expect(page.getByRole('button', { name: /resend/i })).toBeVisible({ timeout: 3000 });
  });
});

test.describe('guardian link edge cases', () => {
  test('no token: clear message, no form', async ({ page }) => {
    await page.goto('/guardian-consent/confirm');
    await expect(page.getByText(/missing its approval token/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'I consent' })).toHaveCount(0);
  });

  test('made-up token: the page loads, consent attempt gives the generic invalid-link message', async ({ page }) => {
    await page.goto('/guardian-consent/confirm?token=00000000-0000-4000-8000-000000000000');
    await page.getByLabel(/I confirm I am this account holder/).check();
    await page.getByRole('button', { name: 'I consent' }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i);
  });

  test('an expired consent link is refused on both approve and decline; the minor can then resend', async ({ browser }) => {
    const a = await registerViaApi({ age: 15, label: 'gexp' });
    const mail = await waitForEmail(a.guardianEmail!, 'guardian-consent');
    await db().guardian.updateMany({
      where: { email: a.guardianEmail!.toLowerCase() },
      data: { consentTokenExpiresAt: new Date(Date.now() - 60_000) },
    });
    const page = await guardianPage(browser);
    await page.goto(linkPath(mail.data.link));
    await page.getByLabel(/I confirm I am this account holder/).check();
    await page.getByRole('button', { name: 'I consent' }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i);
    await page.getByRole('button', { name: 'I do not consent' }).click();
    await expect(page.getByRole('alert')).toContainText(/invalid or has expired/i);
    await page.context().close();
    expect((await userByEmail(a.email)).guardian.consentStatus).toBe('pending');
    expect((await userByEmail(a.email)).guardian.declineCount).toBe(0);

    const resend = await api('POST', '/auth/guardian-consent/resend', { body: { email: a.email } });
    expect(resend.status).toBe(200);
    const fresh = await waitForEmail(a.guardianEmail!, 'guardian-consent', 2);
    const g2 = await guardianPage(browser);
    await g2.goto(linkPath(fresh.data.link));
    await g2.getByLabel(/I confirm I am this account holder/).check();
    await g2.getByRole('button', { name: 'I consent' }).click();
    await expect(g2.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    await g2.context().close();
  });

  test('D-09: after approval the guardian is not told the account is "now active" when it still needs email verification and a profile', async ({
    browser,
  }) => {
    test.fail(true, 'D-09: "The account is now active" is shown although the minor still has to verify email and create a profile');
    const a = await registerViaApi({ age: 15, label: 'gcopy' });
    const mail = await waitForEmail(a.guardianEmail!, 'guardian-consent');
    const page = await guardianPage(browser);
    await page.goto(linkPath(mail.data.link));
    await page.getByLabel(/I confirm I am this account holder/).check();
    await page.getByRole('button', { name: 'I consent' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    await expect(page.getByText(/account is now active/)).toHaveCount(0);
    await page.context().close();
  });

  test('D-10: the guardian page tells the guardian "Declining closes the account and schedules it for deletion" although declines 1 and 2 do neither', async ({
    browser,
  }) => {
    test.fail(true, 'D-10: Decision Log #406 item 13 (B-130) - footnote and post-decline text are wrong for declines 1-2');
    const a = await registerViaApi({ age: 15, label: 'gfoot' });
    const mail = await waitForEmail(a.guardianEmail!, 'guardian-consent');
    const page = await guardianPage(browser);
    await page.goto(linkPath(mail.data.link));
    await expect(page.getByText(/Declining closes the account and schedules it for deletion/)).toHaveCount(0);
    await page.getByRole('button', { name: 'I do not consent' }).click();
    await expect(page.getByText(/will be scheduled for deletion/)).toHaveCount(0);
    await page.context().close();
  });
});

test.describe('registration via the UI', () => {
  test('registering with an email that already exists shows an error and keeps the form', async ({ page }) => {
    const first = await registerViaApi({ age: 30, label: 'dupui' });
    await signUpViaUi(page, { email: first.email, age: 30 });
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/signup$/);
    // The message must not read like a server crash.
    await expect(page.getByRole('alert')).not.toContainText(/Couldn.t reach|went wrong|500/);
  });

  test('Terms and Privacy links on Register open the legal pages (new tab) with the draft banner', async ({ page, context }) => {
    await page.goto('/signup');
    await page.getByLabel('Day of birth').fill('04');
    await page.getByLabel('Month of birth').fill('09');
    await page.getByLabel('Year of birth').fill('1990');
    await page.getByLabel('Country you live in').selectOption('GB');
    await page.getByRole('button', { name: 'Continue' }).click();
    const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Terms' }).click()]);
    await popup.waitForLoadState();
    await expect(popup).toHaveURL(/\/terms$/);
    await expect(popup.getByRole('heading').first()).toBeVisible();
    await expect(popup.getByText(/NOT APPROVED|not approved/i).first()).toBeVisible();
  });
});

test.describe('Club Picker after Create Profile', () => {
  test('lists clubs, joins one, continues to /community; a second account can skip', async ({ page }) => {
    const clubName = `QA Rovers ${Date.now().toString(36)}`;
    await db().clubPage.create({ data: { name: clubName, league: 'QA League', country: 'GB' } });
    const a = await registerViaApi({ age: 30, label: 'club' });
    await verifyEmailViaApi(a);
    const { token } = await me(a);
    expect((await api('PATCH', `/users/${a.userId}`, { token, body: { username: uniqueUsername('clb') } })).status).toBe(200);
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/community$/);
    await page.goto('/signup/clubs');
    await expect(page.getByRole('heading', { name: 'Join a club' })).toBeVisible();
    await expect(page.getByText(clubName)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skip for now' })).toBeVisible();
    await page.getByText(clubName).locator('xpath=ancestor::*[.//button][1]').getByRole('button').first().click();
    await expect(page.getByRole('button', { name: 'Continue to Soccernity' })).toBeVisible();
    await page.getByRole('button', { name: 'Continue to Soccernity' }).click();
    await expect(page).toHaveURL(/\/community$/);
    const club = await db().clubPage.findFirst({ where: { name: clubName }, include: { members: true } });
    expect(club.members.map((m: any) => m.id)).toContain(a.userId);
  });
});

// Decision Log #363 / #371: a minor's public profile card and the guardian contact.
test.describe('public profile of a minor', () => {
  test('approved minor: another member sees publicName + guardian contact, never email/DOB; pending minor is invisible (404)', async () => {
    const minor = await registerViaApi({ age: 15, label: 'pubm', displayName: 'Riley Winger' });
    const viewer = await registerViaApi({ age: 30, label: 'pubv' });
    await verifyEmailViaApi(viewer);
    const vt = (await me(viewer)).token;

    const pending = await api('GET', `/users/${minor.userId}/public-profile`, { token: vt });
    expect(pending.status).toBe(404);

    await guardianConfirmViaApi(minor);
    const approved = await api('GET', `/users/${minor.userId}/public-profile`, { token: vt });
    expect(approved.status).toBe(200);
    expect(approved.body.guardianContact.email).toBe(minor.guardianEmail!.toLowerCase());
    const text = JSON.stringify(approved.body);
    expect(text).not.toContain(minor.email);
    expect(text).not.toContain(dobForAge(15).year);
    expect(text).not.toContain('Riley'); // real name hidden until a username exists
  });
});

// Horizontal overflow at the canonical 390px mobile width (Decision Log #86).
test.describe('390px mobile: no horizontal scroll on onboarding pages', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  // [label, url, known defect]
  const pages: Array<[string, string, string | null]> = [
    ['signup (age gate)', '/signup', 'D-11: the sign-up split screen keeps a 488px left panel (98px of sideways scroll at 390px)'],
    ['login', '/login', null],
    ['forgot password', '/forgot-password', null],
    ['verify email (missing token)', '/verify-email', 'D-12: the desktop icon header does not collapse at 390px (188px of sideways scroll)'],
    ['guardian consent confirm (no token)', '/guardian-consent/confirm', 'D-12: the desktop icon header does not collapse at 390px (188px of sideways scroll)'],
  ];
  for (const [label, url, defect] of pages) {
    test(`${defect ? defect.slice(0, 4) + ': ' : ''}${label}`, async ({ page }) => {
      if (defect) test.fail(true, defect);
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} scrolls ${overflow}px sideways`).toBeLessThanOrEqual(1);
    });
  }

  test('D-12: signed-in onboarding pages (verify prompt, create profile, guardian status) fit 390px', async ({ page }) => {
    test.fail(true, 'D-12: verify prompt / guardian status sit under the desktop icon header (167px of sideways scroll)');
    const a = await registerViaApi({ age: 30, label: 'mob' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    const measure = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(await measure()).toBeLessThanOrEqual(1);
    await verifyEmailViaApi(a);
    await page.goto('/create-profile');
    await page.waitForLoadState('networkidle');
    expect(await measure()).toBeLessThanOrEqual(1);

    const m = await registerViaApi({ age: 15, label: 'mobm' });
    await page.evaluate(() => window.sessionStorage.clear());
    await loginViaUi(page, m.email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await page.waitForLoadState('networkidle');
    expect(await measure(), '/guardian-consent').toBeLessThanOrEqual(1);
  });
});

// Under 13: the guardian cannot approve without the card step. This environment
// has no GeoLite2 database and no Stripe, so to exercise the REST of the path the
// card requirement is switched off in the database - a labelled workaround, not
// product behaviour.
test.describe.serial('under 13 end to end (card requirement lifted by SQL workaround)', () => {
  const email = uniqueEmail('u13b');
  const guardian = GUARDIAN('gu13b');
  let link = '';

  test('register at age 9: card step required, panel offers "Verify with a card", Stripe-less server fails closed with a visible message', async ({
    page,
    browser,
  }) => {
    await signUpViaUi(page, { email, age: 9, guardian, expectUrl: /\/guardian-consent$/ });
    const consent = await waitForEmail(guardian.email, 'guardian-consent');
    link = consent.data.link;
    const gp = await guardianPage(browser);
    await gp.goto(linkPath(link));
    await gp.getByRole('button', { name: 'Verify with a card' }).click();
    await expect(gp.getByRole('alert')).toBeVisible();
    await gp.screenshot({ path: '.run/shots/under13-card-step-error.png', fullPage: true });
    await gp.context().close();
  });

  test('WORKAROUND: lift the card requirement; guardian approves; the minor is approved and the evidence says email-link only', async ({
    browser,
  }) => {
    await db().guardian.updateMany({ where: { email: guardian.email.toLowerCase() }, data: { cardVerificationRequired: false } });
    const gp = await guardianPage(browser);
    await gp.goto(linkPath(link));
    await expect(gp.getByTestId('card-verification-panel')).toHaveCount(0);
    await gp.getByLabel(/I confirm I am this account holder/).check();
    await gp.getByRole('button', { name: 'I consent' }).click();
    await expect(gp.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    await gp.context().close();
    const g = (await userByEmail(email)).guardian;
    expect(g.consentStatus).toBe('confirmed');
    expect(g.consentVerificationMethod).toBe('email_link');
  });

  test('the approved 9-year-old continues to verify email and Create Profile like any other minor', async ({ page }) => {
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    const user = await userByEmail(email);
    expect(user.isUnder16).toBe(true);
  });
});

// The restricted-pending screen promises "Browse and follow ... Follow teams,
// players and grassroots leagues". Decision Log #370 blocks every social write
// for that account, follow included.
test.describe('restricted-pending copy vs behaviour', () => {
  test('D-13: a restricted-pending minor can follow (the screen says "Browse and follow")', async () => {
    test.fail(true, 'D-13: the pending screen says "Browse and follow"; POST /users/:id/follow is 403 for a pending minor');
    const minor = await registerViaApi({ age: 15, label: 'pf' });
    const target = await registerViaApi({ age: 30, label: 'pft' });
    await verifyEmailViaApi(minor);
    const { token } = await me(minor);
    const res = await api('POST', `/users/${target.userId}/follow`, { token });
    expect([200, 201]).toContain(res.status);
  });
});
