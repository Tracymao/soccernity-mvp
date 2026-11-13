import { randomUUID } from 'crypto';
import { test, expect } from '@playwright/test';
import { adminPageAs, api, createQaAdmin, db, tagged, verifiedAccount, type QaAdmin, type Verified } from '../support/helpers';
import { URLS } from '../support/stack';

// B-304 (d): hidden message context (B-293, Decision Log #486) and the child-safety vetting rule on the routes that
// ACT on a message report (B-297, Decision Log #491) and on the three hold routes (B-302, #498, #499), in real Chrome
// against the real API, Postgres and Redis.
//   web UI     : apps/admin/src/pages/moderation/ContextMessagesCard.tsx (CONTEXT_HIDDEN_MESSAGE), ReportedMessageFields.tsx,
//                moderationShared.tsx (VettingRestrictedNotice), ReportDetailPage.tsx, holdActions.tsx
//   server rule: moderation.service.ts assertVettedToActOn; moderation-holds.service.ts
// A "minor in the thread" report is made with reasonCategory harassment_or_bullying, which does NOT set concernsMinor,
// so what gates the unvetted moderator is the thread-involves-a-child rule itself, not the report flag.
// Admins are two moderators created in Postgres (one vetted, one not) and used through locally signed tokens.
test.use({ viewport: { width: 1440, height: 1300 } });

const RUN = Date.now().toString(36);
const RESTRICTED = 'Restricted — child-safety vetting required';
const REASON = 'A reason that is long enough for the audit record.';

test.describe.serial('hidden message context and the vetting rule', () => {
  let unvetted: QaAdmin;
  let vetted: QaAdmin;
  let minor: Verified; // 17, guardian confirmed
  let adult: Verified; // reports
  let adult2: Verified; // sender in the adults-only control thread
  const T = {
    first: `minor-first ${RUN}: see you at training`,
    originalOfEdited: `minor-second ORIGINAL ${RUN}: you are rubbish`,
    edited: `minor-second EDITED ${RUN}: sorry, that was unkind`,
    reply: `adult-reply ${RUN}: please stop`,
    third: `minor-third ${RUN}: ok`,
  };
  let childReport = '';
  let childMsg = '';
  let holdIds: string[] = [];

  test.beforeAll(async () => {
    unvetted = await createQaAdmin('moderator', `B304 Unvetted ${RUN}`);
    vetted = await createQaAdmin('moderator', `B304 Vetted ${RUN}`, { vetted: true });
    minor = await verifiedAccount('bcm', 17);
    adult = await verifiedAccount('bca');
    adult2 = await verifiedAccount('bcb');
    expect((await db().user.findUnique({ where: { id: minor.userId } })).isMinor).toBe(true);

    // A thread with a child in it: the minor starts it (minor -> adult is allowed; adult -> minor is not, #347).
    const conv = await api('POST', '/conversations', { token: minor.token, body: { recipientId: adult.userId } });
    expect([200, 201]).toContain(conv.status);
    const cid = conv.body.id as string;
    const send = async (token: string, text: string) => {
      const r = await api('POST', `/conversations/${cid}/messages`, { token, body: { contentText: text } });
      expect([200, 201]).toContain(r.status);
      return r.body.id as string;
    };
    const m1 = await send(minor.token, T.first);
    childMsg = await send(minor.token, T.originalOfEdited);
    const a1 = await send(adult.token, T.reply);
    const m3 = await send(minor.token, T.third);
    const edit = await api('PATCH', `/conversations/${cid}/messages/${childMsg}`, { token: minor.token, body: { contentText: T.edited } });
    expect(edit.status).toBe(200);

    const rep = await api('POST', '/reports', {
      token: adult.token,
      body: { targetType: 'message', targetId: childMsg, reasonCategory: 'harassment_or_bullying', contextMessageIds: [m1, a1, m3] },
    });
    expect(rep.status).toBe(201);
    childReport = rep.body.id as string;
    const row = await db().report.findUnique({ where: { id: childReport } });
    expect(row.concernsMinor).toBe(false); // the gate below is the thread rule, not the flag
    expect(await db().reportContextMessage.count({ where: { reportId: childReport } })).toBe(3);
  });

  test('an admin who is not vetted sees the reported message, "Context hidden: this involves a child.", and no context or original text', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();

    await expect(page.getByText(tagged('Context hidden: this involves a child.'), { exact: true })).toBeVisible();
    // The reported message itself is shown, as it reads now, and that it was edited.
    await expect(page.getByText('Message text (current)')).toBeVisible();
    await expect(page.getByText(T.edited)).toBeVisible();
    await expect(page.locator('.mod-field', { hasText: 'Edited' }).first()).toBeVisible();
    // Nothing else from the chat, and not the text before the edit.
    for (const hidden of [T.first, T.reply, T.third, T.originalOfEdited]) await expect(page.getByText(hidden)).toHaveCount(0);
    await expect(page.getByText('Original text (before the edit)')).toHaveCount(0);
    await expect(page.getByText('Messages the reporter did not choose')).toHaveCount(0);
    // The page does not claim the reporter added nothing (that would be untrue).
    await expect(page.getByText('The reporter did not add any messages from the chat.')).toHaveCount(0);

    // The same on the wire.
    const res = await api('GET', `/admin/moderation/reports/${childReport}`, { token: unvetted.token });
    expect(res.status).toBe(200);
    expect(res.body.contextHidden).toBe(true);
    expect(res.body.contextMessages).toEqual([]);
    expect(res.body.reportedMessage.originalContentText).toBeNull();
    expect(res.body.reportedMessage.contentText).toBe(T.edited);
    await page.context().close();
  });

  test('a child-safety-vetted admin sees the context and the original text on the same report', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await expect(page.getByText('Context hidden', { exact: false })).toHaveCount(0);
    await expect(page.getByText('Original text (before the edit)')).toBeVisible();
    await expect(page.getByText(T.originalOfEdited).first()).toBeVisible();
    const card = page.locator('.mod-card', { hasText: 'Messages around the reported one' });
    for (const shown of [T.first, T.reply, T.third]) await expect(card.getByText(shown)).toBeVisible();
    await expect(card.getByText('Reported message')).toBeVisible();

    const res = await api('GET', `/admin/moderation/reports/${childReport}`, { token: vetted.token });
    expect(res.body.contextHidden).toBe(false);
    expect(res.body.contextMessages).toHaveLength(3);
    expect(res.body.reportedMessage.originalContentText).toBe(T.originalOfEdited);
    await page.context().close();
  });

  test('B-297: the admin who is not vetted is refused on Dismiss Report (restricted panel) and the real route answers the coded 403', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await page.getByRole('button', { name: 'Dismiss Report', exact: true }).click();
    await expect(page.getByRole('heading', { name: RESTRICTED })).toBeVisible();
    await expect(page.getByText('The server rejected it — nothing was changed.', { exact: false })).toBeVisible();

    const res = await api('PATCH', `/admin/moderation/reports/${childReport}`, { token: unvetted.token, body: { action: 'dismissed' } });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('child_safety_vetting_required');
    const row = await db().report.findUnique({ where: { id: childReport } });
    expect(row.status).toBe('open');
    expect(row.actionTaken).toBeNull();
    expect(await db().adminActionLog.count({ where: { action: 'report.actioned', targetId: childReport } })).toBe(0);
    await page.context().close();
  });

  test('B-302: placing a bad-faith or legal hold is refused for the admin who is not vetted (coded 403, UI panel), and nothing is written', async ({ browser }) => {
    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await page.getByRole('button', { name: 'Legal hold', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Legal hold' });
    await dialog.getByRole('textbox').fill(REASON);
    await dialog.getByRole('button', { name: 'Place legal hold' }).click();
    await expect(page.getByRole('heading', { name: RESTRICTED })).toBeVisible();

    for (const kind of ['bad-faith', 'legal']) {
      const res = await api('POST', `/admin/moderation/reports/${childReport}/holds/${kind}`, { token: unvetted.token, body: { reason: REASON } });
      expect(res.status, `${kind} hold`).toBe(403);
      expect(res.body.code).toBe('child_safety_vetting_required');
    }
    expect(await db().accountHold.count({ where: { reportId: childReport } })).toBe(0);
    expect(await db().adminActionLog.count({ where: { action: { startsWith: 'account_hold.' }, notes: { contains: childReport } } })).toBe(0);
    await page.context().close();
  });

  test('B-302: a vetted admin places the hold; the unvetted admin cannot lift it; once the report is purged (reportId NULL) any moderator can (Decision Log #499)', async () => {
    const place = await api('POST', `/admin/moderation/reports/${childReport}/holds/legal`, { token: vetted.token, body: { reason: REASON } });
    expect(place.status).toBe(201);
    holdIds = (place.body.holds as Array<{ id: string }>).map((h) => h.id);
    expect(holdIds.length).toBeGreaterThan(0);
    const [holdId] = holdIds;

    // Refused, and the hold is still active.
    const refused = await api('PATCH', `/admin/moderation/holds/${holdId}/lift`, { token: unvetted.token, body: { reason: REASON } });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('child_safety_vetting_required');
    expect((await db().accountHold.findUnique({ where: { id: holdId } })).liftedAt).toBeNull();

    // The retention sweep detaches a hold from a purged report by writing reportId = NULL (Decision Log #493 (a)).
    // The report row is not really deleted here (the thread is the thing under test); the NULL link is the same
    // write the sweep makes, and it is what the lift route reads.
    await db().accountHold.update({ where: { id: holdId }, data: { reportId: null } });
    const lifted = await api('PATCH', `/admin/moderation/holds/${holdId}/lift`, { token: unvetted.token, body: { reason: REASON } });
    expect(lifted.status).toBe(200);
    expect((await db().accountHold.findUnique({ where: { id: holdId } })).liftedAt).not.toBeNull();
  });

  test('404 comes first for a missing report or hold, whoever asks', async () => {
    const missing = randomUUID();
    for (const token of [unvetted.token, vetted.token]) {
      expect((await api('PATCH', `/admin/moderation/reports/${missing}`, { token, body: { action: 'dismissed' } })).status).toBe(404);
      expect((await api('POST', `/admin/moderation/reports/${missing}/holds/bad-faith`, { token, body: { reason: REASON } })).status).toBe(404);
      expect((await api('POST', `/admin/moderation/reports/${missing}/holds/legal`, { token, body: { reason: REASON } })).status).toBe(404);
      expect((await api('PATCH', `/admin/moderation/holds/${missing}/lift`, { token, body: { reason: REASON } })).status).toBe(404);
    }
  });

  test('a vetted admin is not blocked: Dismiss Report works in the UI on the same report', async ({ browser }) => {
    const page = await adminPageAs(browser, vetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${childReport}`);
    await page.getByRole('button', { name: 'Dismiss Report', exact: true }).click();
    await expect(page).toHaveURL(`${URLS.admin}/moderation`);
    const row = await db().report.findUnique({ where: { id: childReport } });
    // Dismiss maps onto the existing status enum: dismissed -> 'reviewed' (moderation.service.ts:1044).
    expect(row.status).toBe('reviewed');
    expect(row.actionTaken).toBe('dismissed');
    expect(row.reviewedByAdminId).toBe(vetted.id);
    await page.context().close();
  });

  test('control: an adults-only thread shows its context to the unvetted admin and lets them act', async ({ browser }) => {
    const conv = await api('POST', '/conversations', { token: adult2.token, body: { recipientId: adult.userId } });
    expect([200, 201]).toContain(conv.status);
    const cid = conv.body.id as string;
    const text = `adults-only context ${RUN}`;
    const c1 = (await api('POST', `/conversations/${cid}/messages`, { token: adult2.token, body: { contentText: text } })).body.id as string;
    const m = (await api('POST', `/conversations/${cid}/messages`, { token: adult2.token, body: { contentText: `adults-only reported ${RUN}` } })).body.id as string;
    const rep = await api('POST', '/reports', {
      token: adult.token,
      body: { targetType: 'message', targetId: m, reasonCategory: 'spam_or_scam', contextMessageIds: [c1] },
    });
    expect(rep.status).toBe(201);

    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${rep.body.id}`);
    await expect(page.getByRole('heading', { name: /^Report #/ })).toBeVisible();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText('Context hidden', { exact: false })).toHaveCount(0);
    await page.context().close();

    const act = await api('PATCH', `/admin/moderation/reports/${rep.body.id}`, { token: unvetted.token, body: { action: 'dismissed' } });
    expect(act.status).toBe(200);
  });

  test('fail closed: a report whose Message row is gone is refused for the unvetted admin and allowed for the vetted one', async ({ browser }) => {
    const conv = await api('POST', '/conversations', { token: minor.token, body: { recipientId: adult2.userId } });
    expect([200, 201]).toContain(conv.status);
    const cid = conv.body.id as string;
    const gone = (await api('POST', `/conversations/${cid}/messages`, { token: minor.token, body: { contentText: `gone ${RUN}` } })).body.id as string;
    const rep = await api('POST', '/reports', {
      token: adult2.token,
      body: { targetType: 'message', targetId: gone, reasonCategory: 'spam_or_scam' },
    });
    expect(rep.status).toBe(201);
    const reportId = rep.body.id as string;
    // Nothing in the product removes a Message row; here it is removed directly so the server cannot tell who was in the chat.
    await db().message.delete({ where: { id: gone } });

    const page = await adminPageAs(browser, unvetted.token);
    await page.goto(`${URLS.admin}/moderation/reports/${reportId}`);
    await expect(page.getByText('The reported message is no longer available.')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss Report', exact: true }).click();
    await expect(page.getByRole('heading', { name: RESTRICTED })).toBeVisible();
    await page.context().close();

    const refused = await api('PATCH', `/admin/moderation/reports/${reportId}`, { token: unvetted.token, body: { action: 'dismissed' } });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('child_safety_vetting_required');
    expect((await db().report.findUnique({ where: { id: reportId } })).status).toBe('open');

    const allowed = await api('PATCH', `/admin/moderation/reports/${reportId}`, { token: vetted.token, body: { action: 'dismissed' } });
    expect(allowed.status).toBe(200);
    expect((await db().report.findUnique({ where: { id: reportId } })).status).toBe('reviewed');
  });
});
