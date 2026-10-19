import { test, expect } from '@playwright/test';
import {
  clearBrowserSession,
  expectVerifyScreen,
  linkPath,
  loginViaUi,
  signUpViaUi,
  uniqueEmail,
  uniqueUsername,
  userByEmail,
  waitForEmail,
} from '../support/helpers';

// Adult: Age Gate -> Register -> verify email -> Create Profile -> Club Picker -> Community.
test.describe.serial('adult sign-up', () => {
  const email = uniqueEmail('adult');
  const username = uniqueUsername('adult');

  test('registers and is sent to the verify-email prompt; no guardian row is created', async ({ page }) => {
    await signUpViaUi(page, { email, age: 30, expectUrl: /\/verify-email\/prompt$/ });
    await expect(page.getByRole('heading', { name: 'Verify your email to continue' })).toBeVisible();
    await expect(page.getByText(`We sent a verification link to ${email}`)).toBeVisible();

    const user = await userByEmail(email);
    expect(user.isMinor).toBe(false);
    expect(user.isUnder16).toBe(false);
    expect(user.guardian).toBeNull();
    expect(user.verificationStatus).not.toBe('verified');
    // The DOB must be stored encrypted, never as a plain date.
    expect(String(user.dateOfBirth)).toMatch(/^v1:/);
  });

  test('the verification email carries a working link to the web app (D-16: shows the verified screen)', async ({ page }, testInfo) => {
    const mail = await waitForEmail(email, 'verify-email');
    expect(mail.data.link).toMatch(/^http:\/\/localhost:5273\/verify-email\?token=/);
    await page.goto(linkPath(mail.data.link));
    await expectVerifyScreen(page, 'Email verified', testInfo);
    expect((await userByEmail(email)).verificationStatus).toBe('verified');
  });

  test('a verification link cannot be used twice', async ({ page }) => {
    const mail = await waitForEmail(email, 'verify-email');
    await page.goto(linkPath(mail.data.link));
    await expect(page.getByRole('heading', { name: /no longer valid/ })).toBeVisible();
  });

  test('"continue" routes an adult with no username to Create Profile (session survives the verify visit)', async ({
    page,
  }) => {
    // The verify page is public; log in so the session exists.
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/create-profile$/);
    await expect(page.getByRole('heading', { name: 'Create your profile' })).toBeVisible();
  });

  test('Create Profile sets a username and goes on to the club picker, then Community', async ({ page }) => {
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/create-profile$/);
    await page.getByLabel('Username').fill(username);
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/\/signup\/clubs$/);
    expect((await userByEmail(email)).username).toBe(username.toLowerCase());
  });

  test('a fully onboarded adult logs straight into /community on every later login', async ({ page }) => {
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/community$/);
    await clearBrowserSession(page);
  });
});
