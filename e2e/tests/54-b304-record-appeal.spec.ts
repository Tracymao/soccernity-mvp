import { test, expect } from '@playwright/test';
import { COPY_TAG, adminPageAs, api, createQaAdmin, db, tagged, userLogin, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-304 (c): staff record an appeal on behalf of a person suspended by a report (B-292, B-295, Decision Log #485 (f),
// #492), in real Chrome against the real API, Postgres and Redis.
//   dialog + callout : apps/admin/src/pages/moderation/RecordAppealDialog.tsx, ReportDetailPage.tsx (~line 383)
//   appeal review    : apps/admin/src/pages/moderation/AppealReviewPage.tsx (recorder note ~line 233, decision card ~line 318)
//   rule             : services/api moderation.service.ts decideAppeal (the original actioner, then the recorder, may not decide)
// Three moderators, three jobs: the ACTIONER suspends (through the real route), the RECORDER records the appeal in
// the UI, the REVIEWER (second reviewer, Decision Log #138) decides it. All are created in Postgres and used through
// locally signed tokens (the admin login is throttled to 5 per 15 minutes).
test.use({ viewport: { width: 1440, height: 1200 } });

const RUN = Date.now().toString(36);

test.describe.serial('record an appeal on behalf of a suspended person', () => {
  let actioner: QaAdmin;
  let recorder: QaAdmin;
  let reviewer: QaAdmin;
  let reporter: Verified;
  let target: Verified;
  let reportId = '';

  test.beforeAll(async () => {
    actioner = await createQaAdmin('moderator', `B304 Actioner ${RUN}`);
    recorder = await createQaAdmin('moderator', `B304 Recorder ${RUN}`);
    reviewer = await createQaAdmin('moderator', `B304 Reviewer ${RUN}`);
    reporter = await verifiedAccount('bapr');
    target = await verifiedAccount('bapt');
    const rep = await api('POST', '/reports', {
      token: reporter.token,
      body: { targetType: 'user', targetId: target.userId, reasonCategory: 'harassment_or_bullying', reason: `b304 appeal ${RUN}` },
    });
    expect(rep.status).toBe(201);
    reportId = rep.body.id as string;
    // The suspension itself goes through the real route as the actioner (the UI path is covered by spec 53).
    const act = await api('PATCH', `/admin/moderation/reports/${reportId}`, { token: actioner.token, body: { action: 'user_suspended' } });
    expect(act.status).toBe(200);
    const row = await db().user.findUnique({ where: { id: target.userId } });
    expect(row.accountStatus).toBe('suspended');
  });

  test('Record an appeal opens a dialog; an empty reason is stopped client-side and nothing is sent', async ({ browser }) => {
    const page = await adminPageAs(browser, recorder.token);
    const requests: string[] = [];
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.url().includes(`/admin/moderation/reports/${reportId}/appeal`)) requests.push(req.url());
    });
    await page.goto(`${URLS.admin}/moderation/reports/${reportId}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await page.getByRole('button', { name: 'Record an appeal' }).click();

    const dialog = page.getByRole('dialog', { name: 'Record an appeal' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Reason (required)')).toBeVisible();
    await expect(dialog.getByText(tagged('The reason is saved to the audit record.'), { exact: true })).toBeVisible();

    await dialog.getByRole('button', { name: 'Record appeal' }).click();
    await expect(dialog.getByRole('alert').filter({ hasText: 'Enter a reason for the appeal.' })).toBeVisible();
    expect(requests).toHaveLength(0);
    const untouched = await db().report.findUnique({ where: { id: reportId } });
    expect(untouched.appealStatus).toBeNull();
    await page.context().close();
  });

  test('a reason is recorded: the callout appears, the report is pending, the audit row has no reason text', async ({ browser }) => {
    const page = await adminPageAs(browser, recorder.token);
    await page.goto(`${URLS.admin}/moderation/reports/${reportId}`);
    await page.getByRole('button', { name: 'Record an appeal' }).click();
    const dialog = page.getByRole('dialog', { name: 'Record an appeal' });
    const REASON = `The person says they were suspended by mistake ${RUN}`;
    await dialog.getByLabel('Reason (required)').fill(REASON);
    await dialog.getByRole('button', { name: 'Record appeal' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(
      page.getByText(tagged('Appeal recorded for the account. It is waiting for review, and closure of this report is paused.'), { exact: true }),
    ).toBeVisible();
    // The button that opened the dialog is gone: the report already has an appeal.
    await expect(page.getByRole('button', { name: 'Record an appeal' })).toHaveCount(0);

    const report = await db().report.findUnique({ where: { id: reportId } });
    expect(report.appealStatus).toBe('pending');
    expect(report.appealReason).toBe(REASON);
    expect(report.appealRecordedByAdminId).toBe(recorder.id);
    // The audit row names the recording admin and the status only, never the reason.
    const audit = await db().adminActionLog.findFirst({ where: { action: 'report.appeal_recorded', targetId: reportId } });
    expect(audit).toBeTruthy();
    expect(audit.adminId).toBe(recorder.id);
    expect(audit.notes).toBe('pending');
    expect(audit.notes ?? '').not.toContain(REASON);
    // Nothing happened to the account: still suspended until the appeal is decided.
    const user = await db().user.findUnique({ where: { id: target.userId } });
    expect(user.accountStatus).toBe('suspended');
    expect(COPY_TAG).toBeTruthy();
    await page.context().close();
  });

  test('the recorder cannot decide it: the review page says so and the real route refuses with the coded 403', async ({ browser }) => {
    const page = await adminPageAs(browser, recorder.token);
    await page.goto(`${URLS.admin}/moderation/appeals/${reportId}`);
    await expect(page.getByRole('heading', { name: 'Appeal recorded by staff' }).first()).toBeVisible();
    await expect(page.getByText('Pending — recorded by staff')).toBeVisible();
    await expect(
      page.getByText('Staff recorded this appeal on the person’s behalf. The staff member who recorded it cannot decide it.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Overturn Decision' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'The admin who recorded this appeal may not also decide it.' })).toBeVisible();
    const report = await db().report.findUnique({ where: { id: reportId } });
    expect(report.appealStatus).toBe('pending');
    expect((await db().user.findUnique({ where: { id: target.userId } })).accountStatus).toBe('suspended');

    const viaApi = await api('PATCH', `/admin/moderation/reports/${reportId}/appeal`, { token: recorder.token, body: { decision: 'overturned' } });
    expect(viaApi.status).toBe(403);
    expect(viaApi.body.code).toBe('appeal_recorder_cannot_decide');
    // The admin who took the original action may not decide it either (Decision Log #138).
    const byActioner = await api('PATCH', `/admin/moderation/reports/${reportId}/appeal`, { token: actioner.token, body: { decision: 'overturned' } });
    expect(byActioner.status).toBe(403);
    expect(byActioner.body.message).toBe('The admin who actioned this report may not also review its appeal');
    await page.context().close();
  });

  test('a second reviewer can decide it: overturning reinstates the account and clears the link', async ({ browser }) => {
    const page = await adminPageAs(browser, reviewer.token);
    await page.goto(`${URLS.admin}/moderation/appeals/${reportId}`);
    await expect(page.getByText('Pending — recorded by staff')).toBeVisible();
    await page.getByRole('button', { name: 'Overturn Decision' }).click();
    // Deciding returns to the queue.
    await expect(page).toHaveURL(`${URLS.admin}/moderation`);

    const report = await db().report.findUnique({ where: { id: reportId } });
    expect(report.appealStatus).toBe('overturned');
    expect(report.appealReviewedByAdminId).toBe(reviewer.id);
    expect(report.status).toBe('open');
    const user = await db().user.findUnique({ where: { id: target.userId } });
    expect(user.accountStatus).toBe('active');
    expect(user.suspendedByReportId).toBeNull();
    // The person can sign in again.
    expect([200, 201]).toContain((await userLogin(target.email)).status);
    const audit = await db().adminActionLog.findFirst({ where: { action: 'report.appeal_decided', targetId: reportId } });
    expect(audit.adminId).toBe(reviewer.id);
    await page.context().close();
  });
});
