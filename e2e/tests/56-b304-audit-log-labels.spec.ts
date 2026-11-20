import { test, expect } from '@playwright/test';
import { adminPage } from '../support/admin-ui';
import { adminPageAs, api, createQaAdmin, db, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-304 (e): the Audit log / My activity screen names the two newest action kinds in words, not as raw keys
// (B-303, PR #748): "Appeal recorded" for report.appeal_recorded (B-292) and "Username review decided" for
// user.username_review_decided (B-139 part (c)).
//   labels : apps/admin/src/api/adminActionLog.ts ACTION_KINDS lines 75 and 83, actionLabel(); screen AuditLogPage.tsx
// Both audit rows are written by the REAL routes (no row is inserted directly):
//   report.appeal_recorded            <- POST /admin/moderation/reports/:id/appeal (after a real suspension)
//   user.username_review_decided      <- POST /admin/username-reviews/:id/decide (after a real revoke and a real request)
// The people involved are synthetic accounts and three moderators created in Postgres (locally signed tokens).
test.use({ viewport: { width: 1440, height: 1300 } });

const RUN = Date.now().toString(36);
const REASON = 'A reason that is long enough for the audit record.';

test.describe.serial('audit log: the two newest action kinds read as words', () => {
  let actioner: QaAdmin;
  let recorder: QaAdmin;
  let reviewer: QaAdmin;
  let reportId = '';
  let userId = '';

  test.beforeAll(async () => {
    actioner = await createQaAdmin('moderator', `B304 Log Actioner ${RUN}`);
    recorder = await createQaAdmin('moderator', `B304 Log Recorder ${RUN}`);
    reviewer = await createQaAdmin('moderator', `B304 Log Reviewer ${RUN}`);

    // 1) A staff-recorded appeal: report -> real suspension -> recorded appeal.
    const reporter: Verified = await verifiedAccount('balr');
    const target: Verified = await verifiedAccount('balt');
    const rep = await api('POST', '/reports', {
      token: reporter.token,
      body: { targetType: 'user', targetId: target.userId, reasonCategory: 'spam_or_scam', reason: `b304 log ${RUN}` },
    });
    expect(rep.status).toBe(201);
    reportId = rep.body.id as string;
    expect((await api('PATCH', `/admin/moderation/reports/${reportId}`, { token: actioner.token, body: { action: 'user_suspended' } })).status).toBe(200);
    const appeal = await api('POST', `/admin/moderation/reports/${reportId}/appeal`, { token: recorder.token, body: { reason: `Recorded for the log ${RUN}` } });
    expect([200, 201]).toContain(appeal.status);

    // 2) A decided username review: revoke -> the person asks for a review -> a different admin reinstates.
    const owner: Verified = await verifiedAccount('balu');
    userId = owner.userId;
    const revoke = await api('POST', `/admin/users/${owner.userId}/username-revoke`, { token: actioner.token, body: { reason: REASON } });
    expect([200, 201]).toContain(revoke.status);
    const ask = await api('POST', '/users/me/username-review', { token: owner.token, body: { message: 'This was my own name.' } });
    expect([200, 201]).toContain(ask.status);
    const request = await db().usernameReviewRequest.findFirst({ where: { userId: owner.userId } });
    expect(request).toBeTruthy();
    const decide = await api('POST', `/admin/username-reviews/${request.id}/decide`, {
      token: reviewer.token,
      body: { decision: 'reinstate', reason: REASON },
    });
    expect(decide.status).toBe(200);
  });

  test('the rows exist under their raw keys (the API writes them), attributed to the right admins', async () => {
    const appeal = await db().adminActionLog.findFirst({ where: { action: 'report.appeal_recorded', targetId: reportId } });
    expect(appeal.adminId).toBe(recorder.id);
    const decided = await db().adminActionLog.findFirst({ where: { action: 'user.username_review_decided', targetId: userId } });
    expect(decided.adminId).toBe(reviewer.id);
  });

  test('Audit log (superadmin): both kinds are offered in the Action kind list by name, and their rows read as words, never as raw keys', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/activity`);
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    const kind = page.getByLabel('Action kind', { exact: true });
    await expect(kind.locator('option', { hasText: 'Appeal recorded' })).toHaveCount(1);
    await expect(kind.locator('option', { hasText: 'Username review decided' })).toHaveCount(1);

    const table = page.getByRole('table', { name: 'Audit log' });
    // Appeal recorded.
    await kind.selectOption({ label: 'Appeal recorded' });
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(table.getByRole('cell', { name: 'Appeal recorded' }).first()).toBeVisible();
    await expect(table).not.toContainText('report.appeal_recorded');

    // Username review decided.
    await kind.selectOption({ label: 'Username review decided' });
    await page.getByRole('button', { name: 'Apply filter' }).click();
    await expect(table.getByRole('cell', { name: 'Username review decided' }).first()).toBeVisible();
    await expect(table).not.toContainText('user.username_review_decided');
    await page.context().close();
  });

  test('My activity (the recorder and the reviewer): each sees their own row named in words', async ({ browser }) => {
    for (const [admin, label, raw] of [
      [recorder, 'Appeal recorded', 'report.appeal_recorded'],
      [reviewer, 'Username review decided', 'user.username_review_decided'],
    ] as const) {
      const page = await adminPageAs(browser, admin.token);
      await page.goto(`${URLS.admin}/activity`);
      await expect(page.getByRole('heading', { level: 1, name: 'My activity' })).toBeVisible();
      const table = page.getByRole('table', { name: 'My activity' });
      // exact: B-308 (PR #757) made the notes cell of an appeal row read "Appeal recorded, decision pending", which also contains the label.
      await expect(table.getByRole('cell', { name: label, exact: true })).toHaveCount(1);
      await expect(table).not.toContainText(raw);
      await page.context().close();
    }
  });
});
