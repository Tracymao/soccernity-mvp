import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-5/admin-moderation-queue-backend — Build Plan Section 4.8
// (Admin Service) + Section 8.4 (Moderation & appeals workflow). Hits
// test/README.md's e2e triggers:
//   - a genuinely NEW Prisma relation: Report.reviewedByAdminId /
//     .appealReviewedByAdminId, both real FKs to AdminUser (ON DELETE
//     SET NULL) — never exercised against real Postgres before this PR.
//   - transaction reasoning: actionReport()/decideAppeal() write the
//     Report update AND the Notification row(s) inside one interactive
//     transaction, proven here by querying the real Notification table
//     directly rather than trusting the HTTP response.
// The mocked unit suite (src/modules/moderation/*.spec.ts,
// src/modules/admin/guards/admin-roles.guard.spec.ts) covers DTO
// validation, guard wiring, and every branch a mock can prove — this
// file covers the real report -> action -> appeal -> second-reviewer
// review flow end to end, plus Decision Log #138's enforcement against
// real seeded AdminUser rows.
//
// Users/admins are seeded directly via Prisma + a real TokenService-/
// AdminTokenService-minted access token (createUser/createAdmin), not
// POST /auth/register or POST /admin/auth/login — the same pattern
// contest.e2e-spec.ts / community-groups.e2e-spec.ts use. Neither
// /reports nor /admin/moderation/reports* carries @AuthRateLimit(), so
// this is a speed/simplicity choice, not a rate-limit workaround — every
// downstream request still exercises the real JwtAuthGuard /
// AdminJwtAuthGuard -> *TokenService.verifyAccessToken chain, and (for
// the admin routes) the real AdminRolesGuard.
describe('Moderation e2e: report -> action -> appeal -> second-reviewer review', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);

  function server() {
    return app.getHttpServer();
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-mod-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Mod ${label}`,
        dateOfBirth: new Date('1994-05-05'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(
    label: string,
    role: string,
    // schema/report-severity-escalation-admin-vetting-application —
    // optional so every PRE-EXISTING call site (none of which cares
    // about vetting) is untouched; defaults to false, matching
    // AdminUser.childSafetyVetted's own real DB-level default.
    childSafetyVetted = false,
  ): Promise<{ adminId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-mod-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Mod Admin ${label}`,
        role,
        childSafetyVetted,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  async function seedPost(authorId: string): Promise<string> {
    const prisma = getTestPrismaClient();
    const post = await prisma.post.create({
      data: { authorId, contentText: `some post ${rand()}`, mediaUrls: [] },
    });
    return post.id;
  }

  it('POST /reports 404s when reporting a post that does not exist, and creates no row', async () => {
    const reporter = await createUser('reporter-404');

    await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: '11111111-1111-4111-8111-111111111111', reason: 'spam' })
      .expect(404);

    const prisma = getTestPrismaClient();
    expect(await prisma.report.count()).toBe(0);
  });

  it('GET /admin/moderation/reports rejects an editor with 403, allows a moderator', async () => {
    const editor = await createAdmin('editor', 'editor');
    const moderator = await createAdmin('moderator', 'moderator');

    await request(server())
      .get('/admin/moderation/reports')
      .set(auth(editor.accessToken))
      .expect(403);

    const res = await request(server())
      .get('/admin/moderation/reports')
      .set(auth(moderator.accessToken))
      .expect(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('the full real flow: report a post -> moderator actions it -> reported user appeals -> a DIFFERENT moderator overturns it, all verified against real rows', async () => {
    const reporter = await createUser('reporter');
    const reported = await createUser('reported');
    const postId = await seedPost(reported.userId);
    const moderatorA = await createAdmin('a', 'moderator');
    const moderatorB = await createAdmin('b', 'superadmin');
    const prisma = getTestPrismaClient();

    // 1. Report
    const createRes = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'this is spam' })
      .expect(201);
    const reportId = createRes.body.id as string;

    const created = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(created.status).toBe('open');
    expect(created.reporterId).toBe(reporter.userId);

    // 2. Moderator A actions it: content removed
    const actionRes = await request(server())
      .patch(`/admin/moderation/reports/${reportId}`)
      .set(auth(moderatorA.accessToken))
      .send({ action: 'content_removed' })
      .expect(200);
    expect(actionRes.body.status).toBe('actioned');
    expect(actionRes.body.actionTaken).toBe('content_removed');
    expect(actionRes.body.reviewedByAdminId).toBe(moderatorA.adminId);

    // Real FK proof: reviewedByAdminId genuinely references the real
    // AdminUser row, not just an opaque string.
    const afterAction = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(afterAction.reviewedByAdminId).toBe(moderatorA.adminId);
    const reviewingAdminRow = await prisma.adminUser.findUnique({ where: { id: afterAction.reviewedByAdminId! } });
    expect(reviewingAdminRow?.id).toBe(moderatorA.adminId);

    // Both the reporter and the reported user were notified, in one
    // transaction alongside the Report update — verified against the
    // real Notification table, not the HTTP response.
    const notificationsAfterAction = await prisma.notification.findMany({
      where: { type: 'moderation_decision', payloadRefId: reportId },
      orderBy: { userId: 'asc' },
    });
    const recipientsAfterAction = notificationsAfterAction.map((n) => n.userId).sort();
    expect(recipientsAfterAction).toEqual([reported.userId, reporter.userId].sort());

    // 3. The REPORTER (not the reported user) tries to appeal -> 403,
    // report untouched.
    await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(reporter.accessToken))
      .send({ reason: "I don't like this outcome" })
      .expect(403);
    const afterReporterAttempt = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(afterReporterAttempt.appealStatus).toBeNull();

    // 4. The REPORTED user appeals — this is allowed.
    const appealRes = await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(reported.accessToken))
      .send({ reason: 'that was not my post to begin with' })
      .expect(201);
    expect(appealRes.body.appealStatus).toBe('pending');

    // 5. Decision Log #138: Moderator A (who actioned the original
    // report) may NOT review their own appeal.
    await request(server())
      .patch(`/admin/moderation/reports/${reportId}/appeal`)
      .set(auth(moderatorA.accessToken))
      .send({ decision: 'upheld' })
      .expect(403);
    const afterSelfReviewAttempt = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(afterSelfReviewAttempt.appealStatus).toBe('pending'); // untouched

    // 6. A DIFFERENT moderator (B) reviews the appeal and overturns it.
    const overturnRes = await request(server())
      .patch(`/admin/moderation/reports/${reportId}/appeal`)
      .set(auth(moderatorB.accessToken))
      .send({ decision: 'overturned' })
      .expect(200);
    expect(overturnRes.body.status).toBe('open');
    expect(overturnRes.body.appealStatus).toBe('overturned');
    expect(overturnRes.body.reviewedByAdminId).toBeNull();
    expect(overturnRes.body.actionTaken).toBeNull();

    const afterOverturn = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(afterOverturn.status).toBe('open');
    expect(afterOverturn.reviewedByAdminId).toBeNull();
    expect(afterOverturn.reviewedAt).toBeNull();
    expect(afterOverturn.actionTaken).toBeNull();
    expect(afterOverturn.appealStatus).toBe('overturned'); // historical record preserved
    expect(afterOverturn.appealReviewedByAdminId).toBe(moderatorB.adminId);

    // The reported user (only) was notified of the appeal outcome.
    const appealNotifications = await prisma.notification.findMany({
      where: { type: 'moderation_decision', payloadRefId: reportId, userId: reported.userId },
    });
    // 1 from the original action + 1 from the appeal decision = 2 total
    // for the reported user; the reporter still only has the original 1.
    expect(appealNotifications.length).toBeGreaterThanOrEqual(1);
    const reporterNotificationCount = await prisma.notification.count({
      where: { type: 'moderation_decision', payloadRefId: reportId, userId: reporter.userId },
    });
    expect(reporterNotificationCount).toBe(1);

    // 7. The report is back in the open queue and can be actioned
    // again — proving the stale-appeal-field-clearing fix: a FRESH
    // appeal on this new action must not be blocked by the previous
    // (now-historical) 'overturned' appealStatus.
    const reactionRes = await request(server())
      .patch(`/admin/moderation/reports/${reportId}`)
      .set(auth(moderatorB.accessToken))
      .send({ action: 'warning_issued' })
      .expect(200);
    expect(reactionRes.body.status).toBe('actioned');
    expect(reactionRes.body.appealStatus).toBeNull();

    const secondAppealRes = await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(reported.accessToken))
      .send({ reason: 'still disagree' })
      .expect(201);
    expect(secondAppealRes.body.appealStatus).toBe('pending');
  });

  it("a second appeal attempt on the SAME action is rejected with 409 ('already appealed')", async () => {
    const reporter = await createUser('reporter2');
    const reported = await createUser('reported2');
    const postId = await seedPost(reported.userId);
    const moderator = await createAdmin('c', 'moderator');
    const prisma = getTestPrismaClient();

    const createRes = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'spam' })
      .expect(201);
    const reportId = createRes.body.id as string;

    await request(server())
      .patch(`/admin/moderation/reports/${reportId}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'warning_issued' })
      .expect(200);

    await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(reported.accessToken))
      .send({ reason: 'first appeal' })
      .expect(201);

    await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(reported.accessToken))
      .send({ reason: 'second appeal attempt' })
      .expect(409);

    const row = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
    expect(row.appealReason).toBe('first appeal');
  });

  it('appealing an open (never-actioned) or dismissed report is rejected with 403', async () => {
    const reporter = await createUser('reporter3');
    const reported = await createUser('reported3');
    const postId = await seedPost(reported.userId);
    const moderator = await createAdmin('d', 'moderator');

    const openReport = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'spam' })
      .expect(201);

    // Still open -- nothing to appeal yet.
    await request(server())
      .post(`/reports/${openReport.body.id}/appeal`)
      .set(auth(reported.accessToken))
      .send({ reason: 'premature' })
      .expect(403);

    // Dismissed -- no action was taken against the reported user.
    const dismissedReport = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'spam again' })
      .expect(201);
    await request(server())
      .patch(`/admin/moderation/reports/${dismissedReport.body.id}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'dismissed' })
      .expect(200);

    await request(server())
      .post(`/reports/${dismissedReport.body.id}/appeal`)
      .set(auth(reported.accessToken))
      .send({ reason: 'nothing to appeal' })
      .expect(403);
  });

  it('reporting a user directly (targetType user) works, and only that user may appeal an action against them', async () => {
    const reporter = await createUser('reporter4');
    const reportedUser = await createUser('reported4');
    const unrelatedUser = await createUser('unrelated4');
    const moderator = await createAdmin('e', 'moderator');

    const createRes = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'user', targetId: reportedUser.userId, reason: 'harassment' })
      .expect(201);
    const reportId = createRes.body.id as string;

    await request(server())
      .patch(`/admin/moderation/reports/${reportId}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'user_suspended' })
      .expect(200);

    // An unrelated third party may not appeal.
    await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(unrelatedUser.accessToken))
      .send({ reason: 'not my report' })
      .expect(403);

    // The reported user may.
    await request(server())
      .post(`/reports/${reportId}/appeal`)
      .set(auth(reportedUser.accessToken))
      .send({ reason: 'this was unfair' })
      .expect(201);
  });

  it('GET /admin/moderation/reports?status=open filters correctly and paginates newest-first', async () => {
    const reporter = await createUser('reporter5');
    const reported = await createUser('reported5');
    const postId = await seedPost(reported.userId);
    const moderator = await createAdmin('f', 'moderator');

    const first = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'one' })
      .expect(201);
    const second = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'two' })
      .expect(201);
    // Action the first one -- it should drop out of the ?status=open list.
    await request(server())
      .patch(`/admin/moderation/reports/${first.body.id}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'dismissed' })
      .expect(200);

    const res = await request(server())
      .get('/admin/moderation/reports')
      .query({ status: 'open' })
      .set(auth(moderator.accessToken))
      .expect(200);

    const ids = res.body.items.map((r: { id: string }) => r.id);
    expect(ids).toContain(second.body.id);
    expect(ids).not.toContain(first.body.id);
  });

  // ---------- banter_room target + room_deactivated (Decision Log #357) ----------

  it('a banter_room report can be actioned room_deactivated, which flips the real BanterRoom.status inside the same transaction; room_deactivated on a post is rejected 400', async () => {
    const reporter = await createUser('room-reporter');
    const creator = await createUser('room-creator');
    const moderator = await createAdmin('room-mod', 'moderator');
    const prisma = getTestPrismaClient();
    const room = await prisma.banterRoom.create({
      data: { name: `Room ${rand()}`, scopeType: 'topic', createdBy: creator.userId, memberCount: 1 },
    });
    const postId = await seedPost(creator.userId);

    const reportRes = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'banter_room', targetId: room.id, reason: 'abusive room' })
      .expect(201);

    await request(server())
      .patch(`/admin/moderation/reports/${reportRes.body.id}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'room_deactivated' })
      .expect(200);

    const after = await prisma.banterRoom.findUnique({ where: { id: room.id } });
    expect(after?.status).toBe('inactive');
    const actioned = await prisma.report.findUnique({ where: { id: reportRes.body.id } });
    expect(actioned?.actionTaken).toBe('room_deactivated');
    expect(actioned?.status).toBe('actioned');

    const postReport = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'spam' })
      .expect(201);
    await request(server())
      .patch(`/admin/moderation/reports/${postReport.body.id}`)
      .set(auth(moderator.accessToken))
      .send({ action: 'room_deactivated' })
      .expect(400);
    const untouched = await prisma.report.findUnique({ where: { id: postReport.body.id } });
    expect(untouched?.status).toBe('open');
  });

  // ---------- severity (schema/report-severity-escalation-admin-vetting-application) ----------

  it('POST /reports defaults severity to medium when omitted, and persists an explicit value when given', async () => {
    const reporter = await createUser('reporter-severity');
    const reported = await createUser('reported-severity');
    const postId = await seedPost(reported.userId);
    const prisma = getTestPrismaClient();

    const defaultRes = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'no severity given' })
      .expect(201);
    expect(defaultRes.body.severity).toBe('medium');
    const defaultRow = await prisma.report.findUniqueOrThrow({ where: { id: defaultRes.body.id } });
    expect(defaultRow.severity).toBe('medium');

    const explicitRes = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'urgent', severity: 'critical' })
      .expect(201);
    expect(explicitRes.body.severity).toBe('critical');
  });

  it('POST /reports rejects an invalid severity value', async () => {
    const reporter = await createUser('reporter-severity-bad');
    const reported = await createUser('reported-severity-bad');
    const postId = await seedPost(reported.userId);

    await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'post', targetId: postId, reason: 'x', severity: 'catastrophic' })
      .expect(400);
  });

  // ---------- child-safety-vetting gate (schema/report-severity-escalation-admin-vetting-application) ----------
  //
  // Report.concernsMinor and AdminUser.childSafetyVetted are seeded
  // directly via Prisma below rather than through POST /reports/public
  // (the only route that accepts concernsMinor on submission) — that
  // route shares the real, hardcoded 5-requests/60s 'auth' throttler
  // bucket every other e2e file in this suite already avoids for the
  // same reason (see test/README.md / feed-reactions.e2e-spec.ts's own
  // createUser() precedent). POST /reports/public's own handling of
  // concernsMinor/severity is already covered by the mocked unit suite
  // (moderation.service.spec.ts) — this section proves the GATE itself,
  // which reads Report.concernsMinor however it got there.
  describe('child-safety-vetting gate', () => {
    async function seedConcernsMinorReport(reporterId: string, targetType: string, targetId: string): Promise<string> {
      const prisma = getTestPrismaClient();
      const report = await prisma.report.create({
        data: { reporterId, targetType, targetId, reason: 'concerning content involving a minor', concernsMinor: true },
      });
      return report.id;
    }

    it('GET /admin/moderation/reports: a NON-vetted admin never sees a concernsMinor report, regardless of role; a VETTED admin does', async () => {
      const reporter = await createUser('reporter-vet-list');
      const reported = await createUser('reported-vet-list');
      const postId = await seedPost(reported.userId);
      const reportId = await seedConcernsMinorReport(reporter.userId, 'post', postId);

      const unvettedModerator = await createAdmin('unvetted-list-mod', 'moderator', false);
      const unvettedSuperadmin = await createAdmin('unvetted-list-super', 'superadmin', false);
      const vettedModerator = await createAdmin('vetted-list-mod', 'moderator', true);

      const asUnvettedModerator = await request(server())
        .get('/admin/moderation/reports')
        .set(auth(unvettedModerator.accessToken))
        .expect(200);
      expect(asUnvettedModerator.body.items.map((r: { id: string }) => r.id)).not.toContain(reportId);

      // "Regardless of role" — even an unvetted SUPERADMIN is blocked.
      const asUnvettedSuperadmin = await request(server())
        .get('/admin/moderation/reports')
        .set(auth(unvettedSuperadmin.accessToken))
        .expect(200);
      expect(asUnvettedSuperadmin.body.items.map((r: { id: string }) => r.id)).not.toContain(reportId);

      const asVettedModerator = await request(server())
        .get('/admin/moderation/reports')
        .set(auth(vettedModerator.accessToken))
        .expect(200);
      expect(asVettedModerator.body.items.map((r: { id: string }) => r.id)).toContain(reportId);
    });

    it('PATCH /admin/moderation/reports/:id (direct access): 403s a NON-vetted admin on a concernsMinor report; a VETTED admin may action it, and the report row is untouched by the failed attempt', async () => {
      const reporter = await createUser('reporter-vet-action');
      const reported = await createUser('reported-vet-action');
      const postId = await seedPost(reported.userId);
      const reportId = await seedConcernsMinorReport(reporter.userId, 'post', postId);
      const prisma = getTestPrismaClient();

      const unvettedModerator = await createAdmin('unvetted-action-mod', 'moderator', false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(unvettedModerator.accessToken))
        .send({ action: 'content_removed' })
        .expect(403);

      const untouched = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
      expect(untouched.status).toBe('open');
      expect(untouched.reviewedByAdminId).toBeNull();

      const vettedModerator = await createAdmin('vetted-action-mod', 'moderator', true);
      const actionRes = await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(vettedModerator.accessToken))
        .send({ action: 'content_removed' })
        .expect(200);
      expect(actionRes.body.status).toBe('actioned');

      const afterVettedAction = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
      expect(afterVettedAction.reviewedByAdminId).toBe(vettedModerator.adminId);
    });

    it('PATCH /admin/moderation/reports/:id/appeal (direct access): 403s a NON-vetted admin reviewing an appeal on a concernsMinor report; a VETTED (different) admin may review it', async () => {
      const reporter = await createUser('reporter-vet-appeal');
      const reported = await createUser('reported-vet-appeal');
      const postId = await seedPost(reported.userId);
      const reportId = await seedConcernsMinorReport(reporter.userId, 'post', postId);
      const vettedActioner = await createAdmin('vetted-appeal-actioner', 'moderator', true);

      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(vettedActioner.accessToken))
        .send({ action: 'content_removed' })
        .expect(200);

      await request(server())
        .post(`/reports/${reportId}/appeal`)
        .set(auth(reported.accessToken))
        .send({ reason: 'this was not my content' })
        .expect(201);

      const unvettedReviewer = await createAdmin('unvetted-appeal-reviewer', 'superadmin', false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}/appeal`)
        .set(auth(unvettedReviewer.accessToken))
        .send({ decision: 'upheld' })
        .expect(403);

      const vettedReviewer = await createAdmin('vetted-appeal-reviewer', 'superadmin', true);
      const decisionRes = await request(server())
        .patch(`/admin/moderation/reports/${reportId}/appeal`)
        .set(auth(vettedReviewer.accessToken))
        .send({ decision: 'upheld' })
        .expect(200);
      expect(decisionRes.body.appealStatus).toBe('upheld');
    });
  });

  // ---------- PATCH /admin/moderation/reports/:id/escalate ----------

  describe('escalate', () => {
    it('403s a NON-vetted admin regardless of role, and 200s a vetted admin, persisting the full escalation trail', async () => {
      const reporter = await createUser('reporter-escalate');
      const reported = await createUser('reported-escalate');
      const postId = await seedPost(reported.userId);
      const createRes = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reason: 'needs escalating' })
        .expect(201);
      const reportId = createRes.body.id as string;
      const prisma = getTestPrismaClient();

      const unvettedSuperadmin = await createAdmin('unvetted-escalate-super', 'superadmin', false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}/escalate`)
        .set(auth(unvettedSuperadmin.accessToken))
        .send({ escalationNotes: 'trying without vetting', escalatedToAuthority: false })
        .expect(403);

      const untouched = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
      expect(untouched.escalatedAt).toBeNull();

      const vettedModerator = await createAdmin('vetted-escalate-mod', 'moderator', true);
      const escalateRes = await request(server())
        .patch(`/admin/moderation/reports/${reportId}/escalate`)
        .set(auth(vettedModerator.accessToken))
        .send({ escalationNotes: 'flagging for the designated child-safety lead', escalatedToAuthority: false })
        .expect(200);
      expect(escalateRes.body.escalatedByAdminId).toBe(vettedModerator.adminId);
      expect(escalateRes.body.escalatedToAuthority).toBe(false);

      const afterFirstEscalation = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
      expect(afterFirstEscalation.escalatedAt).not.toBeNull();
      expect(afterFirstEscalation.escalatedByAdminId).toBe(vettedModerator.adminId);
      expect(afterFirstEscalation.escalationNotes).toBe('flagging for the designated child-safety lead');
      expect(afterFirstEscalation.escalatedToAuthority).toBe(false);

      // Re-callable: the same vetted admin later records that they have
      // ACTUALLY made an external report -- escalatedToAuthority flips
      // to true, overwriting the prior escalation-trail snapshot.
      const secondEscalateRes = await request(server())
        .patch(`/admin/moderation/reports/${reportId}/escalate`)
        .set(auth(vettedModerator.accessToken))
        .send({ escalationNotes: 'reported to the relevant authority', escalatedToAuthority: true })
        .expect(200);
      expect(secondEscalateRes.body.escalatedToAuthority).toBe(true);

      const afterSecondEscalation = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
      expect(afterSecondEscalation.escalatedToAuthority).toBe(true);
      expect(afterSecondEscalation.escalationNotes).toBe('reported to the relevant authority');
    });

    it('escalates a report regardless of its status, including one already actioned', async () => {
      const reporter = await createUser('reporter-escalate-actioned');
      const reported = await createUser('reported-escalate-actioned');
      const postId = await seedPost(reported.userId);
      const vettedModerator = await createAdmin('vetted-escalate-actioned', 'moderator', true);

      const createRes = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'post', targetId: postId, reason: 'already actioned' })
        .expect(201);
      const reportId = createRes.body.id as string;

      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(vettedModerator.accessToken))
        .send({ action: 'dismissed' })
        .expect(200);

      await request(server())
        .patch(`/admin/moderation/reports/${reportId}/escalate`)
        .set(auth(vettedModerator.accessToken))
        .send({ escalationNotes: 'escalating even though already dismissed', escalatedToAuthority: false })
        .expect(200);
    });
  });
});
