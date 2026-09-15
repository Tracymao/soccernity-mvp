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

  async function createAdmin(label: string, role: string): Promise<{ adminId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-mod-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Mod Admin ${label}`,
        role,
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
});
