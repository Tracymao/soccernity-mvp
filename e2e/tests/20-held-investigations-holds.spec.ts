import * as fs from 'fs';
import * as path from 'path';
import { test, expect, type Page } from '@playwright/test';
import { api, db, registerViaApi, type Account } from '../support/helpers';
import { adminPage } from '../support/admin-ui';
import { URLS, USER_PASSWORD } from '../support/stack';

// B-045 (Decision Log #398 D1, #403 item 8): the Held investigations screen and the two case-level hold actions,
// in real Chrome against the real API, Postgres and Redis. Scoped to this screen only.
//
// NOT covered, and why: lifting a hold. The Lift hold dialog frame draws no reason field although a lift needs one,
// and the held list returns no hold id, so there is no Lift control to drive (see the PR).
//
// Set-up: a report whose reported user has deleted their account and is past the 30-day grace period (the state in
// which a hold is what keeps the row), and a second report whose REPORTER is in that state.
test.use({ viewport: { width: 1440, height: 1184 } });

// Screenshots for the visual check against the Figma frames.
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'b045-screens');
fs.mkdirSync(OUT, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

const DAY = 24 * 60 * 60 * 1000;

async function deleteAccountAndAgeIt(acct: Account): Promise<void> {
  const res = await api('POST', '/auth/delete-account', { token: acct.accessToken, body: { password: USER_PASSWORD } });
  if (res.status >= 300) throw new Error(`delete-account failed ${res.status} ${JSON.stringify(res.body)}`);
  // 200 days ago: past the 30-day grace period and past the default 90-day "held more than" threshold.
  await db().user.update({ where: { id: acct.userId }, data: { pendingDeletionAt: new Date(Date.now() - 200 * DAY) } });
}

async function reportAgainst(reporter: Account, target: Account, reason: string): Promise<string> {
  const res = await api('POST', '/reports', {
    token: reporter.accessToken,
    body: { targetType: 'user', targetId: target.userId, reason },
  });
  if (res.status !== 201) throw new Error(`report failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

async function openReport(page: Page, reportId: string): Promise<void> {
  await page.goto(`${URLS.admin}/moderation/reports/${reportId}`);
  await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
}

async function placeHold(page: Page, opener: string, confirm: string, reason: string): Promise<void> {
  await page.getByRole('button', { name: opener }).click();
  const dialog = page.getByRole('dialog', { name: opener });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Reason (required)').fill(reason);
  await dialog.getByRole('button', { name: confirm }).click();
  await expect(dialog).toBeHidden();
}

test.describe.serial('held investigations and case-level holds', () => {
  let reporterA: Account;
  let reportedA: Account;
  let reporterB: Account;
  let reportedB: Account;
  let legalReportId = '';
  let badFaithReportId = '';

  test('set-up: two reports, and the account each hold will keep is past its grace period', async () => {
    reporterA = await registerViaApi({ age: 30, label: 'hi-reporter-a', displayName: 'Rita Reporter' });
    reportedA = await registerViaApi({ age: 30, label: 'hi-reported-a', displayName: 'Ruben Reported' });
    reporterB = await registerViaApi({ age: 30, label: 'hi-reporter-b', displayName: 'Bola Badfaith' });
    reportedB = await registerViaApi({ age: 30, label: 'hi-reported-b', displayName: 'Dayo Discussed' });
    legalReportId = await reportAgainst(reporterA, reportedA, 'Threatening messages to another player');
    badFaithReportId = await reportAgainst(reporterB, reportedB, 'Made up to get a rival banned');
    // The reported user of report A, and the REPORTER of report B, leave and are past the grace period.
    await deleteAccountAndAgeIt(reportedA);
    await deleteAccountAndAgeIt(reporterB);
  });

  test('a legal hold is placed from Report Detail: reason required, both accounts held, nobody notified', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await openReport(page, legalReportId);
    // No hold yet: no marker.
    await expect(page.getByLabel('Active holds')).toHaveCount(0);

    // The two actions sit with the report actions; the dialog needs a real reason.
    await expect(page.getByRole('button', { name: 'Reporter acted in bad faith' })).toBeVisible();
    await page.getByRole('button', { name: 'Legal hold' }).click();
    const dialog = page.getByRole('dialog', { name: 'Legal hold' });
    await expect(dialog).toContainText('This holds both accounts in full until an admin lifts it. [COPY PENDING LEGAL REVIEW]');
    await shot(page, '01-legal-hold-dialog');
    await dialog.getByLabel('Reason (required)').fill('short');
    await dialog.getByRole('button', { name: 'Place legal hold' }).click();
    await expect(dialog.getByRole('alert')).toHaveText('Give a reason of at least 10 characters.');
    // Nothing was placed by the refused attempt.
    expect(await db().accountHold.count({ where: { reportId: legalReportId } })).toBe(0);

    await dialog.getByLabel('Reason (required)').fill('Police asked us to preserve both accounts.');
    await dialog.getByRole('button', { name: 'Place legal hold' }).click();
    await expect(dialog).toBeHidden();

    // The hold-active state: one marker, with the date, on the same page.
    const status = page.getByLabel('Active holds');
    await expect(status.getByText('Legal hold')).toBeVisible();
    await expect(status).toContainText('Active since');
    await expect(page.getByRole('button', { name: /lift hold/i })).toHaveCount(0);
    await shot(page, '02-legal-hold-active');

    // The real rows: one per party that has an account (both), the reason in the audit log, nobody notified.
    const holds = await db().accountHold.findMany({ where: { reportId: legalReportId } });
    expect(holds.map((h: any) => h.type)).toEqual(['legal_hold', 'legal_hold']);
    expect(await db().adminActionLog.count({ where: { targetId: { in: holds.map((h: any) => h.userId) } } })).toBeGreaterThan(0);
    expect(await db().notification.count({ where: { userId: { in: [reporterA.userId, reportedA.userId] }, type: 'moderation_decision' } })).toBe(0);

    // A second attempt is refused by the server and its own message is shown in the dialog.
    await page.getByRole('button', { name: 'Legal hold' }).click();
    const again = page.getByRole('dialog', { name: 'Legal hold' });
    await again.getByLabel('Reason (required)').fill('Trying to place it a second time.');
    await again.getByRole('button', { name: 'Place legal hold' }).click();
    await expect(again.getByRole('alert')).toBeVisible();
    await expect(again).toBeVisible();
    await again.getByRole('button', { name: 'Cancel' }).click();
    await page.context().close();
  });

  test('a bad-faith hold is placed on the reporter and shows as active; the dialog traps focus and gives it back', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await openReport(page, badFaithReportId);

    const opener = page.getByRole('button', { name: 'Reporter acted in bad faith' });
    await opener.focus();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Reporter acted in bad faith' });
    await expect(dialog).toContainText('This holds the reporter’s account in full for 6 months. [COPY PENDING LEGAL REVIEW]');
    // Focus moves into the dialog, onto the reason field.
    await expect(dialog.getByLabel('Reason (required)')).toBeFocused();
    // Tab stays inside the dialog.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    // Escape closes it and focus returns to the opener.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await placeHold(page, 'Reporter acted in bad faith', 'Confirm bad faith', 'Invented the abuse claim against a rival.');
    const status = page.getByLabel('Active holds');
    await expect(status.getByText('Reporter acted in bad faith')).toBeVisible();
    await expect(status).toContainText('Active since');

    const holds = await db().accountHold.findMany({ where: { reportId: badFaithReportId } });
    expect(holds.length).toBe(1);
    expect(holds[0].type).toBe('bad_faith');
    expect(holds[0].userId).toBe(reporterB.userId);
    expect(holds[0].expiresAt).not.toBeNull();
    await page.context().close();
  });

  test('the Held investigations list shows both held accounts with the right markers, and is reached from the queue', async ({
    browser,
  }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation`);
    await page.getByRole('link', { name: 'Held investigations' }).click();
    await expect(page).toHaveURL(/\/moderation\/held-investigations$/);
    await expect(page.getByRole('heading', { name: 'Held investigations' })).toBeVisible();
    await expect(page.getByText(/^Held more than \d+ days$/)).toBeVisible();

    const table = page.getByRole('table', { name: 'Held investigations' });
    const headers = await table.getByRole('columnheader').allTextContents();
    expect(headers).toEqual(['User', 'Email', 'User ID', 'Held since', 'Days held', 'Hold type']);

    // reportedA: legal hold. reporterB: the bad-faith hold.
    const legalRow = table.getByRole('row').filter({ hasText: reportedA.email.toLowerCase() });
    await expect(legalRow).toContainText('Legal hold');
    await expect(legalRow.getByRole('cell').nth(4)).toHaveText(/^1[67]\d$/); // days held, about 170
    const badFaithRow = table.getByRole('row').filter({ hasText: reporterB.email.toLowerCase() });
    await expect(badFaithRow).toContainText('Reporter acted in bad faith');

    // Visibility only: no Lift hold control, and nothing says anyone is notified.
    await expect(page.getByText(/lift hold/i)).toHaveCount(0);
    await expect(page.getByText(/Visibility only/)).toBeVisible();
    await shot(page, '03-held-investigations');
    await page.context().close();
  });

  test('the filter: a value out of range is refused on the page, a real value narrows the list', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/moderation/held-investigations`);
    const table = page.getByRole('table', { name: 'Held investigations' });
    await expect(table).toBeVisible();

    const requests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/admin/users/held-investigations')) requests.push(r.url());
    });
    const field = page.getByLabel('Held for more than');
    await field.fill('4000');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Enter a whole number from 0 to 3650.' })).toBeVisible();
    expect(requests).toHaveLength(0);

    // 365 days: the accounts were held for about 170, so the list is empty and says so.
    await field.fill('365');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(page.getByText('No held investigations')).toBeVisible();
    await expect(page.getByText('No account has been held by an open report for more than 365 days.')).toBeVisible();
    await expect(page.getByText('Held more than 365 days')).toBeVisible();
    expect(requests.some((u) => u.includes('olderThanDays=365'))).toBe(true);

    // 0 days: both come back.
    await field.fill('0');
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(table.getByRole('row').filter({ hasText: reportedA.email.toLowerCase() })).toBeVisible();
    await page.context().close();
  });
});
