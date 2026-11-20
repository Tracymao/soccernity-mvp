import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  GUARDIAN,
  api,
  clearBrowserSession,
  dobForAge,
  linkPath,
  loginViaUi,
  signUpViaUi,
  uniqueEmail,
  userByEmail,
  userLogin,
  waitForEmail,
  emailsFor,
  expectVerifyScreen,
} from '../support/helpers';

async function guardianPage(browser: Browser): Promise<Page> {
  // A different person on a different device: a brand-new browser context.
  const ctx = await browser.newContext();
  return ctx.newPage();
}

// 13-15 and 16-17 behave the same on the consent path; under-16 additionally
// carries the under-16 restrictions flag (Decision Log #346).
for (const band of [
  { label: '13-15 (age 14)', age: 14, under16: true },
  { label: '16-17 (age 17)', age: 17, under16: false },
]) {
  test.describe.serial(`minor sign-up ${band.label}`, () => {
    const email = uniqueEmail(`minor${band.age}`);
    const guardian = GUARDIAN(`g${band.age}`);
    let consentLink = '';

    test('Age Gate -> Guardian details -> Register lands on the restricted-pending view', async ({ page }) => {
      await signUpViaUi(page, { email, age: band.age, guardian, expectUrl: /\/guardian-consent$/ });
      await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your account is waiting for approval' })).toBeVisible();
      await expect(page.getByText(`We emailed ${guardian.email}`)).toBeVisible();
    });

    test('database: minor flags, guardian row, no card step below 13', async () => {
      const user = await userByEmail(email);
      expect(user.isMinor).toBe(true);
      expect(user.isUnder16).toBe(band.under16);
      expect(user.guardian.consentStatus).toBe('pending');
      expect(user.guardian.email).toBe(guardian.email.toLowerCase());
      expect(user.guardian.name).toBe(guardian.name);
      expect(user.guardian.relationship).toBe(guardian.relationship);
      expect(user.guardian.cardVerificationRequired).toBe(false);
      expect(user.guardian.declineCount).toBe(0);
      expect(String(user.dateOfBirth)).toMatch(/^v1:/);
    });

    test('a verify-email mail goes to the minor and a consent mail to the guardian, both with web links', async () => {
      const verify = await waitForEmail(email, 'verify-email');
      expect(verify.data.link).toMatch(/\/verify-email\?token=/);
      const consent = await waitForEmail(guardian.email, 'guardian-consent');
      expect(consent.data.link).toMatch(/\/guardian-consent\/confirm\?token=/);
      consentLink = consent.data.link;
      // Nothing about the guardian request may be sent to the minor's own inbox.
      expect(emailsFor(email, 'guardian-consent')).toHaveLength(0);
    });

    test('verifying email while consent is pending shows the "approval still pending" state (D-16: verified screen, every time)', async ({ page }, testInfo) => {
      const verify = await waitForEmail(email, 'verify-email');
      await page.goto(linkPath(verify.data.link));
      await expectVerifyScreen(page, /Email verified.*approval still pending/, testInfo);
      expect((await userByEmail(email)).verificationStatus).toBe('verified');
    });

    test('logging in while pending always routes to the restricted-pending view', async ({ page }) => {
      await loginViaUi(page, email);
      await expect(page).toHaveURL(/\/guardian-consent$/);
      await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
    });

    test('the pending minor cannot write: posting is refused by the server (403 guardian_consent_pending)', async () => {
      const login = await userLogin(email);
      expect(login.body.user.nextStep).toBe('restricted_pending');
      expect(login.body.user.guardianConsentStatus).toBe('pending');
      const res = await api('POST', '/posts', { token: login.body.accessToken, body: { contentText: 'hello' } });
      expect(res.status).toBe(403);
    });

    test('guardian opens the emailed link: request summary is shown, no account needed', async ({ browser }) => {
      const page = await guardianPage(browser);
      await page.goto(linkPath(consentLink));
      await expect(page.getByTestId('guardian-consent-confirm-page')).toBeVisible();
      const summary = page.getByTestId('request-summary');
      await expect(summary).toBeVisible();
      await expect(summary).toContainText('Casey Tester');
      await expect(summary).toContainText('Parent');
      const dob = dobForAge(band.age);
      // The DOB is shown as "1 January 2010 (age N)"
      await expect(summary).toContainText(`(age ${band.age})`);
      expect(dob.year).toBeTruthy();
      // I consent is disabled until the tickbox is ticked.
      await expect(page.getByRole('button', { name: 'I consent' })).toBeDisabled();
      await page.context().close();
    });

    test('guardian ticks the box, consents, the minor is approved and emailed', async ({ browser }) => {
      const page = await guardianPage(browser);
      await page.goto(linkPath(consentLink));
      await page.getByLabel(/I confirm I am this account holder/).check();
      await page.getByRole('button', { name: 'I consent' }).click();
      await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
      await page.context().close();

      const user = await userByEmail(email);
      expect(user.guardian.consentStatus).toBe('confirmed');
      expect(user.guardian.consentTimestamp).not.toBeNull();
      expect(user.guardian.consentVerificationMethod).toBe('email_link');
      expect(user.guardian.consentScreenVersion).toBeTruthy();
      expect(user.guardian.consentDeviceType).toBe('desktop');

      const approved = await waitForEmail(email, 'guardian-approved-minor');
      expect(approved.data.link).toMatch(/\/login$/);
    });

    test('re-using the consent link is an idempotent no-op: same screen, no second approval email, evidence kept', async ({
      browser,
    }) => {
      const before = (await userByEmail(email)).guardian;
      const page = await guardianPage(browser);
      await page.goto(linkPath(consentLink));
      await page.getByLabel(/I confirm I am this account holder/).check();
      await page.getByRole('button', { name: 'I consent' }).click();
      await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
      await page.context().close();
      const after = (await userByEmail(email)).guardian;
      expect(after.consentTimestamp.getTime()).toBe(before.consentTimestamp.getTime());
      expect(emailsFor(email, 'guardian-approved-minor')).toHaveLength(1);
    });

    test('after approval the minor logs in and is sent to Create Profile (email already verified)', async ({ page }) => {
      await loginViaUi(page, email);
      await expect(page).toHaveURL(/\/create-profile$/);
      const login = await userLogin(email);
      expect(login.body.user.guardianConsentStatus).toBe('confirmed');
      expect(login.body.user.nextStep).toBe('create_profile');
      await clearBrowserSession(page);
    });

    test('the approved minor can reach the read-only /guardian-consent view (approved state)', async ({ page }) => {
      await loginViaUi(page, email);
      await expect(page).toHaveURL(/\/create-profile$/); // login finished and the session is stored
      await page.goto('/guardian-consent');
      await expect(page.getByTestId('guardian-consent-confirmed')).toBeVisible();
      await expect(page.getByRole('link', { name: 'Continue registration' })).toBeVisible();
    });
  });
}

test.describe.serial('minor who has not verified email, after approval', () => {
  const email = uniqueEmail('minor15-noverify');
  const guardian = GUARDIAN('gnv');

  test('approved-but-unverified minor is routed to verify-email, not Create Profile', async ({ page, browser }) => {
    await signUpViaUi(page, { email, age: 15, guardian, expectUrl: /\/guardian-consent$/ });
    const consent = await waitForEmail(guardian.email, 'guardian-consent');
    const gp = await guardianPage(browser);
    await gp.goto(linkPath(consent.data.link));
    await gp.getByLabel(/I confirm I am this account holder/).check();
    await gp.getByRole('button', { name: 'I consent' }).click();
    await expect(gp.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    await gp.context().close();

    await clearBrowserSession(page);
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    const login = await userLogin(email);
    expect(login.body.user.nextStep).toBe('verify_email');
  });
});
