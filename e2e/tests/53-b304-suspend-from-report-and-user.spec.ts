import { test, expect, type Page } from '@playwright/test';
import { COPY_TAG, adminPageAs, api, createQaAdmin, db, tagged, userLogin, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-304 (b): suspending an account from a report and from the user page (B-291, B-295, Decision Log #485, #492,
// #497) in real Chrome against the real API, Postgres and Redis.
//   report page : apps/admin/src/pages/moderation/ReportDetailPage.tsx (Suspend User -> SuspendAccountDialog "report" mode)
//   user page   : apps/admin/src/pages/users/UserDetailPage.tsx (Suspend account -> the same dialog, "user" mode, category required)
// The acting admin is a moderator created in Postgres and used through a locally signed token (support/helpers.ts
// createQaAdmin): the admin login is throttled to 5 per 15 minutes and the suite spends that budget elsewhere.
// Every person is a synthetic account in the scratch database.
test.use({ viewport: { width: 1440, height: 1200 } });

const RUN = Date.now().toString(36);

async function userReport(reporter: Verified, targetId: string, reasonCategory: string): Promise<string> {
  const res = await api('POST', '/reports', {
    token: reporter.token,
    body: { targetType: 'user', targetId, reasonCategory, reason: `b304 suspend ${RUN}` },
  });
  if (res.status !== 201) throw new Error(`POST /reports failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.id as string;
}

async function pageAs(browser: Parameters<typeof adminPageAs>[0], admin: QaAdmin): Promise<Page> {
  return adminPageAs(browser, admin.token);
}

test.describe.serial('suspend an account: from a report and from the user page', () => {
  let mod: QaAdmin;
  let reporter: Verified;
  let targetA: Verified; // suspended from the report
  let targetB: Verified; // suspended from the user page
  let reportA = '';
  let refreshA = '';
  let refreshB = '';

  test.beforeAll(async () => {
    mod = await createQaAdmin('moderator', `B304 Suspender ${RUN}`);
    reporter = await verifiedAccount('b304-rep');
    targetA = await verifiedAccount('b304-sa');
    targetB = await verifiedAccount('b304-sb');
    reportA = await userReport(reporter, targetA.userId, 'harassment_or_bullying');
    // A live session for each target, taken BEFORE the suspension, so the suspension has something to end.
    const a = await userLogin(targetA.email);
    expect([200, 201]).toContain(a.status);
    refreshA = a.body.refreshToken as string;
    const b = await userLogin(targetB.email);
    expect([200, 201]).toContain(b.status);
    refreshB = b.body.refreshToken as string;
    expect(refreshA).toBeTruthy();
    expect(refreshB).toBeTruthy();
  });

  test('report detail: Suspend User opens the confirmation (report mode: consequences, no category), and Cancel changes nothing', async ({ browser }) => {
    const page = await pageAs(browser, mod);
    await page.goto(`${URLS.admin}/moderation/reports/${reportA}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await page.getByRole('button', { name: 'Suspend User', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Suspend this account?' });
    await expect(dialog).toBeVisible();
    // The five consequence sentences, each ending with the literal tag in the rendered text.
    await expect(dialog.getByRole('listitem')).toHaveCount(5);
    for (const text of [
      'They can’t sign in, and every session they have ends now.',
      'Engagement points they earned from views, likes and comments are removed.',
      'If they are under 18, their guardian is told once.',
      'If an appeal against this report is overturned, the account is reinstated automatically.',
    ]) {
      await expect(dialog.getByText(tagged(text), { exact: true })).toBeVisible();
    }
    await expect(dialog.getByText('based on this report’s category', { exact: false })).toBeVisible();
    // Report mode asks for no category: the report supplies it.
    await expect(dialog.getByRole('radio')).toHaveCount(0);
    await expect(dialog.getByText('Reason category (required)')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    const still = await db().user.findUnique({ where: { id: targetA.userId } });
    expect(still.accountStatus).toBe('active');
    const noAction = await db().report.findUnique({ where: { id: reportA } });
    expect(noAction.status).toBe('open');
    await page.context().close();
  });

  test('report detail: confirming suspends the account, shows the Account suspended callout and pill, and ends the session', async ({ browser }) => {
    const page = await pageAs(browser, mod);
    await page.goto(`${URLS.admin}/moderation/reports/${reportA}`);
    await page.getByRole('button', { name: 'Suspend User', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Suspend this account?' });
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog).toHaveCount(0);

    // The page stays on the report and shows the suspended state (callout + pill), both with the tag where drawn.
    await expect(page).toHaveURL(new RegExp(`/moderation/reports/${reportA}$`));
    await expect(
      page.getByText(tagged('Account suspended. The account can no longer sign in and has been emailed.'), { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.mod-pill', { hasText: 'Account suspended' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record an appeal' })).toBeVisible();

    // The server really suspended the account, in the same step as recording the action.
    const user = await db().user.findUnique({ where: { id: targetA.userId } });
    expect(user.accountStatus).toBe('suspended');
    expect(user.suspendedByReportId).toBe(reportA);
    const report = await db().report.findUnique({ where: { id: reportA } });
    expect(report.status).toBe('actioned');
    expect(report.actionTaken).toBe('user_suspended');
    const audit = await db().adminActionLog.findFirst({ where: { action: 'report.actioned', targetId: reportA } });
    expect(audit).toBeTruthy();
    expect(audit.adminId).toBe(mod.id);
    expect(audit.notes).toBe('user_suspended');

    // Sessions end and sign-in is refused: the refresh token taken before is dead, and a fresh login is 401.
    const refresh = await api('POST', '/auth/refresh', { body: { refreshToken: refreshA } });
    expect(refresh.status).toBe(401);
    const login = await userLogin(targetA.email);
    expect(login.status).toBe(401);
    // The reporter is untouched.
    expect([200, 201]).toContain((await userLogin(reporter.email)).status);
    await page.context().close();
  });

  test('user page: Suspend account needs a reason category (dialog, required error), then suspends and shows the callout', async ({ browser }) => {
    const page = await pageAs(browser, mod);
    await page.goto(`${URLS.admin}/users/${targetB.userId}`);
    await expect(page.getByRole('heading', { name: 'Account', exact: true })).toBeVisible();
    const support = page.getByRole('region', { name: 'Support actions' });
    await expect(support.getByText('Suspend this account. A reason category is required.')).toBeVisible();
    await support.getByRole('button', { name: 'Suspend account' }).click();

    const dialog = page.getByRole('dialog', { name: 'Suspend this account?' });
    await expect(dialog).toBeVisible();
    // User mode: the nine categories as a required radio list, with the user-page wording of the email bullet.
    await expect(dialog.getByText('Reason category (required)')).toBeVisible();
    await expect(dialog.getByRole('radio')).toHaveCount(9);
    await expect(dialog.getByRole('radio', { name: 'Spam or scam' })).toBeVisible();
    await expect(dialog.getByText('based on the category you choose', { exact: false })).toBeVisible();
    await expect(
      dialog.getByText(tagged('A moderator reviews appeals sent through Contact Us and can reinstate the account from this page.'), { exact: true }),
    ).toBeVisible();

    // Confirming with no category sends nothing and says why.
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Choose a reason category.' })).toBeVisible();
    const untouched = await db().user.findUnique({ where: { id: targetB.userId } });
    expect(untouched.accountStatus).toBe('active');

    // Choose one and confirm.
    await dialog.getByRole('radio', { name: 'Spam or scam' }).check();
    await dialog.getByRole('button', { name: 'Suspend account' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText(tagged('Account suspended. The account can no longer sign in and has been emailed.'), { exact: true }),
    ).toBeVisible();
    // The row now says it is suspended and the button is gone.
    await expect(support.getByText('This account is suspended.')).toBeVisible();
    await expect(support.getByRole('button', { name: 'Suspend account' })).toHaveCount(0);

    const user = await db().user.findUnique({ where: { id: targetB.userId } });
    expect(user.accountStatus).toBe('suspended');
    // A user-page suspension is not caused by a report.
    expect(user.suspendedByReportId).toBeNull();
    const audit = await db().adminActionLog.findFirst({ where: { action: 'user.status_updated', targetId: targetB.userId } });
    expect(audit).toBeTruthy();
    expect(audit.adminId).toBe(mod.id);
    expect(audit.notes).toBe('status=suspended; reasonCategory=spam_or_scam');

    expect((await api('POST', '/auth/refresh', { body: { refreshToken: refreshB } })).status).toBe(401);
    expect((await userLogin(targetB.email)).status).toBe(401);
    await page.context().close();
  });

  test('the audit log lists both suspensions under the moderator\'s own activity', async ({ browser }) => {
    const page = await pageAs(browser, mod);
    await page.goto(`${URLS.admin}/activity`);
    await expect(page.getByRole('heading', { level: 1, name: 'My activity' })).toBeVisible();
    const table = page.getByRole('table', { name: 'My activity' });
    await expect(table.getByRole('cell', { name: 'Report actioned' }).first()).toBeVisible();
    await expect(table.getByRole('cell', { name: 'User status changed' }).first()).toBeVisible();
    await expect(table).toContainText('status=suspended; reasonCategory=spam_or_scam');
    await page.context().close();
  });

  test('a client cannot dodge the category: the real route refuses a user-page suspension without one', async () => {
    const victim = await verifiedAccount('b304-sc');
    const res = await api('PATCH', `/admin/users/${victim.userId}`, { token: mod.token, body: { status: 'suspended' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('suspension_reason_category_required');
    const row = await db().user.findUnique({ where: { id: victim.userId } });
    expect(row.accountStatus).toBe('active');
    expect(COPY_TAG).toBeTruthy();
  });
});
