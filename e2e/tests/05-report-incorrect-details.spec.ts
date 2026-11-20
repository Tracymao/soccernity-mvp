import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  api,
  getAdminToken,
  guardianConfirmViaApi,
  linkPath,
  registerViaApi,
  userByEmail,
  waitForEmail,
  emailsFor,
  type Account,
} from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS } from '../support/stack';

async function guardianPage(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

// B-029 / Decision Log #372: the guardian can say "these details are wrong".
// Approval is then on hold until support resolves it; declining stays possible.
test.describe.serial('guardian reports incorrect details', () => {
  let acct: Account;
  let link = '';
  let token = '';

  test('set-up: a 15-year-old with a guardian', async () => {
    acct = await registerViaApi({ age: 15, label: 'incorrect' });
    const consent = await waitForEmail(acct.guardianEmail!, 'guardian-consent');
    link = consent.data.link;
    token = new URL(link).searchParams.get('token')!;
  });

  test('the guardian page offers "Report incorrect details"; reporting puts approval on hold', async ({ browser }) => {
    const page = await guardianPage(browser);
    await page.goto(linkPath(link));
    await expect(page.getByTestId('request-summary')).toBeVisible();
    await expect(page.getByTestId('approval-on-hold')).toHaveCount(0);
    await page.getByRole('button', { name: /Report incorrect details/ }).click();
    await expect(page.getByTestId('approval-on-hold')).toBeVisible();
    await expect(page.getByRole('button', { name: /Report incorrect details/ })).toHaveCount(0);
    // Approval is blocked in the UI even with the box ticked ...
    await page.getByLabel(/I confirm I am this account holder/).check();
    await expect(page.getByRole('button', { name: 'I consent' })).toBeDisabled();
    // ... but declining is still possible.
    await expect(page.getByRole('button', { name: 'I do not consent' })).toBeEnabled();
    await page.screenshot({ path: '.run/shots/incorrect-details-on-hold.png', fullPage: true });
    await page.context().close();
    expect((await userByEmail(acct.email)).guardian.incorrectDetailsReportedAt).not.toBeNull();
  });

  test('the hold survives a reload (it is server state, not page state)', async ({ browser }) => {
    const page = await guardianPage(browser);
    await page.goto(linkPath(link));
    await expect(page.getByTestId('approval-on-hold')).toBeVisible();
    await page.context().close();
  });

  test('the API refuses to approve while on hold (not just the button)', async () => {
    const res = await api('POST', '/auth/guardian-consent', { body: { consentToken: token } });
    expect(res.status).toBe(400);
    expect((await userByEmail(acct.email)).guardian.consentStatus).toBe('pending');
  });

  test('reporting twice is harmless', async () => {
    const res = await api('POST', '/auth/guardian-consent/report-incorrect-details', { body: { consentToken: token } });
    expect([200, 201]).toContain(res.status);
  });

  test('a bad token cannot report anything', async () => {
    const res = await api('POST', '/auth/guardian-consent/report-incorrect-details', {
      body: { consentToken: '00000000-0000-4000-8000-000000000000' },
    });
    expect(res.status).toBe(400);
  });

  test('support sees the report in the API and on the admin screen (B-120); no date of birth anywhere', async ({
    browser,
  }) => {
    const admin = await getAdminToken();
    const list = await api('GET', '/admin/users/incorrect-details-reports', { token: admin });
    expect(list.status).toBe(200);
    const rows: any[] = list.body.items ?? list.body;
    expect(rows.some((r) => r.userId === acct.userId || r.id === acct.userId || r.minorUserId === acct.userId)).toBe(true);

    const page = await adminPage(browser);
    // Reached from the Users list (sidebar host: Users).
    await page.goto(`${URLS.admin}/users`);
    await page.getByRole('link', { name: 'Incorrect-details reports' }).click();
    await expect(page).toHaveURL(/\/users\/incorrect-details-reports$/);
    await expect(page.getByRole('heading', { name: 'Incorrect-details reports' })).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: acct.guardianEmail!.toLowerCase() });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Pending')).toBeVisible();
    const text = (await page.locator('.us-page').innerText()).toLowerCase();
    expect(text).not.toMatch(/date of birth:|born/);
    await page.screenshot({ path: '.run/shots/admin-incorrect-details-reports.png', fullPage: true });
    await page.context().close();
  });

  test('a non-admin token cannot reach the admin endpoints', async () => {
    const res = await api('GET', '/admin/users/incorrect-details-reports', { token: acct.accessToken });
    expect(res.status).toBe(401);
  });

  test('support resolves the report in the admin UI; the hold is lifted and the guardian can approve', async ({
    browser,
  }) => {
    const ap = await adminPage(browser);
    await ap.goto(`${URLS.admin}/users/incorrect-details-reports`);
    const row = ap.getByRole('row').filter({ hasText: acct.guardianEmail!.toLowerCase() });
    await row.getByRole('button', { name: 'Resolve' }).click();
    const dialog = ap.getByRole('dialog');
    await expect(dialog).toContainText('Resolve incorrect-details report');
    await dialog.getByRole('button', { name: 'Resolve report' }).click();
    await expect(row).toHaveCount(0); // the row leaves the list
    await ap.context().close();
    expect((await userByEmail(acct.email)).guardian.incorrectDetailsReportedAt).toBeNull();

    const page = await guardianPage(browser);
    await page.goto(linkPath(link));
    await expect(page.getByTestId('approval-on-hold')).toHaveCount(0);
    await page.getByLabel(/I confirm I am this account holder/).check();
    await page.getByRole('button', { name: 'I consent' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you' })).toBeVisible();
    await page.context().close();
    expect((await userByEmail(acct.email)).guardian.consentStatus).toBe('confirmed');
    expect(emailsFor(acct.email, 'guardian-approved-minor')).toHaveLength(1);
  });

  test('UI: resolving a report that was already resolved shows the drawn 404 message, not a crash', async ({
    browser,
  }) => {
    // A second report, resolved behind the admin's back through the API after the list loaded.
    const other = await registerViaApi({ age: 15, label: 'incorrect-404' });
    const consent = await waitForEmail(other.guardianEmail!, 'guardian-consent');
    const otherToken = new URL(consent.data.link).searchParams.get('token')!;
    const reported = await api('POST', '/auth/guardian-consent/report-incorrect-details', {
      body: { consentToken: otherToken },
    });
    expect(reported.status).toBeLessThan(300);

    const ap = await adminPage(browser);
    await ap.goto(`${URLS.admin}/users/incorrect-details-reports`);
    const row = ap.getByRole('row').filter({ hasText: other.guardianEmail!.toLowerCase() });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Resolve' }).click();
    const admin = await getAdminToken();
    const raced = await api('POST', `/admin/users/${other.userId}/incorrect-details-report/resolve`, { token: admin });
    expect(raced.status).toBeLessThan(300);
    await ap.getByRole('dialog').getByRole('button', { name: 'Resolve report' }).click();
    await expect(
      ap.getByText('No open incorrect-details report for this user. It may already have been resolved, so the list has been refreshed.'),
    ).toBeVisible();
    await expect(ap.getByRole('row').filter({ hasText: other.guardianEmail!.toLowerCase() })).toHaveCount(0);
    await ap.context().close();
  });

  test('resolving a report that is not open is a clean 404/409, not a 500', async () => {
    const admin = await getAdminToken();
    const res = await api('POST', `/admin/users/${acct.userId}/incorrect-details-report/resolve`, { token: admin });
    expect([404, 409]).toContain(res.status);
  });
});

test.describe('report incorrect details: decline path', () => {
  test('after reporting, the guardian can still decline, and that counts as decline 1', async ({ browser }) => {
    const acct = await registerViaApi({ age: 16, label: 'incdecl' });
    const consent = await waitForEmail(acct.guardianEmail!, 'guardian-consent');
    const page = await guardianPage(browser);
    await page.goto(linkPath(consent.data.link));
    await page.getByRole('button', { name: /Report incorrect details/ }).click();
    await expect(page.getByTestId('approval-on-hold')).toBeVisible();
    await page.getByRole('button', { name: 'I do not consent' }).click();
    await expect(page.getByRole('heading', { name: 'Your decision has been recorded' })).toBeVisible();
    await page.context().close();
    const g = (await userByEmail(acct.email)).guardian;
    expect(g.consentStatus).toBe('declined');
    expect(g.declineCount).toBe(1);
    void guardianConfirmViaApi;
  });
});
