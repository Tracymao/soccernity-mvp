import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  api,
  db,
  dobForAge,
  emailsFor,
  everythingScriptCanRead,
  getAdminToken,
  guardianConfirmViaApi,
  guardianDeclineViaApi,
  heldAccessToken,
  loginViaUi,
  me,
  registerViaApi,
  uniqueEmail,
  uniqueUsername,
  userByEmail,
  verifyEmailViaApi,
  waitForEmail,
  type Account,
} from '../support/helpers';
import { ADMIN_CREDENTIALS, URLS } from '../support/stack';
import { adminPage } from '../support/admin-ui';

async function correctDobViaUi(
  page: Page,
  userId: string,
  newIso: string,
  reason: string,
  guardian?: { name: string; email: string; relationship: string },
): Promise<void> {
  await page.goto(`${URLS.admin}/users/${userId}/dob-correction`);
  await expect(page.getByRole('heading', { name: 'Correct date of birth' })).toBeVisible();
  await page.locator('#dob-new').fill(newIso);
  await page.locator('#dob-reason').fill(reason);
  if (guardian) {
    // Adult -> minor with no guardian on file: the drawn "Guardian details" block appears as soon as
    // the new date makes a minor (frames 6752:29980 / 6752:30141), so fill it before reviewing.
    await expect(page.getByTestId('guardian-fields')).toBeVisible();
    await page.locator('#guardian-name').fill(guardian.name);
    await page.locator('#guardian-email').fill(guardian.email);
    await page.locator('#guardian-relationship').selectOption(guardian.relationship);
  }
  await page.getByRole('button', { name: 'Review correction' }).click();
}

test.describe.serial('admin console sign-in', () => {
  // B-247 (Decision Log #422): the REAL admin cookie session, end to end, with no stub. This is the only
  // place the suite signs in through the admin UI (the login is throttled to 5 per 15 minutes, #190), and
  // it is what proves the session mechanics that adminPage() (support/admin-ui.ts) deliberately skips.
  test('wrong password is refused with a generic message; the right one opens the console (cookie session, nothing in storage)', async ({
    page,
    context,
  }) => {
    await page.goto(`${URLS.admin}/login`);
    await page.getByLabel('Email').fill(ADMIN_CREDENTIALS.email);
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByLabel('Password').fill(ADMIN_CREDENTIALS.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).not.toHaveURL(/\/login$/);
    await expect(page.getByText(ADMIN_CREDENTIALS.fullName).first()).toBeVisible();

    // Nothing a script can read holds a token: no sn_admin_* key, no JWT, no cookie in document.cookie.
    const readable = await everythingScriptCanRead(page);
    expect(readable).not.toContain('sn_admin_');
    expect(readable).not.toMatch(/eyJ[\w-]{8,}\.[\w-]{8,}\./);
    expect(readable).not.toContain('sn_admin_rt');
    const idbCount = await page.evaluate(async () => (await indexedDB.databases()).length);
    expect(idbCount).toBe(0);

    // The refresh token is the API's httpOnly, SameSite=Strict cookie on the admin path only.
    const cookie = (await context.cookies()).find((c) => c.name === 'sn_admin_rt');
    expect(cookie, 'the sn_admin_rt cookie was set').toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    expect(cookie!.path).toBe('/admin/auth');
    // Founder decision 2026-10-29: the admin session ends when the browser closes, so this is a
    // SESSION cookie (no Max-Age / Expires; Playwright reports expires === -1).
    expect(cookie!.expires).toBe(-1);

    // A reload restores the session through the cookie: no login screen.
    await page.reload();
    await expect(page.getByText(ADMIN_CREDENTIALS.fullName).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/login$/);
    expect(await everythingScriptCanRead(page)).not.toContain('sn_admin_');

    // Two tabs: a second page in the same browser context restores the session from the same cookie
    // (the cross-tab lock keeps the two from presenting the same value), and signing out in one tab
    // signs the other out without a reload.
    const second = await context.newPage();
    await second.goto(`${URLS.admin}/users`);
    await expect(second.getByText(ADMIN_CREDENTIALS.fullName).first()).toBeVisible();
    await expect(second).not.toHaveURL(/\/login$/);

    await page.getByRole('button', { name: 'Log Out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(second).toHaveURL(/\/login$/);
    await second.close();

    // Sign-out cleared the cookie, and a reload shows the login screen.
    await expect.poll(async () => (await context.cookies()).find((c) => c.name === 'sn_admin_rt')).toBeUndefined();
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('routes are protected: no session -> /login', async ({ page }) => {
    await page.goto(`${URLS.admin}/users`);
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the user app session is not an admin session (separate auth domains)', async ({ page }) => {
    // B-246: a real signed-in user session (in-memory access token + the httpOnly sn_rt cookie, both
    // for the user app) does not open the admin console, which has its own auth domain and storage.
    const a = await registerViaApi({ age: 30, label: 'iso' });
    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/verify-email\/prompt$/);
    expect(await heldAccessToken(page)).toBeTruthy();
    await page.goto(`${URLS.admin}/users`);
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe.serial('admin: user list and detail', () => {
  let acct: Account;

  test('a registered user can be found in the Users list and opened', async ({ browser }) => {
    acct = await registerViaApi({ age: 30, label: 'detail', displayName: 'Detail Person' });
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users`);
    await expect(page.getByText('Detail Person').first()).toBeVisible();
    await page.goto(`${URLS.admin}/users/${acct.userId}`);
    await expect(page.getByRole('heading', { name: 'Detail Person' })).toBeVisible();
    await expect(page.getByText(acct.email)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Correct date of birth' })).toBeVisible();
    await page.context().close();
  });

  test('User Detail does not display a date of birth', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${acct.userId}`);
    await expect(page.getByRole('heading', { name: 'Detail Person' })).toBeVisible();
    const text = await page.locator('main, .us-page').first().innerText();
    expect(text).not.toContain(dobForAge(30).year);
    await page.context().close();
  });

  // D-07 (fixed, FC3b, B-129 / Decision Log #406 item 4). User Detail reads GET /admin/users/:id/summary,
  // which never selects the date of birth, so just OPENING a user writes no `user.dob_viewed` audit row
  // and the date never reaches the browser. Kept as a regression test; the test.fail() it used to carry
  // is gone.
  test('D-07: opening User Detail is not an audited date-of-birth read', async ({ browser }) => {
    const before = await db().adminActionLog.count({ where: { action: 'user.dob_viewed', targetId: acct.userId } });
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${acct.userId}`);
    await expect(page.getByRole('heading', { name: 'Detail Person' })).toBeVisible();
    await page.context().close();
    const after = await db().adminActionLog.count({ where: { action: 'user.dob_viewed', targetId: acct.userId } });
    expect(after).toBe(before);
  });

  test('"Revoke username" is disabled for an account with no username (the drawn "No username" state)', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${acct.userId}`);
    await expect(page.getByText('No username', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke username' })).toBeDisabled();
    await page.context().close();
  });
});

test.describe.serial('admin: date-of-birth correction (UI)', () => {
  test('validation: reason must not contain a date, must be long enough; DOB must be new and not in the future', async ({
    browser,
  }) => {
    const a = await registerViaApi({ age: 30, label: 'dobv' });
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${a.userId}/dob-correction`);
    await expect(page.getByTestId('dob-reason-warning')).toBeVisible();
    // The current DOB is shown read-only to the admin on this screen.
    await expect(page.locator('#dob-current')).toHaveValue(/\d{2} \w{3} \d{4}/);
    const submit = page.getByRole('button', { name: 'Review correction' });

    await submit.click();
    await expect(page.getByText('Enter the new date of birth.')).toBeVisible();

    await page.locator('#dob-new').fill(dobForAge(29).iso);
    await page.locator('#dob-reason').fill('too short');
    await submit.click();
    await expect(page.getByText(/at least 10 characters/)).toBeVisible();

    for (const withDate of ['Parent says born 04/09/2011 not 2010', 'Passport shows 2011-09-04 as birth date', 'Typo, should read 4 September 2011']) {
      await page.locator('#dob-reason').fill(withDate);
      await submit.click();
      await expect(page.getByText(/reason can.t contain a date/i), withDate).toBeVisible();
    }

    await page.locator('#dob-new').fill(`${new Date().getUTCFullYear() + 1}-01-01`);
    await page.locator('#dob-reason').fill('Corrected after seeing passport');
    await submit.click();
    await expect(page.getByText(/can.t be in the future/)).toBeVisible();
    await page.context().close();
  });

  test('adult -> adult: applied, audited, no guardian flow, DOB read of the form IS audited', async ({ browser }) => {
    const a = await registerViaApi({ age: 30, label: 'dob1' });
    const page = await adminPage(browser);
    await correctDobViaUi(page, a.userId, dobForAge(28).iso, 'Support corrected a typo in the year');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm correction' }).click();
    await expect(page.getByRole('heading', { name: 'Correction applied' })).toBeVisible();
    await expect(page.getByText('adult → adult')).toBeVisible();
    await page.context().close();

    const log = await db().adminActionLog.findMany({ where: { targetId: a.userId }, orderBy: { createdAt: 'asc' } });
    const actions = log.map((l: any) => l.action);
    expect(actions).toContain('user.dob_corrected');
    expect(actions).toContain('user.dob_viewed'); // the correction form reads the DOB
    const corrected = log.find((l: any) => l.action === 'user.dob_corrected');
    // No date of birth may ever be written into the audit trail.
    expect(corrected.notes ?? '').not.toMatch(/\d{4}-\d{2}-\d{2}/);
    const user = await userByEmail(a.email);
    expect(user.isMinor).toBe(false);
  });

  test('a correction request without the admin token is refused (401), and a user token cannot call it', async () => {
    const a = await registerViaApi({ age: 30, label: 'dob2' });
    const noAuth = await api('POST', `/admin/users/${a.userId}/dob-correction`, {
      body: { dateOfBirth: dobForAge(28).iso, reason: 'Support correction of typo' },
    });
    expect(noAuth.status).toBe(401);
    const asUser = await api('POST', `/admin/users/${a.userId}/dob-correction`, {
      token: a.accessToken,
      body: { dateOfBirth: dobForAge(28).iso, reason: 'Support correction of typo' },
    });
    expect(asUser.status).toBe(401);
  });

  test('adult -> minor: the form asks for guardian details up front; once given, the guardian flow starts and the user is restricted', async ({
    browser,
  }) => {
    const a = await registerViaApi({ age: 30, label: 'dob3' });
    await verifyEmailViaApi(a);
    const guardian = { name: 'Corrected Guardian', email: uniqueEmail('cg'), relationship: 'Parent' };

    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${a.userId}/dob-correction`);
    await page.locator('#dob-new').fill(dobForAge(15).iso);
    await page.locator('#dob-reason').fill('Support corrected the year after ID check');
    // The drawn Guardian details block appears as soon as the new date makes a minor ...
    await expect(page.getByTestId('guardian-fields')).toBeVisible();
    // ... and the form will not continue without all three fields (frame 6752:30141).
    await page.getByRole('button', { name: 'Review correction' }).click();
    await expect(page.getByText('Enter the guardian\u2019s name, email and relationship.')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('#guardian-name').fill(guardian.name);
    await page.locator('#guardian-email').fill(guardian.email);
    await page.locator('#guardian-relationship').selectOption(guardian.relationship);
    await page.getByRole('button', { name: 'Review correction' }).click();
    await page.getByRole('button', { name: 'Confirm correction' }).click();
    await expect(page.getByRole('heading', { name: 'Correction applied' })).toBeVisible();
    await expect(page.getByText('adult → under 16')).toBeVisible();
    await expect(page.getByText(/guardian request was created/i)).toBeVisible();
    await page.context().close();

    const user = await userByEmail(a.email);
    expect(user.isMinor).toBe(true);
    expect(user.isUnder16).toBe(true);
    expect(user.guardian.consentStatus).toBe('pending');
    expect(user.guardian.email).toBe(guardian.email.toLowerCase());
    await waitForEmail(guardian.email, 'guardian-consent');

    // The corrected account now routes to Restricted Pending on its next login, and posting is refused.
    const { token, user: u } = await me(a);
    expect(u.nextStep).toBe('restricted_pending');
    expect((await api('POST', '/posts', { token, body: { contentText: 'hi' } })).status).toBe(403);
  });

  test('minor (declined once) -> adult: the open guardian request is cancelled and the user is let through', async ({
    browser,
  }) => {
    const a = await registerViaApi({ age: 15, label: 'dob4' });
    await verifyEmailViaApi(a);
    await guardianDeclineViaApi(a);
    expect((await me(a)).user.nextStep).toBe('restricted_pending');

    const page = await adminPage(browser);
    await correctDobViaUi(page, a.userId, dobForAge(25).iso, 'Support corrected the year after ID check');
    await page.getByRole('button', { name: 'Confirm correction' }).click();
    await expect(page.getByRole('heading', { name: 'Correction applied' })).toBeVisible();
    await expect(page.getByText(/under 16 → adult/)).toBeVisible();
    await page.context().close();

    const user = await userByEmail(a.email);
    expect(user.isMinor).toBe(false);
    expect(user.isUnder16).toBe(false);
    expect((await me(a)).user.nextStep).toBe('create_profile');
  });

  test('minor with 2 declines moved to a different age tier (under 16 -> under 18): request restarts and the decline counter resets', async ({
    browser,
  }) => {
    const a = await registerViaApi({ age: 14, label: 'dob5' });
    await guardianDeclineViaApi(a, 1);
    await api('POST', '/auth/guardian-consent/resend', { body: { email: a.email } });
    await guardianDeclineViaApi(a, 2);
    expect((await userByEmail(a.email)).guardian.declineCount).toBe(2);

    const page = await adminPage(browser);
    await correctDobViaUi(page, a.userId, dobForAge(17).iso, 'Support corrected the year after ID check');
    await page.getByRole('button', { name: 'Confirm correction' }).click();
    await expect(page.getByRole('heading', { name: 'Correction applied' })).toBeVisible();
    await expect(page.getByText(/guardian request was restarted/i)).toBeVisible();
    await page.context().close();

    const g = (await userByEmail(a.email)).guardian;
    expect(g.declineCount).toBe(0);
    expect(g.consentStatus).toBe('pending');
    await waitForEmail(a.guardianEmail!, 'guardian-consent', 3);
  });

  test('same tier (under 16 -> under 16): the guardian request and the decline counter are left alone', async ({ browser }) => {
    const a = await registerViaApi({ age: 14, label: 'dob5b' });
    await guardianDeclineViaApi(a, 1);
    const page = await adminPage(browser);
    await correctDobViaUi(page, a.userId, dobForAge(15).iso, 'Support corrected the year after ID check');
    await page.getByRole('button', { name: 'Confirm correction' }).click();
    await expect(page.getByText('No change to the guardian request')).toBeVisible();
    await page.context().close();
    const g = (await userByEmail(a.email)).guardian;
    expect(g.declineCount).toBe(1);
    expect(g.consentStatus).toBe('declined');
  });

  test('the corrected user, logged in in a browser, lands on the right page', async ({ page, browser }) => {
    const a = await registerViaApi({ age: 30, label: 'dob6' });
    await verifyEmailViaApi(a);
    const guardian = { name: 'Late Guardian', email: uniqueEmail('lg'), relationship: 'Parent' };
    const ap = await adminPage(browser);
    await correctDobViaUi(ap, a.userId, dobForAge(16).iso, 'Support corrected the year after ID check', guardian);
    await ap.getByRole('button', { name: 'Confirm correction' }).click();
    await expect(ap.getByRole('heading', { name: 'Correction applied' })).toBeVisible();
    await ap.context().close();

    await loginViaUi(page, a.email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
    expect(emailsFor(guardian.email, 'guardian-consent').length).toBeGreaterThanOrEqual(1);
    void guardianConfirmViaApi;
  });
});

test.describe.serial('admin: username revoke', () => {
  let owner: Account & { token: string; username: string };
  let other: Account & { token: string };
  let adminTok = '';

  test('set-up: two verified adults, one holds a username', async () => {
    adminTok = await getAdminToken();
    const mk = async (label: string) => {
      const a = await registerViaApi({ age: 30, label });
      await verifyEmailViaApi(a);
      return { ...a, token: (await me(a)).token };
    };
    const o = await mk('rv-owner');
    const username = uniqueUsername('held');
    expect((await api('PATCH', `/users/${o.userId}`, { token: o.token, body: { username } })).status).toBe(200);
    owner = { ...o, username };
    other = await mk('rv-other');
  });

  test('UI: the revoke dialog needs a reason; confirming revokes, shows the drawn state and audits the reason', async ({
    browser,
  }) => {
    // A fresh account so the API tests below keep their own username owner.
    const u = await registerViaApi({ age: 30, label: 'rv-ui' });
    await verifyEmailViaApi(u);
    const uToken = (await me(u)).token;
    const handle = uniqueUsername('uirv');
    expect((await api('PATCH', `/users/${u.userId}`, { token: uToken, body: { username: handle } })).status).toBe(200);

    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/users/${u.userId}`);
    await expect(page.getByText(`@${handle.toLowerCase()}`).first()).toBeVisible();
    await page.getByRole('button', { name: 'Revoke username' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(`This removes @${handle.toLowerCase()} from`);
    await dialog.getByRole('button', { name: 'Revoke username' }).click(); // no reason yet
    await expect(dialog.getByText(/at least 10 characters/)).toBeVisible();
    await dialog.getByLabel('Reason (required)').fill('Impersonates a club official account');
    await dialog.getByRole('button', { name: 'Revoke username' }).click();
    await expect(page.getByText('Username revoked. The action was recorded.')).toBeVisible();
    await expect(page.getByText('No username', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revoke username' })).toBeDisabled();
    await page.screenshot({ path: '.run/shots/admin-username-revoked.png', fullPage: true });
    await page.context().close();

    expect((await userByEmail(u.email)).username).toBeNull();
    const audit = await db().adminActionLog.findMany({ where: { targetId: u.userId, action: 'user.username_revoked' } });
    expect(audit).toHaveLength(1);
    expect(audit[0].notes ?? '').toContain('Impersonates a club official account');
    // Opening User Detail never reads the DOB: the revoke flow added no `user.dob_viewed` row.
    expect(await db().adminActionLog.count({ where: { targetId: u.userId, action: 'user.dob_viewed' } })).toBe(0);
  });

  test('a reason is required (>= 10 chars) and only admins may revoke', async () => {
    const short = await api('POST', `/admin/users/${owner.userId}/username-revoke`, { token: adminTok, body: { reason: 'short' } });
    expect(short.status).toBe(400);
    const asUser = await api('POST', `/admin/users/${owner.userId}/username-revoke`, {
      token: other.token,
      body: { reason: 'I would like this one please' },
    });
    expect(asUser.status).toBe(401);
    expect((await userByEmail(owner.email)).username).toBe(owner.username.toLowerCase());
  });

  test('revoking clears the username, emails the user, writes the audit row and the 30-day hold', async () => {
    const res = await api('POST', `/admin/users/${owner.userId}/username-revoke`, {
      token: adminTok,
      body: { reason: 'Impersonates a club official account' },
    });
    expect([200, 201]).toContain(res.status);
    const user = await userByEmail(owner.email);
    expect(user.username).toBeNull();
    const mail = await waitForEmail(owner.email, 'username-revoked');
    expect(JSON.stringify(mail.data)).not.toContain('Impersonates'); // the internal reason is not sent to the user
    const hold = await db().revokedUsername.findFirst({ where: { username: owner.username.toLowerCase() } });
    expect(hold).toBeTruthy();
    const days = (hold.holdUntil.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
    const audit = await db().adminActionLog.findMany({ where: { targetId: owner.userId, action: { contains: 'username' } } });
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0].notes ?? '').toContain('Impersonates');
  });

  test('the revoked user falls back into the incomplete-profile gate on their EXISTING token', async () => {
    const view = await api('GET', `/users/${owner.userId}`, { token: owner.token });
    expect(view.status).toBe(200);
    expect(view.body.nextStep).toBe('create_profile');
    expect(view.body.profileComplete).toBe(false);
    const post = await api('POST', '/posts', { token: owner.token, body: { contentText: 'still here?' } });
    expect(post.status).toBe(403);
    expect(post.body.code).toBe('profile_incomplete');
  });

  test('in the browser the revoked user is sent to Create Profile and shows as "Soccernity member" to others', async ({
    page,
  }) => {
    await loginViaUi(page, owner.email);
    await expect(page).toHaveURL(/\/create-profile$/);
    const pub = await api('GET', `/users/${owner.userId}/public-profile`, { token: other.token });
    expect(pub.body.publicName).toBe('Soccernity member');
  });

  test('the old handle is held for everyone for 30 days (409), and can never be re-picked by its old owner (400)', async () => {
    const taken = await api('PATCH', `/users/${other.userId}`, { token: other.token, body: { username: owner.username } });
    expect(taken.status).toBe(409);
    const again = await api('PATCH', `/users/${owner.userId}`, { token: owner.token, body: { username: owner.username } });
    expect(again.status).toBe(400);
    const fresh = await api('PATCH', `/users/${owner.userId}`, { token: owner.token, body: { username: uniqueUsername('new') } });
    expect(fresh.status).toBe(200);
  });

  test('revoking a user without a username is a clean 4xx, not a 500', async () => {
    const res = await api('POST', `/admin/users/${other.userId}/username-revoke`, {
      token: adminTok,
      body: { reason: 'Revoking again for no reason' },
    });
    expect(res.status).toBeLessThan(500);
  });

  test('User Detail lists the revocation (admin sees the history)', async ({ browser }) => {
    const detail = await api('GET', `/admin/users/${owner.userId}`, { token: adminTok });
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body.usernameRevocations ?? [])).toContain(owner.username.toLowerCase());
    void browser;
  });
});
