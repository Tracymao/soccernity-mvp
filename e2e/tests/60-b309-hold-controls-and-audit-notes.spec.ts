import { test, expect } from '@playwright/test';
import { adminPage } from '../support/admin-ui';
import { adminPageAs, api, createQaAdmin, db, tagged, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-309 (c): B-308 (PR #757) in real Chrome against the real API, Postgres and Redis.
//   1. Report detail, message report whose thread involves a child: an admin who is NOT child-safety vetted is shown a line
//      instead of the hold controls; a vetted admin sees the controls; an adults-only message report shows them to the
//      unvetted admin too. (apps/admin ReportDetailPage.tsx holdControlsRestricted, holdActions.tsx HoldControlsRestrictedLine)
//   2. Audit log / My activity: the username-review and appeal rows read as sentences, never as 'key=value'.
//      (apps/admin api/adminActionLog.ts readableNotes, AuditLogPage.tsx)
// The server still refuses a hold from an unvetted admin (B-302); spec 55 covers that on the wire. This spec is about what
// the person SEES. Admins are moderators created in Postgres and used through locally signed tokens; the Audit log is read by
// the QA superadmin. Every person is a synthetic account.
test.use({ viewport: { width: 1440, height: 1300 } });

const RUN = Date.now().toString(36);
const REASON = 'A reason that is long enough for the audit record.';
const LINE = tagged('Holds on this report need a child-safety-vetted admin (Settings › Roles).');

test.describe.serial('hold controls on a child-involved message report, and readable audit notes', () => {
  let unvetted: QaAdmin;
  let vetted: QaAdmin;
  let recorder: QaAdmin;
  let reviewer: QaAdmin;
  let actioner: QaAdmin;
  let minor: Verified;
  let adult: Verified;
  let adult2: Verified;
  let childReport = '';
  let adultsReport = '';
  let appealReportId = '';
  let ownerUsername = '';
  let declinedName = '';
  let ownerId = '';

  async function messageReport(sender: Verified, other: Verified, reporter: Verified, label: string): Promise<string> {
    const conv = await api('POST', '/conversations', { token: sender.token, body: { recipientId: other.userId } });
    expect([200, 201]).toContain(conv.status);
    const msg = await api('POST', `/conversations/${conv.body.id}/messages`, { token: sender.token, body: { contentText: `b309 ${label} ${RUN}` } });
    expect([200, 201]).toContain(msg.status);
    const rep = await api('POST', '/reports', {
      token: reporter.token,
      body: { targetType: 'message', targetId: msg.body.id, reasonCategory: 'harassment_or_bullying' },
    });
    expect(rep.status).toBe(201);
    return rep.body.id as string;
  }

  test.beforeAll(async () => {
    unvetted = await createQaAdmin('moderator', `B309 Unvetted ${RUN}`);
    vetted = await createQaAdmin('moderator', `B309 Vetted ${RUN}`, { vetted: true });
    recorder = await createQaAdmin('moderator', `B309 Recorder ${RUN}`);
    reviewer = await createQaAdmin('moderator', `B309 Reviewer ${RUN}`);
    actioner = await createQaAdmin('moderator', `B309 Actioner ${RUN}`);
    minor = await verifiedAccount('b309cm', 17);
    adult = await verifiedAccount('b309ca');
    adult2 = await verifiedAccount('b309cb');

    // A thread with a child in it (the minor starts it: minor -> adult is allowed, adult -> minor is not).
    childReport = await messageReport(minor, adult, adult, 'child thread');
    // An adults-only thread.
    adultsReport = await messageReport(adult2, adult, adult, 'adults thread');
  });

  test('an admin who is not vetted: on a child-involved message report the line is shown and none of the three hold controls', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await expect(page.getByText('Context hidden: this involves a child.', { exact: false })).toBeVisible();
    await expect(page.getByText(LINE, { exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('hold-controls-restricted').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reporter acted in bad faith', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Legal hold', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Lift hold/ })).toHaveCount(0);
    await page.context().close();
  });

  test('a child-safety-vetted admin sees the controls on the same report, and no restricted line', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reporter acted in bad faith', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Legal hold', exact: true }).first()).toBeVisible();
    await expect(page.getByText(LINE, { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('hold-controls-restricted')).toHaveCount(0);
    await page.context().close();
  });

  test('an adults-only message report shows the controls to the admin who is not vetted', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${adultsReport}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reporter acted in bad faith', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Legal hold', exact: true }).first()).toBeVisible();
    await expect(page.getByText(LINE, { exact: true })).toHaveCount(0);
    await expect(page.getByText('Context hidden', { exact: false })).toHaveCount(0);
    await page.context().close();
  });

  test('an active hold is still shown to the admin who is not vetted, without a Lift hold control; the vetted admin has one', async ({ browser }) => {
    const place = await api('POST', `/admin/moderation/reports/${childReport}/holds/legal`, { token: vetted.token, body: { reason: REASON } });
    expect(place.status).toBe(201);
    expect(await db().accountHold.count({ where: { reportId: childReport, liftedAt: null } })).toBeGreaterThan(0);

    const hidden = await adminPageAs(browser, unvetted.token);
    await hidden.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await expect(hidden.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await expect(hidden.getByText(LINE, { exact: true }).first()).toBeVisible();
    await expect(hidden.getByText('Active since', { exact: false }).first()).toBeVisible();
    await expect(hidden.getByRole('button', { name: /^Lift hold/ })).toHaveCount(0);
    await hidden.context().close();

    const shown = await adminPageAs(browser, vetted.token);
    await shown.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await expect(shown.getByRole('button', { name: /^Lift hold/ }).first()).toBeVisible();
    await shown.context().close();
  });

  test('setup: a staff-recorded appeal and a decided username review are written by the real routes', async () => {
    // 1) report -> real suspension -> recorded appeal (the note stored is "pending").
    const reporter = await verifiedAccount('b309ar');
    const target = await verifiedAccount('b309at');
    const rep = await api('POST', '/reports', {
      token: reporter.token,
      body: { targetType: 'user', targetId: target.userId, reasonCategory: 'spam_or_scam', reason: `b309 appeal ${RUN}` },
    });
    expect(rep.status).toBe(201);
    appealReportId = rep.body.id as string;
    expect((await api('PATCH', `/admin/moderation/reports/${appealReportId}`, { token: actioner.token, body: { action: 'user_suspended' } })).status).toBe(200);
    const appeal = await api('POST', `/admin/moderation/reports/${appealReportId}/appeal`, { token: recorder.token, body: { reason: `Recorded ${RUN}` } });
    expect([200, 201]).toContain(appeal.status);

    // 2) username revoked -> the person asks for a review -> a different admin DECLINES it, and another is reinstated.
    const declined = await verifiedAccount('b309ud');
    const reinstated = await verifiedAccount('b309ur');
    ownerUsername = reinstated.username;
    ownerId = reinstated.userId;
    declinedName = declined.username;
    for (const [person, decision] of [[declined, 'decline'], [reinstated, 'reinstate']] as const) {
      expect([200, 201]).toContain((await api('POST', `/admin/users/${person.userId}/username-revoke`, { token: actioner.token, body: { reason: REASON } })).status);
      expect([200, 201]).toContain((await api('POST', '/users/me/username-review', { token: person.token, body: { message: 'This was my name.' } })).status);
      const request = await db().usernameReviewRequest.findFirst({ where: { userId: person.userId } });
      expect(request).toBeTruthy();
      const decided = await api('POST', `/admin/username-reviews/${request.id}/decide`, { token: reviewer.token, body: { decision, reason: REASON } });
      expect(decided.status).toBe(200);
    }
    expect(declinedName).toBeTruthy();
  });

  test('Audit log (superadmin): the username-review rows read as sentences with decision, username and reason, and no key=value text', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/activity`);
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible();
    await page.getByLabel('Action kind', { exact: true }).selectOption({ label: 'Username review decided' });
    await page.getByRole('button', { name: 'Apply filter' }).click();
    const table = page.getByRole('table', { name: 'Audit log' });

    await expect(table.getByRole('cell', { name: `Reinstated the username “${ownerUsername}”. Reason: ${REASON}`, exact: true })).toHaveCount(1);
    await expect(table.getByRole('cell', { name: `Declined the request to restore the username “${declinedName}”. Reason: ${REASON}`, exact: true })).toHaveCount(1);
    // No raw note string anywhere in this filtered table.
    const text = (await table.innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/\b(decision|username|reason)=/);
    expect(text).not.toContain('user.username_review_decided');
    await page.context().close();
  });

  test('Audit log (superadmin): the appeal row reads "Appeal recorded, decision pending", not the stored word', async ({ browser }) => {
    const page = await adminPage(browser);
    await page.goto(`${URLS.admin}/activity`);
    await page.getByLabel('Action kind', { exact: true }).selectOption({ label: 'Appeal recorded' });
    await page.getByRole('button', { name: 'Apply filter' }).click();
    const table = page.getByRole('table', { name: 'Audit log' });
    await expect(table.getByRole('cell', { name: 'Appeal recorded, decision pending', exact: true }).first()).toBeVisible();
    // The stored note is the single word "pending"; it must not appear as a cell of its own.
    await expect(table.getByRole('cell', { name: 'pending', exact: true })).toHaveCount(0);
    const text = (await table.innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/\b\w+=/);
    expect(text).not.toContain('report.appeal_recorded');
    await page.context().close();
  });

  test('My activity: each admin sees their own row as a sentence', async ({ browser }) => {
    const rec = await adminPageAs(browser, recorder.token);
    await rec.goto(`${URLS.admin}/activity`);
    await expect(rec.getByRole('heading', { level: 1, name: 'My activity' })).toBeVisible();
    const recTable = rec.getByRole('table', { name: 'My activity' });
    await expect(recTable.getByRole('cell', { name: 'Appeal recorded, decision pending', exact: true })).toHaveCount(1);
    await expect(recTable).not.toContainText('report.appeal_recorded');
    await rec.context().close();

    const rev = await adminPageAs(browser, reviewer.token);
    await rev.goto(`${URLS.admin}/activity`);
    const revTable = rev.getByRole('table', { name: 'My activity' });
    await expect(revTable.getByRole('cell', { name: `Reinstated the username “${ownerUsername}”. Reason: ${REASON}`, exact: true })).toHaveCount(1);
    const text = (await revTable.innerText()).replace(/\s+/g, ' ');
    expect(text).not.toMatch(/\b(decision|username|reason)=/);
    expect(ownerId).toBeTruthy();
    await rev.context().close();
  });
});
