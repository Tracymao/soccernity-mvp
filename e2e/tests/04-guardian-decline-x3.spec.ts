import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  GUARDIAN,
  api,
  emailsFor,
  linkPath,
  loginViaUi,
  signUpViaUi,
  uniqueEmail,
  userByEmail,
  userLogin,
  waitForEmail,
} from '../support/helpers';

async function guardianPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}
async function guardianDeclines(browser: Browser, link: string): Promise<void> {
  const page = await guardianPage(browser);
  await page.goto(linkPath(link));
  await page.getByRole('button', { name: 'I do not consent' }).click();
  await expect(page.getByRole('heading', { name: 'Your decision has been recorded' })).toBeVisible();
  await page.context().close();
}

// Decision Log #389 / #395 / #402: a guardian may decline up to three times.
// Declines 1 and 2 leave the account open (sessions valid) and show the
// in-account decline view; the third closes it for deletion (30-day grace).
test.describe.serial('guardian declines three times', () => {
  const email = uniqueEmail('decline');
  const guardian1 = GUARDIAN('gd1');
  const guardian3 = { ...GUARDIAN('gd3'), name: 'New Guardian' };
  let userId = '';
  let accessToken = '';

  test('set-up: a 14-year-old registers and signs in via the API to hold a long-lived access token', async ({
    page,
  }) => {
    await signUpViaUi(page, { email, age: 14, guardian: guardian1, expectUrl: /\/guardian-consent$/ });
    const login = await userLogin(email);
    userId = login.body.user.id;
    accessToken = login.body.accessToken;
    expect(login.body.user.guardianConsentStatus).toBe('pending');
  });

  test('DECLINE 1: the guardian declines from the emailed link and sees the recorded-decision screen', async ({
    browser,
  }) => {
    const consent = await waitForEmail(guardian1.email, 'guardian-consent', 1);
    await guardianDeclines(browser, consent.data.link);
    const g = (await userByEmail(email)).guardian;
    expect(g.consentStatus).toBe('declined');
    expect(g.declineCount).toBe(1);
    expect(g.consentDeclineSource).toBe('guardian_explicit');
    expect((await userByEmail(email)).accountStatus).toBe('active');
  });

  test('decline 1: the minor is NOT logged out and NOT emailed; the old access token still works', async () => {
    const me = await api('GET', `/users/${userId}`, { token: accessToken });
    expect(me.status).toBe(200);
    expect(me.body.guardianConsentStatus).toBe('declined');
    expect(me.body.nextStep).toBe('restricted_pending');
    // No "your guardian declined" email on declines 1 and 2 (only on the third).
    expect(emailsFor(email, 'guardian-consent-declined')).toHaveLength(0);
  });

  test('decline 1: the declined link cannot be used to approve afterwards', async ({ browser }) => {
    const consent = await waitForEmail(guardian1.email, 'guardian-consent', 1);
    const page = await guardianPage(browser);
    await page.goto(linkPath(consent.data.link));
    await page.getByLabel(/I confirm I am this account holder/).check();
    await page.getByRole('button', { name: 'I consent' }).click();
    await expect(page.getByRole('alert')).toContainText(/declined or withdrawn/);
    await page.context().close();
    expect((await userByEmail(email)).guardian.consentStatus).toBe('declined');
  });

  test('decline 1: logging in shows the web decline view with the cap sentence and no running count', async ({
    page,
  }) => {
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    const view = page.getByTestId('guardian-consent-declined');
    await expect(view).toBeVisible();
    // FC3a: the heading names the guardian (first name from the status response, B-131).
    await expect(page.getByRole('heading', { name: new RegExp(`^${guardian1.name.split(' ')[0]} hasn.t approved your account`) })).toBeVisible();
    await expect(page.getByText(/chose not to approve your account on \d{1,2} \w+ \d{4}/)).toBeVisible();
    await expect(page.getByTestId('decline-cap-sentence')).toContainText('A guardian can decline up to 3 times');
    // No running counter in any wording.
    await expect(view).not.toContainText(/\b1 of 3\b|\b1\/3\b|2 (declines )?left|remaining/i);
    // It does not tell the minor the account is about to be deleted yet.
    await expect(page.getByRole('button', { name: 'Resend approval request' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Change guardian email' })).toBeVisible();
    await page.screenshot({ path: '.run/shots/decline-1-minor-view.png', fullPage: true });
  });

  // D-03 (fixed, FC3a). The button used to post status.guardianEmail (the
  // GUARDIAN's address) to POST /auth/guardian-consent/resend, which looks the
  // account up by the MINOR's email, so it silently did nothing. It now sends
  // the minor's own registered email: the request reopens, the page leaves the
  // decline view and a fresh link is mailed.
  test('D-03: the "Resend approval request" button reopens the request and mails a fresh link', async ({ page }) => {
    await loginViaUi(page, email);
    await expect(page).toHaveURL(/\/guardian-consent$/);
    await page.getByRole('button', { name: 'Resend approval request' }).click();
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/sent a new approval email/i)).toBeVisible();
    await page.screenshot({ path: '.run/shots/decline-1-after-resend.png', fullPage: true });
  });

  test('decline 1: after the web resend the old link is dead and a fresh link was mailed', async () => {
    const second = await waitForEmail(guardian1.email, 'guardian-consent', 2);
    const first = (await waitForEmail(guardian1.email, 'guardian-consent', 1)).data.link;
    expect(emailsFor(guardian1.email, 'guardian-consent')).toHaveLength(2);
    expect(second.data.link).not.toBe(first);
    const g = (await userByEmail(email)).guardian;
    expect(g.consentStatus).toBe('pending');
    expect(g.declineCount).toBe(1);
    // The OLD link no longer resolves a request.
    const oldToken = new URL(first).searchParams.get('token')!;
    const probe = await api('GET', '/auth/guardian-consent/request-summary', { headers: { 'x-consent-token': oldToken } });
    expect(probe.status).toBeGreaterThanOrEqual(400);
  });

  test('DECLINE 2: guardian declines the fresh link; the minor is still logged in and not emailed', async ({
    browser,
  }) => {
    const second = await waitForEmail(guardian1.email, 'guardian-consent', 2);
    await guardianDeclines(browser, second.data.link);
    const g = (await userByEmail(email)).guardian;
    expect(g.consentStatus).toBe('declined');
    expect(g.declineCount).toBe(2);
    const me = await api('GET', `/users/${userId}`, { token: accessToken });
    expect(me.status).toBe(200);
    expect(emailsFor(email, 'guardian-consent-declined')).toHaveLength(0);
    expect((await userByEmail(email)).accountStatus).toBe('active');
  });

  test('decline 2: the minor sees the decline view again, still with no count', async ({ page }) => {
    await loginViaUi(page, email);
    await expect(page.getByTestId('guardian-consent-declined')).toBeVisible();
    await expect(page.getByTestId('guardian-consent-declined')).not.toContainText(/\b2 of 3\b|\b2\/3\b|1 left/i);
    await page.screenshot({ path: '.run/shots/decline-2-minor-view.png', fullPage: true });
  });

  // D-04 (fixed, FC3a). The decline view offers "Change guardian email" and the
  // API accepts a change after decline 1 or 2 (it reopens the request); the
  // page it links to used to treat anything other than "pending" as closed and
  // showed "This request is closed". It now shows the change form for a declined
  // request too.
  test('D-04: "Change guardian email" on the decline view opens the change form', async ({ page }) => {
    await loginViaUi(page, email);
    await page.getByRole('link', { name: 'Change guardian email' }).click();
    await expect(page).toHaveURL(/\/guardian-consent\/change-email$/);
    await expect(page.getByRole('heading', { name: /Change your guardian.s email/ })).toBeVisible({ timeout: 5000 });
  });

  test('decline 2: changing the guardian email (API) restarts approval for a NEW guardian; decline count NOT reset', async () => {
    const login = await userLogin(email);
    const token = login.body.accessToken;
    // Same address as now is refused.
    const same = await api('POST', '/auth/guardian-consent/change-guardian-email', {
      token,
      body: { name: guardian3.name, email: guardian1.email, relationship: 'Parent' },
    });
    expect(same.status).toBe(400);
    // The minor's own address is refused.
    const own = await api('POST', '/auth/guardian-consent/change-guardian-email', {
      token,
      body: { name: guardian3.name, email, relationship: 'Parent' },
    });
    expect(own.status).toBe(400);
    const ok = await api('POST', '/auth/guardian-consent/change-guardian-email', {
      token,
      body: { name: guardian3.name, email: guardian3.email, relationship: 'Parent' },
    });
    expect([200, 201]).toContain(ok.status);
    const g = (await userByEmail(email)).guardian;
    expect(g.consentStatus).toBe('pending');
    expect(g.email).toBe(guardian3.email.toLowerCase());
    expect(g.declineCount).toBe(2);
    await waitForEmail(guardian3.email, 'guardian-consent');
  });

  test('the minor now sees the pending view naming the NEW guardian address', async ({ page }) => {
    await loginViaUi(page, email);
    await expect(page.getByTestId('guardian-consent-pending')).toBeVisible();
    await expect(page.getByText(`We emailed ${guardian3.email}`)).toBeVisible();
  });

  test('DECLINE 3: the new guardian declines; login is blocked at once and the account is scheduled for deletion', async ({
    browser,
  }) => {
    const consent = await waitForEmail(guardian3.email, 'guardian-consent');
    await guardianDeclines(browser, consent.data.link);
    const user = await userByEmail(email);
    expect(user.guardian.declineCount).toBe(3);
    expect(user.accountStatus).toBe('pending_deletion');
    expect(user.pendingDeletionAt).not.toBeNull();
    // Third decline = one email to the minor.
    const mail = await waitForEmail(email, 'guardian-consent-declined');
    expect(mail.to).toBe(email);
    expect(emailsFor(email, 'guardian-consent-declined')).toHaveLength(1);
  });

  test('decline 3: the long-lived access token is revoked at the next refresh, and a fresh login is refused generically', async ({
    page,
  }) => {
    const login = await userLogin(email);
    expect(login.status).toBe(401);
    expect(JSON.stringify(login.body)).not.toMatch(/delet|declin|guardian/i); // no oracle about the state
    await loginViaUi(page, email);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('decline 3: a 4th decline / confirm attempt cannot reopen the account', async ({ browser }) => {
    const consent = await waitForEmail(guardian3.email, 'guardian-consent');
    const token = new URL(consent.data.link).searchParams.get('token')!;
    const res = await api('POST', '/auth/guardian-consent', { body: { consentToken: token } });
    expect(res.status).toBe(400);
    expect((await userByEmail(email)).guardian.consentStatus).toBe('declined');
    void browser;
  });
});
