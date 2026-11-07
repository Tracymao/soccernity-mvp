import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, loginViaUi, registerViaApi, userLogin, verifyEmailViaApi, type Account } from '../support/helpers';
import { USER_PASSWORD } from '../support/stack';

// B-059 (Decision Log #472): the standalone Change password page, in real Chrome against the real API, Postgres and
// Redis. Scoped to this work; no other Playwright spec is run by it.
//
// The page is reached from the Change password row on Settings > Account. A wrong current password is a real 401
// from POST /auth/change-password; a good change really ends the OTHER sessions (checked through a second login
// whose refresh token must die) while this device stays signed in.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b059-pw-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

const NEW_PASSWORD = 'Brand-new-pass-2026';

async function signIn(page: Page, email: string): Promise<void> {
  await loginViaUi(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

/** Opens the page the way a person would: Settings > Account > the Change password row. */
async function openFromAccount(page: Page): Promise<void> {
  await page.goto('/settings/account');
  await page.getByRole('link', { name: /change password/i }).click();
  await expect(page).toHaveURL(/\/settings\/account\/change-password$/);
  await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();
}

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true });

async function fill(page: Page, current: string, next: string, confirm: string): Promise<void> {
  await field(page, 'Current password').fill(current);
  await field(page, 'New password').fill(next);
  await field(page, 'Confirm password').fill(confirm);
}

test.describe.serial('Change password page', () => {
  let acct: Account;

  test.beforeAll(async () => {
    acct = await registerViaApi({ age: 30, label: 'cpw' });
    await verifyEmailViaApi(acct);
  });

  test('the Account row opens the page and the form matches the frame', async ({ page }) => {
    await signIn(page, acct.email);
    await openFromAccount(page);
    await expect(page.getByText('Update the password you use to log in to Soccernity.')).toBeVisible();
    await expect(page.getByText('Use at least 8 characters.')).toBeVisible();
    await expect(
      page.getByText('Changing your password will log you out of your other active Soccernity sessions.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();
    await shot(page, '01-form-desktop');
  });

  test('new password problems: both messages at once and nothing is sent', async ({ page }) => {
    await signIn(page, acct.email);
    await openFromAccount(page);
    let posted = 0;
    page.on('request', (r) => {
      if (r.url().includes('/auth/change-password')) posted++;
    });
    await fill(page, USER_PASSWORD, '1234567', '12345678');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Use at least 8 characters.' })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'The passwords don’t match.' })).toBeVisible();
    await expect(field(page, 'New password')).toBeFocused();
    await shot(page, '02-new-password-problems-desktop');
    expect(posted).toBe(0);
  });

  test('wrong current password: the real server refuses it and nothing changes', async ({ page }) => {
    await signIn(page, acct.email);
    await openFromAccount(page);
    await fill(page, 'not-my-password', NEW_PASSWORD, NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('That password isn’t right. Check it and try again.')).toBeVisible();
    await expect(field(page, 'Current password')).toBeFocused();
    // What was typed is kept, and we are still on the form, still signed in.
    await expect(field(page, 'New password')).toHaveValue(NEW_PASSWORD);
    await expect(page.getByText('Password changed')).toHaveCount(0);
    await shot(page, '03-wrong-current-password-desktop');
    // The real server still has the OLD password.
    expect((await userLogin(acct.email, USER_PASSWORD)).status).toBeLessThan(300);
  });

  test('a good change: other sessions end, this device stays signed in, the new password works', async ({ page }) => {
    // A second, separate session (a refresh token the change must kill).
    const other = await userLogin(acct.email, USER_PASSWORD);
    expect(other.status).toBeLessThan(300);
    const otherRefresh = other.body.refreshToken as string;
    expect(otherRefresh).toBeTruthy();

    await signIn(page, acct.email);
    await openFromAccount(page);
    await fill(page, USER_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();
    await expect(page.getByText('Your password has been updated.')).toBeVisible();
    await expect(
      page.getByText('Your other active sessions have been logged out. You stay logged in on this device.'),
    ).toBeVisible();
    await shot(page, '04-password-changed-desktop');

    // The statement on screen is true: the other session is dead ...
    expect((await api('POST', '/auth/refresh', { body: { refreshToken: otherRefresh } })).status).toBe(401);
    // ... the old password no longer signs in, the new one does ...
    expect((await userLogin(acct.email, USER_PASSWORD)).status).toBe(401);
    expect((await userLogin(acct.email, NEW_PASSWORD)).status).toBeLessThan(300);
    // ... and this device is still signed in: Back to Account shows the account page, not a login prompt.
    await page.getByRole('link', { name: 'Back to Account' }).click();
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(page.getByText(/log in to manage your account/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /change password/i })).toBeVisible();
  });

  test('390px: no sideways scroll, Save fills the width, Settings back bar replaces the arrow', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const page = await context.newPage();
    // The previous test changed the password.
    await loginViaUi(page, acct.email, NEW_PASSWORD);
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto('/settings/account/change-password');
    await expect(page.getByRole('heading', { name: 'Change Password' })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const save = await page.getByRole('button', { name: 'Save' }).boundingBox();
    const input = await field(page, 'Current password').boundingBox();
    expect(Math.abs(save!.width - input!.width)).toBeLessThanOrEqual(2);
    await expect(page.getByRole('link', { name: 'Back to Account' })).toBeHidden();
    await shot(page, '05-form-mobile');
    await context.close();
  });
});
