import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS } from '../admin-action-log/admin-action-log.constants';
import { HoldService } from '../account-hold/hold.service';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminModerationController } from './admin-moderation.controller';
import { ModerationHoldsService } from './moderation-holds.service';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from './moderation.constants';
import { ModerationService } from './moderation.service';

// backend/w6-hold-admin-endpoints (B-045; Decision Log #376, #398 D1, #403 item 8). The three hold routes at the
// real HTTP layer: the REAL AdminRolesGuard, the REAL global ValidationPipe, the REAL ModerationHoldsService and
// the REAL HoldService over a fake Prisma (the same shape hold.service.spec.ts uses). Only AdminJwtAuthGuard is
// replaced, by a stand-in that refuses (401) when nobody is signed in, so "unauthenticated" is a real case here.
// The real database constraints are proven in test/moderation-holds.e2e-spec.ts.
// B-302 (Decision Log #498, #499): ModerationHoldsService reuses ModerationService.assertVettedToActOn. The stand-in
// ModerationService below delegates THAT one method to a real ModerationService over the same fake Prisma, so the
// message-thread rule (B-297) is exercised for real on the three hold routes; everything else on it stays a mock.

const REASON = 'Evidence preserved for the regulator.';
const HOLD_ROW = {
  id: 'hold-1',
  userId: 'rep-1',
  type: 'legal_hold',
  reportId: 'r1',
  placedByAdminId: 'admin-9',
  placeReason: 'internal reason text',
  placedAt: new Date('2030-01-01T00:00:00.000Z'),
  expiresAt: null as Date | null,
  liftedAt: null as Date | null,
  liftedByAdminId: null,
  liftReason: null,
};

function buildPrisma() {
  const prisma = {
    report: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    post: { findUnique: jest.fn() },
    comment: { findUnique: jest.fn() },
    banterRoom: { findUnique: jest.fn() },
    grassrootsTeam: { findUnique: jest.fn() },
    fixture: { findUnique: jest.fn() },
    adminUser: { findUnique: jest.fn() },
    message: { findUnique: jest.fn() },
    accountHold: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...HOLD_ROW, id: `hold-${data.userId}`, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    adminActionLog: { create: jest.fn().mockResolvedValue({}) },
    // Present only so the test can prove nothing is written to them: a hold notifies nobody.
    notification: { create: jest.fn(), createMany: jest.fn() },
  };
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

describe('Admin hold routes (HTTP layer)', () => {
  let app: INestApplication;
  let prisma: ReturnType<typeof buildPrisma>;
  let currentAdmin: { sub: string; role: string; aud: string } | null;
  const moderationService = { getReportById: jest.fn(), assertVettedToActOn: jest.fn() };

  const asModerator = () => (currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' });

  beforeEach(async () => {
    prisma = buildPrisma();
    const realModeration = new ModerationService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    moderationService.assertVettedToActOn.mockImplementation((report: never, adminId: string) =>
      realModeration.assertVettedToActOn(report, adminId),
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminModerationController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: ModerationService, useValue: moderationService },
        HoldService,
        ModerationHoldsService,
        AdminRolesGuard,
      ],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentAdmin) throw new UnauthorizedException();
          context.switchToHttp().getRequest().admin = currentAdmin;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    asModerator();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  // A report by a signed-in reporter about a post whose author is the reported user.
  function seedReport(over: Record<string, unknown> = {}) {
    prisma.report.findUnique.mockImplementation(async ({ select }: { select?: Record<string, boolean> }) => {
      const row = { id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1', concernsMinor: false, ...over };
      return select && 'concernsMinor' in select && Object.keys(select).length === 1 ? { concernsMinor: row.concernsMinor } : row;
    });
    prisma.post.findUnique.mockResolvedValue({ authorId: 'subject-1' });
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, accountStatus: 'active' }));
  }

  const routes: Array<{ name: string; method: 'post' | 'patch'; url: string }> = [
    { name: 'place bad-faith', method: 'post', url: '/admin/moderation/reports/r1/holds/bad-faith' },
    { name: 'place legal hold', method: 'post', url: '/admin/moderation/reports/r1/holds/legal' },
    { name: 'lift', method: 'patch', url: '/admin/moderation/holds/hold-1/lift' },
  ];

  describe.each(routes)('$name: guards', ({ method, url }) => {
    it('is 401 when nobody is signed in, and touches nothing', async () => {
      currentAdmin = null;
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(401);
      expect(prisma.report.findUnique).not.toHaveBeenCalled();
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    });

    it('is 403 for an editor, and touches nothing', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(403);
      expect(prisma.report.findUnique).not.toHaveBeenCalled();
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
    });
  });

  describe.each(routes)('$name: reason bounds', ({ method, url }) => {
    it.each([
      ['missing', undefined],
      ['9 characters', 'x'.repeat(9)],
      ['501 characters', 'x'.repeat(501)],
      ['not a string', 12345678901],
    ])('rejects a reason that is %s with 400 and writes nothing', async (_label, reason) => {
      const body = reason === undefined ? {} : { reason };
      await request(app.getHttpServer())[method](url).send(body).expect(400);
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
      expect(prisma.accountHold.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown extra field (whitelist) with 400', async () => {
      await request(app.getHttpServer())[method](url).send({ reason: REASON, notifyUser: true }).expect(400);
    });

    it('rejects a reason that is only spaces with the coded 400, writing nothing', async () => {
      // 404 is settled first, so the report and the hold must exist for the reason check to be reached.
      seedReport();
      prisma.accountHold.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? { id: 'hold-1', report: { concernsMinor: false } } : { ...HOLD_ROW },
      );
      const res = await request(app.getHttpServer())[method](url).send({ reason: ' '.repeat(12) }).expect(400);
      expect(res.body.code).toBe('hold_reason_invalid');
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    });
  });

  describe('exact reason bounds are accepted (10 and 500 characters)', () => {
    it.each([10, 500])('place bad-faith accepts %i characters', async (len) => {
      seedReport();
      await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/bad-faith')
        .send({ reason: 'x'.repeat(len) })
        .expect(201);
    });
  });

  describe('POST /admin/moderation/reports/:id/holds/bad-faith', () => {
    it('holds the reporter, answers 201 with the hold view, writes one audit row and notifies nobody', async () => {
      seedReport();

      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/bad-faith')
        .send({ reason: REASON })
        .expect(201);

      expect(res.body.holds).toHaveLength(1);
      expect(res.body.holds[0]).toEqual({
        id: 'hold-rep-1',
        userId: 'rep-1',
        type: 'bad_faith',
        reportId: 'r1',
        placedBy: 'admin-1',
        placedAt: expect.any(String),
        expiresAt: expect.any(String),
        liftedAt: null,
      });
      // The reason and the lifter fields are not part of the view.
      expect(JSON.stringify(res.body)).not.toContain(REASON);
      expect(prisma.adminActionLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          adminId: 'admin-1',
          action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_BAD_FAITH_PLACED,
          targetId: 'rep-1',
        }),
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('works for a superadmin too', async () => {
      seedReport();
      currentAdmin = { sub: 'admin-2', role: 'superadmin', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/moderation/reports/r1/holds/bad-faith').send({ reason: REASON }).expect(201);
    });

    it('is the same route whatever the appeal state of the report (Appeal Review reuses it)', async () => {
      seedReport({ status: 'actioned', appealStatus: 'pending' });
      await request(app.getHttpServer()).post('/admin/moderation/reports/r1/holds/bad-faith').send({ reason: REASON }).expect(201);
    });

    it('404 when the report does not exist', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await request(app.getHttpServer()).post('/admin/moderation/reports/nope/holds/bad-faith').send({ reason: REASON }).expect(404);
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
    });

    it('409 reporter_has_no_account for a public report', async () => {
      seedReport({ reporterId: null });
      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/bad-faith')
        .send({ reason: REASON })
        .expect(409);
      expect(res.body.code).toBe('reporter_has_no_account');
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
    });

    it('409 account_already_deleted when the reporter is already anonymised', async () => {
      seedReport();
      prisma.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'deleted' });
      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/bad-faith')
        .send({ reason: REASON })
        .expect(409);
      expect(res.body.code).toBe('account_already_deleted');
    });

    it('409 hold_already_active when the same bad-faith hold already exists', async () => {
      seedReport();
      prisma.accountHold.findFirst.mockResolvedValue({ id: 'hold-0' });
      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/bad-faith')
        .send({ reason: REASON })
        .expect(409);
      expect(res.body.code).toBe('hold_already_active');
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/moderation/reports/:id/holds/legal', () => {
    it('holds every party with an account (reporter and reported user), one audit row each, notifying nobody', async () => {
      seedReport();

      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/legal')
        .send({ reason: REASON })
        .expect(201);

      expect(res.body.holds.map((h: { userId: string }) => h.userId).sort()).toEqual(['rep-1', 'subject-1']);
      expect(res.body.holds.every((h: { type: string; expiresAt: unknown }) => h.type === 'legal_hold' && h.expiresAt === null)).toBe(true);
      expect(prisma.adminActionLog.create).toHaveBeenCalledTimes(2);
      expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LEGAL_PLACED, adminId: 'admin-1' }),
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('404 when the report does not exist', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await request(app.getHttpServer()).post('/admin/moderation/reports/nope/holds/legal').send({ reason: REASON }).expect(404);
    });

    it('409 hold_already_active when every party is already under a legal hold', async () => {
      seedReport();
      prisma.accountHold.findFirst.mockResolvedValue({ id: 'hold-0' });
      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/legal')
        .send({ reason: REASON })
        .expect(409);
      expect(res.body.code).toBe('hold_already_active');
    });

    it('409 account_already_deleted-style outcome: every party anonymised leaves nothing to hold', async () => {
      seedReport();
      prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, accountStatus: 'deleted' }));
      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/legal')
        .send({ reason: REASON })
        .expect(409);
      expect(res.body.code).toBe('hold_already_active');
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
    });

    it('409 no_party_to_hold when the report has no party with an account', async () => {
      seedReport({ reporterId: null });
      prisma.post.findUnique.mockResolvedValue(null);
      const res = await request(app.getHttpServer())
        .post('/admin/moderation/reports/r1/holds/legal')
        .send({ reason: REASON })
        .expect(409);
      expect(res.body.code).toBe('no_party_to_hold');
    });
  });

  describe('PATCH /admin/moderation/holds/:holdId/lift', () => {
    function seedHold(over: Record<string, unknown> = {}, concernsMinor: boolean | null = false) {
      prisma.accountHold.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? { id: 'hold-1', report: concernsMinor === null ? null : { concernsMinor } } : { ...HOLD_ROW, ...over },
      );
    }

    it('lifts a hold: 200 with the hold view, one audit row, nobody notified', async () => {
      seedHold();

      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(200);

      expect(res.body.hold).toMatchObject({ id: 'hold-1', type: 'legal_hold', liftedAt: expect.any(String) });
      expect(prisma.accountHold.updateMany).toHaveBeenCalledWith({
        where: { id: 'hold-1', liftedAt: null },
        data: expect.objectContaining({ liftedByAdminId: 'admin-1', liftReason: REASON }),
      });
      expect(prisma.adminActionLog.create).toHaveBeenCalledTimes(1);
      expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ adminId: 'admin-1', action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LIFTED, targetId: 'rep-1' }),
      });
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(prisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('lifts a bad-faith hold too', async () => {
      seedHold({ type: 'bad_faith', expiresAt: new Date('2099-01-01T00:00:00.000Z') });
      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(200);
      expect(res.body.hold.type).toBe('bad_faith');
    });

    it('404 hold_not_found when the hold does not exist', async () => {
      prisma.accountHold.findUnique.mockResolvedValue(null);
      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/nope/lift').send({ reason: REASON }).expect(404);
      expect(res.body.code).toBe('hold_not_found');
    });

    it('409 hold_already_lifted', async () => {
      seedHold({ liftedAt: new Date('2029-01-01T00:00:00.000Z') });
      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(409);
      expect(res.body.code).toBe('hold_already_lifted');
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    });

    it('409 hold_already_lifted when a concurrent lift wins the race', async () => {
      seedHold();
      prisma.accountHold.updateMany.mockResolvedValue({ count: 0 });
      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(409);
      expect(res.body.code).toBe('hold_already_lifted');
    });

    it('409 hold_expired for a bad-faith hold that has already run out', async () => {
      seedHold({ type: 'bad_faith', expiresAt: new Date('2000-01-01T00:00:00.000Z') });
      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(409);
      expect(res.body.code).toBe('hold_expired');
    });
  });

  describe('child-safety vetting gate (a report that concerns a minor)', () => {
    it.each(routes)('$name: 403 child_safety_vetting_required for an unvetted admin, before anything is touched', async ({ method, url }) => {
      seedReport({ concernsMinor: true });
      prisma.accountHold.findUnique.mockResolvedValue({ id: 'hold-1', report: { concernsMinor: true } });
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });

      const res = await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(403);

      expect(res.body.code).toBe('child_safety_vetting_required');
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { childSafetyVetted: true } });
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
      expect(prisma.accountHold.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    });

    it('an unvetted superadmin is blocked exactly like a moderator (vetting is a separate axis from role)', async () => {
      seedReport({ concernsMinor: true });
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
      currentAdmin = { sub: 'admin-2', role: 'superadmin', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/moderation/reports/r1/holds/legal').send({ reason: REASON }).expect(403);
    });

    it('a vetted admin may place and lift holds on such a report', async () => {
      seedReport({ concernsMinor: true });
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: true });
      await request(app.getHttpServer()).post('/admin/moderation/reports/r1/holds/bad-faith').send({ reason: REASON }).expect(201);

      prisma.accountHold.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? { id: 'hold-1', report: { concernsMinor: true } } : { ...HOLD_ROW },
      );
      await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(200);
    });

    it('a report that does not concern a minor never triggers the vetting lookup', async () => {
      seedReport({ concernsMinor: false });
      await request(app.getHttpServer()).post('/admin/moderation/reports/r1/holds/bad-faith').send({ reason: REASON }).expect(201);
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('404 is settled before the vetting gate: a missing report is 404 for an unvetted admin, with no vetting lookup', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      await request(app.getHttpServer()).post('/admin/moderation/reports/nope/holds/legal').send({ reason: REASON }).expect(404);
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });
  });

  // B-302 (Decision Log #498, #499): the B-297 rule on the three hold routes. A MESSAGE report whose sender or any
  // participant is under 18 needs a vetted admin even when the report itself is not flagged concernsMinor.
  describe('child-safety vetting gate (a message report whose thread involves someone under 18)', () => {
    const MESSAGE_ID = '11111111-1111-4111-8111-111111111111';

    function seedMessageThread(minors: string[], participants = ['u-reporter', 'u-sender']) {
      prisma.message.findUnique.mockResolvedValue({ senderId: 'u-sender', conversation: { participantIds: participants } });
      prisma.user.findMany.mockResolvedValue(participants.map((id) => ({ id, isMinor: minors.includes(id) })));
    }
    function seedMessageReport(concernsMinor = false) {
      seedReport({ targetType: 'message', targetId: MESSAGE_ID, concernsMinor });
      prisma.accountHold.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? { id: 'hold-1', report: { concernsMinor, targetType: 'message', targetId: MESSAGE_ID } } : { ...HOLD_ROW },
      );
    }
    function unvetted() {
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
    }
    function nothingWritten() {
      expect(prisma.accountHold.create).not.toHaveBeenCalled();
      expect(prisma.accountHold.updateMany).not.toHaveBeenCalled();
      expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
    }
    const okStatus = (method: 'post' | 'patch') => (method === 'post' ? 201 : 200);
    // Placing a legal hold also reads the message once to find its sender; the VETTING lookup is the one that selects the conversation.
    const threadLookups = () => prisma.message.findUnique.mock.calls.filter(([arg]: [{ select?: Record<string, unknown> }]) => arg.select && 'conversation' in arg.select).length;

    it.each(routes)('$name: 403 for an unvetted admin when the sender is under 18, and nothing is written', async ({ method, url }) => {
      seedMessageReport();
      seedMessageThread(['u-sender']);
      unvetted();
      const res = await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(403);
      expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
      expect(res.body.message).toBe('This action requires a child-safety-vetted admin.');
      nothingWritten();
    });

    it.each(routes)('$name: 403 for an unvetted admin when only the OTHER participant is under 18', async ({ method, url }) => {
      seedMessageReport();
      seedMessageThread(['u-reporter']);
      unvetted();
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(403);
      nothingWritten();
    });

    it.each(routes)('$name: an unvetted admin is allowed when everyone in the thread is an adult', async ({ method, url }) => {
      seedMessageReport();
      seedMessageThread([]);
      unvetted();
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(okStatus(method));
      expect(threadLookups()).toBe(1);
    });

    it.each(routes)('$name: a vetted admin is allowed on a child-involved thread and the thread is not looked up', async ({ method, url }) => {
      seedMessageReport();
      seedMessageThread(['u-sender']);
      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: true });
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(okStatus(method));
      expect(threadLookups()).toBe(0);
      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it.each(routes)('$name: fails closed when the message row is gone (an unvetted admin is refused)', async ({ method, url }) => {
      seedMessageReport();
      prisma.message.findUnique.mockResolvedValue(null);
      unvetted();
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(403);
      nothingWritten();
    });

    it.each(routes)('$name: fails closed when a participant has no User row', async ({ method, url }) => {
      seedMessageReport();
      prisma.message.findUnique.mockResolvedValue({ senderId: 'u-sender', conversation: { participantIds: ['u-reporter', 'u-sender'] } });
      prisma.user.findMany.mockResolvedValue([{ id: 'u-reporter', isMinor: false }]);
      unvetted();
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(403);
      nothingWritten();
    });

    it.each(routes)('$name: a non-message report that is not concernsMinor never looks at a thread or the vetting flag', async ({ method, url }) => {
      seedReport({ targetType: 'post', concernsMinor: false });
      prisma.accountHold.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? { id: 'hold-1', report: { concernsMinor: false, targetType: 'post', targetId: 'p1' } } : { ...HOLD_ROW },
      );
      await request(app.getHttpServer())[method](url).send({ reason: REASON }).expect(okStatus(method));
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
      expect(threadLookups()).toBe(0);
    });

    it('a concernsMinor message report still needs a vetted admin and does not read the thread', async () => {
      seedMessageReport(true);
      seedMessageThread([]);
      unvetted();
      await request(app.getHttpServer()).post('/admin/moderation/reports/r1/holds/legal').send({ reason: REASON }).expect(403);
      expect(threadLookups()).toBe(0);
      nothingWritten();
    });

    it('lift: 404 for a missing hold is settled before the gate', async () => {
      prisma.accountHold.findUnique.mockResolvedValue(null);
      unvetted();
      const res = await request(app.getHttpServer()).patch('/admin/moderation/holds/nope/lift').send({ reason: REASON }).expect(404);
      expect(res.body.code).toBe('hold_not_found');
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    });

    it('lift: a hold whose report was purged (reportId NULL) may be lifted by an unvetted admin (Decision Log #499)', async () => {
      prisma.accountHold.findUnique.mockImplementation(async ({ select }: { select?: unknown }) =>
        select ? { id: 'hold-1', report: null } : { ...HOLD_ROW, reportId: null },
      );
      unvetted();
      await request(app.getHttpServer()).patch('/admin/moderation/holds/hold-1/lift').send({ reason: REASON }).expect(200);
      expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
      expect(threadLookups()).toBe(0);
    });

    it('place: 404 for a missing report is settled before the gate', async () => {
      prisma.report.findUnique.mockResolvedValue(null);
      unvetted();
      await request(app.getHttpServer()).post('/admin/moderation/reports/nope/holds/bad-faith').send({ reason: REASON }).expect(404);
      expect(threadLookups()).toBe(0);
    });
  });
});
