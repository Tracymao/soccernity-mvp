import * as path from 'path';
import { createRequire } from 'module';
import { test, expect } from '@playwright/test';
import { api, db, refreshCookie, userLogin, verifiedAccount } from '../support/helpers';
import { ADMIN_CREDENTIALS, REPO, URLS, USER_PASSWORD } from '../support/stack';

// B-310 (Decision Log #500 follow-up): changing the password revokes EVERY session of the account (B-305), and
// before this fix that included the device that made the change -- although the page promises "You stay logged in on
// this device." Now the API answers the change with a FRESH session for the caller, issued after the revoke, and the
// web and admin apps store it. Covered here, in real Chrome against the real API, Postgres and Redis, and ONLY this:
//   web   : still signed in after the change and after a reload (the NEW refresh cookie restores the session);
//           "Stay signed in" survives (the new cookie is still persistent); the OLD refresh cookie is dead;
//           a SECOND browser context for the same account is signed out; the new password signs in, the old does not.
//   admin : the same with the real admin cookie session (one real admin sign-in, spent on a throw-away admin).
// Not covered here: the ADMIN_2FA_ENFORCED 204 branch (a unit test and services/api's session-revocation e2e cover it:
// turning the switch on needs an API restart with a different environment).
const requireFromApi = createRequire(path.join(REPO, 'services', 'api', 'package.json'));

const NEW_PASSWORD = 'Brand-new-pass-2026';

test.describe.serial('web: the change keeps THIS device signed in and signs every other session out', () => {
  test('change password -> still signed in after a reload, new persistent cookie, old cookie dead, other browser signed out', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const acct = await verifiedAccount('b310w');

    // Device A: signs in with "Stay signed in" (a persistent refresh cookie).
    const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageA = await ctxA.newPage();
    await pageA.goto('/login');
    await pageA.getByLabel('Email').fill(acct.email);
    await pageA.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await pageA.getByLabel(/stay signed in/i).check();
    await pageA.getByRole('button', { name: /^Log ?in$/i }).click();
    await expect(pageA).not.toHaveURL(/\/login/);
    const before = await refreshCookie(pageA);
    expect(before, 'sn_rt set at sign-in').toBeTruthy();
    expect(before!.expires, 'a persistent cookie (Stay signed in)').toBeGreaterThan(0);

    // Device B: a second browser context for the same account, also signed in.
    const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pageB = await ctxB.newPage();
    await pageB.goto('/login');
    await pageB.getByLabel('Email').fill(acct.email);
    await pageB.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await pageB.getByRole('button', { name: /^Log ?in$/i }).click();
    await expect(pageB).not.toHaveURL(/\/login/);
    await pageB.goto('/settings/account');
    await expect(pageB.getByRole('link', { name: /change password/i })).toBeVisible();

    // The revocation marker is in whole seconds: let the second the tokens were issued in pass.
    await pageA.waitForTimeout(1_300);

    // Change the password on device A.
    await pageA.goto('/settings/account');
    await pageA.getByRole('link', { name: /change password/i }).click();
    await pageA.getByLabel('Current password', { exact: true }).fill(USER_PASSWORD);
    await pageA.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await pageA.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
    await pageA.getByRole('button', { name: 'Save' }).click();
    await expect(pageA.getByRole('heading', { name: 'Password changed' })).toBeVisible();
    await expect(
      pageA.getByText('Your other active sessions have been logged out. You stay logged in on this device.'),
    ).toBeVisible();

    // THIS device stays signed in: Back to Account is the account page, not a login prompt ...
    await pageA.getByRole('link', { name: 'Back to Account' }).click();
    await expect(pageA).toHaveURL(/\/settings\/account$/);
    await expect(pageA.getByText(/log in to manage your account/i)).toHaveCount(0);
    await expect(pageA.getByRole('link', { name: /change password/i })).toBeVisible();

    // ... and so does a reload, which can only work with the NEW refresh cookie (the old token was revoked).
    await pageA.reload();
    await expect(pageA.getByRole('link', { name: /change password/i })).toBeVisible();
    await expect(pageA.getByText(/log in to manage your account/i)).toHaveCount(0);

    const after = await refreshCookie(pageA);
    expect(after, 'sn_rt set by the change').toBeTruthy();
    expect(after!.value, 'the cookie was replaced').not.toBe(before!.value);
    expect(after!.expires, '"Stay signed in" survived: still a persistent cookie').toBeGreaterThan(0);
    expect(after!.httpOnly).toBe(true);

    // The OLD refresh cookie is dead.
    const old = await api('POST', '/auth/refresh', {
      headers: { 'X-Auth-Mode': 'cookie', Origin: URLS.web, Cookie: `sn_rt=${before!.value}` },
    });
    expect(old.status).toBe(401);

    // Device B is signed out: its reload cannot restore a session (its cookie was revoked).
    await pageB.goto('/settings/account');
    await expect(pageB.getByText(/log in to manage your account/i)).toBeVisible();

    // The old password no longer signs in, the new one does.
    expect((await userLogin(acct.email, USER_PASSWORD)).status).toBe(401);
    expect((await userLogin(acct.email, NEW_PASSWORD)).status).toBeLessThan(300);

    await ctxA.close();
    await ctxB.close();
  });

  test('a session cookie ("Stay signed in" NOT ticked) stays a session cookie after the change', async ({ browser }) => {
    test.setTimeout(180_000);
    const acct = await verifiedAccount('b310p');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByLabel('Email').fill(acct.email);
    await page.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await page.getByRole('button', { name: /^Log ?in$/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    const before = await refreshCookie(page);
    expect(before!.expires, 'a session cookie').toBe(-1);

    await page.waitForTimeout(1_300);
    await page.goto('/settings/account/change-password');
    await page.getByLabel('Current password', { exact: true }).fill(USER_PASSWORD);
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();

    const after = await refreshCookie(page);
    expect(after!.value).not.toBe(before!.value);
    expect(after!.expires, 'still a session cookie').toBe(-1);
    await ctx.close();
  });

  test('a wrong current password changes nothing and keeps the session', async ({ browser }) => {
    test.setTimeout(120_000);
    const acct = await verifiedAccount('b310x');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto('/login');
    await page.getByLabel('Email').fill(acct.email);
    await page.getByLabel('Password', { exact: true }).fill(USER_PASSWORD);
    await page.getByRole('button', { name: /^Log ?in$/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    const before = await refreshCookie(page);

    await page.goto('/settings/account/change-password');
    await page.getByLabel('Current password', { exact: true }).fill('not-the-password');
    await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel('Confirm password', { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('That password isn’t right. Check it and try again.')).toBeVisible();

    // A wrong current password is a 401, which the app answers with one silent refresh and a replay: the refresh cookie
    // may rotate, so its value is NOT asserted. What matters: nothing was revoked, the session survives a reload, and the
    // old password still works.
    expect(before, 'sn_rt present').toBeTruthy();
    expect(await refreshCookie(page), 'sn_rt still present').toBeTruthy();
    await page.reload();
    await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
    expect((await userLogin(acct.email, USER_PASSWORD)).status).toBeLessThan(300);
    await ctx.close();
  });
});

test.describe.serial('admin: the change keeps THIS console session and ends every other one', () => {
  test('change password in the Admin Console -> still signed in after a reload, old cookie dead, other session dead', async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    // A throw-away admin with a real password (the shared QA admin must not have its password changed). Its one real
    // sign-in below uses one of the five admin logins per 15 minutes (Decision Log #190); the other session is minted
    // through the API with a second real login of the SAME admin only when affordable -- here it is the API's own
    // login, so this test spends two logins in total.
    const argon2 = requireFromApi('argon2');
    const email = `b310-admin-${Date.now().toString(36)}@soccernity.test`;
    const password = 'Admin-old-pass-2026';
    const created = await db().adminUser.create({
      data: {
        email,
        fullName: 'B310 Password Admin',
        passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
        role: 'editor',
        accountStatus: 'active',
      },
    });
    expect(created.id).toBeTruthy();

    // A second, API-level session of the same admin: must be dead after the change.
    const other = await api('POST', '/admin/auth/login', { body: { email, password } });
    expect(other.status).toBeLessThan(300);

    const ctx = await browser.newContext({ baseURL: URLS.admin, viewport: { width: 1440, height: 1000 } });
    const page = await ctx.newPage();
    await page.goto(`${URLS.admin}/login`);
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    const before = (await ctx.cookies()).find((c) => c.name === 'sn_admin_rt');
    expect(before, 'sn_admin_rt set at sign-in').toBeTruthy();

    await page.waitForTimeout(1_300);
    await page.goto(`${URLS.admin}/profile`);
    await page.getByRole('button', { name: 'Change Password' }).click();
    await page.getByLabel('Current password').fill(password);
    // The label also carries the hint line ("Use at least 8 characters."), so match its start.
    await page.getByLabel(/^New password/).fill('Admin-new-pass-2026');
    await page.getByLabel('Confirm new password').fill('Admin-new-pass-2026');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.getByRole('heading', { name: 'Password changed' })).toBeVisible();

    // THIS session is still alive: a reload restores it with the NEW cookie, no login screen.
    await page.reload();
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByText('B310 Password Admin').first()).toBeVisible();
    const after = (await ctx.cookies()).find((c) => c.name === 'sn_admin_rt');
    expect(after!.value, 'the admin cookie was replaced').not.toBe(before!.value);
    // Founder decision 2026-10-29: the admin cookie is a session cookie, and it stays one.
    expect(after!.expires).toBe(-1);

    // The OLD admin cookie and the OTHER session's refresh token are dead.
    const oldCookie = await api('POST', '/admin/auth/refresh', {
      headers: { 'X-Auth-Mode': 'cookie', Origin: URLS.admin, Cookie: `sn_admin_rt=${before!.value}` },
    });
    expect(oldCookie.status).toBe(401);
    const otherRefresh = await api('POST', '/admin/auth/refresh', { body: { refreshToken: other.body.refreshToken } });
    expect(otherRefresh.status).toBe(401);
    await ctx.close();

    // Keep the shared QA admin untouched: this test never used ADMIN_CREDENTIALS.
    expect(email).not.toBe(ADMIN_CREDENTIALS.email);
  });
});
