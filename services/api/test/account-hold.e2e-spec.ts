import { randomUUID } from 'crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService, UNUSABLE_PASSWORD_HASH } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { HoldService } from '../src/modules/account-hold/hold.service';
import { AdminUsersService } from '../src/modules/admin-users/admin-users.service';
import { ModerationService } from '../src/modules/moderation/moderation.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w6-hold-rule-extension (B-044; Decision Log #376, extends #341 / #345). Real Postgres, real
// transactions, explicit `now` at every boundary (the sweep, HoldService and the closure rule all take it).
// What a mocked PrismaService cannot show: the raw-SQL involvement query, the CHECK constraints on
// AccountHold, the FKs, the one-transaction minimisation and the lift/expiry timeline end to end.
describe('Account holds e2e: report-based hold + minimisation, legal hold, bad-faith hold (B-044)', () => {
  let app: INestApplication;
  let sweep: AccountDeletionSweepService;
  let holds: HoldService;
  let adminUsers: AdminUsersService;
  let moderation: ModerationService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    sweep = app.get(AccountDeletionSweepService);
    holds = app.get(HoldService);
    adminUsers = app.get(AdminUsersService);
    moderation = app.get(ModerationService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const REASON = 'Evidence preserved for the regulator.';
  const prisma = () => getTestPrismaClient();
  let seq = 0;
  const tag = () => `${Date.now()}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;
  const iso = (s: string) => new Date(s);

  // The sweep's clock for these tests. Accounts are made pending_deletion long before T0 so the 30-day grace
  // period is never the reason something is (or is not) anonymised.
  const T0 = iso('2027-01-15T12:00:00.000Z');
  const longAgo = iso('2026-01-01T00:00:00.000Z');

  async function pendingUser(label: string, extra: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: `hold-${label}-${tag()}@example.com`,
        phone: '+2348100000000',
        passwordHash: 'real-looking-hash',
        displayName: `Hold ${label}`,
        username: `hold_${label}_${seq}`.toLowerCase().slice(0, 30),
        dateOfBirth: seedDob('1998-07-04'),
        accountStatus: 'pending_deletion',
        pendingDeletionAt: longAgo,
        ...extra,
      },
    });
  }

  async function activeUser(label: string) {
    return prisma().user.create({
      data: {
        email: `hold-active-${label}-${tag()}@example.com`,
        passwordHash: 'x',
        displayName: `Hold active ${label}`,
        dateOfBirth: seedDob('1998-07-04'),
      },
    });
  }

  async function admin(label = 'a') {
    return prisma().adminUser.create({
      data: { email: `hold-admin-${label}-${tag()}@example.com`, passwordHash: 'x', fullName: `Hold Admin ${label}`, role: 'moderator' },
    });
  }

  async function report(over: Record<string, unknown>) {
    return prisma().report.create({
      data: { targetType: 'user', targetId: 'unset', reason: 'e2e hold', status: 'open', ...over } as never,
    });
  }

  const row = (id: string) => prisma().user.findUniqueOrThrow({ where: { id } });

  // ---------------------------------------------------------------------------------------------------
  describe('report-based hold: dismissed report, held for the post-closure months, then released', () => {
    it('holds the REPORTED user until reviewedAt + 6 calendar months (boundary exact), minimising them meanwhile', async () => {
      const subject = await pendingUser('dismissed-subject');
      const reporter = await activeUser('dismissed-reporter');
      const reviewedAt = iso('2026-12-01T09:00:00.000Z');
      await report({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'reviewed', reviewedAt, actionTaken: 'dismissed' });

      // inside the post-closure months: held, minimised, NOT anonymised
      const during = await sweep.sweepPendingDeletions(iso('2027-05-30T00:00:00.000Z'));
      expect(during.heldUserIds).toEqual([subject.id]);
      expect(during.minimisedUserIds).toEqual([subject.id]);
      expect(during.anonymizedUserIds).toEqual([]);
      const held = await row(subject.id);
      expect(held.accountStatus).toBe('pending_deletion');
      expect(held.email).toBe(subject.email); // evidence kept
      expect(held.phone).toBeNull(); // non-evidence cleared
      expect(held.passwordHash).toBe(UNUSABLE_PASSWORD_HASH);

      // one millisecond before the release instant: still held
      const justBefore = await sweep.sweepPendingDeletions(iso('2027-06-01T08:59:59.999Z'));
      expect(justBefore.heldUserIds).toEqual([subject.id]);

      // at the release instant: no longer held -> anonymised normally
      const at = await sweep.sweepPendingDeletions(iso('2027-06-01T09:00:00.000Z'));
      expect(at.anonymizedUserIds).toEqual([subject.id]);
      expect(at.heldUserIds).toEqual([]);
      const gone = await row(subject.id);
      expect(gone.accountStatus).toBe('deleted');
      expect(gone.anonymizedAt).toEqual(iso('2027-06-01T09:00:00.000Z'));
    });

    it('the REPORTER is not held once the report is closed: anonymised on the very next run', async () => {
      const reporter = await pendingUser('closed-reporter');
      const subject = await activeUser('closed-subject');
      await report({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'reviewed', reviewedAt: iso('2027-01-14T00:00:00.000Z') });

      const out = await sweep.sweepPendingDeletions(T0);
      expect(out.anonymizedUserIds).toEqual([reporter.id]);
      expect(out.heldUserIds).toEqual([]);
    });

    it('an actioned report with no appeal holds the reported user through the appeal window (appeal_window), then post_closure', async () => {
      const subject = await pendingUser('window-subject');
      const reporter = await activeUser('window-reporter');
      await report({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'actioned', actionTaken: 'warning_issued', reviewedAt: iso('2027-01-01T00:00:00.000Z') });

      const inWindow = await sweep.listStalledHolds(0, iso('2027-01-20T00:00:00.000Z'));
      expect(inWindow.map((h) => [h.userId, h.holdType])).toEqual([[subject.id, 'appeal_window']]);
      const afterWindow = await sweep.listStalledHolds(0, iso('2027-02-15T00:00:00.000Z'));
      expect(afterWindow.map((h) => [h.userId, h.holdType])).toEqual([[subject.id, 'post_closure']]);
    });

    it('an OVERTURNED appeal returns the report to open: held again, however late, with appeal history preserved', async () => {
      const subject = await pendingUser('overturned-subject');
      const reporter = await activeUser('overturned-reporter');
      await report({
        reporterId: reporter.id,
        targetType: 'user',
        targetId: subject.id,
        status: 'open',
        appealStatus: 'overturned',
        appealReviewedAt: iso('2026-02-01T00:00:00.000Z'),
      });

      const out = await sweep.sweepPendingDeletions(iso('2030-01-01T00:00:00.000Z'));
      expect(out.heldUserIds).toEqual([subject.id]);
      expect((await sweep.listStalledHolds(0, iso('2030-01-01T00:00:00.000Z')))[0].holdType).toBe('open_report');
    });

    it('an appeal UPHELD closes at appealReviewedAt: post-closure months count from there', async () => {
      const subject = await pendingUser('upheld-subject');
      const reporter = await activeUser('upheld-reporter');
      await report({
        reporterId: reporter.id,
        targetType: 'user',
        targetId: subject.id,
        status: 'actioned',
        actionTaken: 'content_removed',
        reviewedAt: iso('2026-01-01T00:00:00.000Z'),
        appealStatus: 'upheld',
        appealReviewedAt: iso('2026-12-10T00:00:00.000Z'),
      });
      expect((await sweep.sweepPendingDeletions(iso('2027-06-09T23:59:59.999Z'))).heldUserIds).toEqual([subject.id]);
      expect((await sweep.sweepPendingDeletions(iso('2027-06-10T00:00:00.000Z'))).anonymizedUserIds).toEqual([subject.id]);
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('minimisation of a report-held account (real rows)', () => {
    it('clears the non-evidence data and keeps the evidence, in one pass, and a second pass changes nothing', async () => {
      const p = prisma();
      const subject = await pendingUser('minimise', {
        isMinor: true,
        bio: 'a bio',
        preferredClub: 'Some FC',
        profileCountry: 'NG',
        declaredCountry: 'NG',
        derivedCountry: 'NG',
        countryDerivationMethod: 'geolite2_local',
        countryDerivedAt: iso('2026-01-02T00:00:00.000Z'),
        avatarUrl: 'https://cdn.example/a.png',
        avatarKey: 'avatars/a.png',
        avatarStatus: 'approved',
        coverUrl: 'https://cdn.example/c.png',
        coverKey: 'covers/c.png',
        coverStatus: 'approved',
      });
      const other = await activeUser('minimise-other');
      const reporter = await activeUser('minimise-reporter');

      // evidence that must survive
      const guardian = await p.guardian.create({
        data: {
          minorUserId: subject.id,
          name: 'G',
          email: 'g@example.com',
          relationship: 'parent',
          consentStatus: 'confirmed',
          consentToken: randomUUID(),
          consentTokenExpiresAt: iso('2999-01-01T00:00:00.000Z'),
          consentTimestamp: iso('2026-01-03T00:00:00.000Z'),
        },
      });
      const post = await p.post.create({ data: { authorId: subject.id, contentText: 'reported post' } });
      const comment = await p.comment.create({ data: { postId: post.id, authorId: subject.id, contentText: 'a comment' } });
      const conversation = await p.conversation.create({
        data: { participantIds: [subject.id, other.id], participantKey: [subject.id, other.id].sort().join(':') },
      });
      const message = await p.message.create({ data: { conversationId: conversation.id, senderId: subject.id, contentText: 'hello' } });
      await report({ reporterId: reporter.id, targetType: 'post', targetId: post.id });

      // behavioural rows that must go
      const othersPost = await p.post.create({ data: { authorId: other.id, contentText: 'o', likeCount: 1 } });
      await p.like.create({ data: { userId: subject.id, postId: othersPost.id } });
      await p.savedPost.create({ data: { userId: subject.id, postId: othersPost.id } });
      await p.follow.create({ data: { followerId: subject.id, followeeId: other.id } });
      await p.follow.create({ data: { followerId: other.id, followeeId: subject.id } });
      await p.notification.create({ data: { userId: subject.id, type: 'follow', payloadRefId: other.id } });

      const out = await sweep.sweepPendingDeletions(T0);
      expect(out.minimisedUserIds).toEqual([subject.id]);

      const after = await row(subject.id);
      // CLEARED
      expect(after.passwordHash).toBe(UNUSABLE_PASSWORD_HASH);
      for (const f of ['phone', 'bio', 'preferredClub', 'profileCountry', 'clubAffiliationId', 'representedClubId', 'avatarUrl', 'avatarKey', 'avatarStatus', 'coverUrl', 'coverKey', 'coverStatus'] as const) {
        expect(after[f]).toBeNull();
      }
      // KEPT
      expect(after.email).toBe(subject.email);
      expect(after.displayName).toBe(subject.displayName);
      expect(after.username).toBe(subject.username);
      expect(after.dateOfBirth).toBe(subject.dateOfBirth);
      expect(after.isMinor).toBe(true);
      expect([after.declaredCountry, after.derivedCountry, after.countryDerivationMethod]).toEqual(['NG', 'NG', 'geolite2_local']);
      expect(after.accountStatus).toBe('pending_deletion');
      expect(after.pendingDeletionAt).toEqual(longAgo);
      expect(after.anonymizedAt).toBeNull();
      expect(await p.guardian.findUnique({ where: { minorUserId: subject.id } })).not.toBeNull();
      expect(guardian.id).toBeTruthy();
      expect(await p.consentAuditRecord.count({ where: { minorUserId: subject.id } })).toBe(0);
      expect(await p.post.findUnique({ where: { id: post.id } })).not.toBeNull();
      expect(await p.comment.findUnique({ where: { id: comment.id } })).not.toBeNull();
      expect(await p.message.findUnique({ where: { id: message.id } })).not.toBeNull();
      // behavioural rows gone, counters honest
      expect(await p.like.count({ where: { userId: subject.id } })).toBe(0);
      expect(await p.savedPost.count({ where: { userId: subject.id } })).toBe(0);
      expect(await p.follow.count({ where: { OR: [{ followerId: subject.id }, { followeeId: subject.id }] } })).toBe(0);
      expect(await p.notification.count({ where: { userId: subject.id } })).toBe(0);
      expect((await p.post.findUniqueOrThrow({ where: { id: othersPost.id } })).likeCount).toBe(0);

      // idempotent
      const second = await sweep.sweepPendingDeletions(T0);
      expect(second.minimisedUserIds).toEqual([subject.id]);
      expect(await row(subject.id)).toEqual(after);
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('legal hold: holds BOTH accounts in full until an admin lifts it', () => {
    it('blocks anonymisation (and minimisation) until lifted; the next run after the lift anonymises', async () => {
      const a = await admin('legal');
      const subject = await pendingUser('legal-subject');
      const reporter = await pendingUser('legal-reporter');
      // the report itself closed long ago: only the legal hold keeps these accounts
      const r = await report({
        reporterId: reporter.id,
        targetType: 'user',
        targetId: subject.id,
        status: 'reviewed',
        reviewedAt: longAgo,
      });

      const placed = await holds.placeLegalHold(r.id, a.id, REASON, iso('2027-01-10T00:00:00.000Z'));
      expect(placed.map((h) => h.userId).sort()).toEqual([subject.id, reporter.id].sort());
      expect(placed.every((h) => h.type === 'legal_hold' && h.expiresAt === null)).toBe(true);

      const held = await sweep.sweepPendingDeletions(T0);
      expect(held.heldUserIds.sort()).toEqual([subject.id, reporter.id].sort());
      expect(held.minimisedUserIds).toEqual([]); // held IN FULL: nothing cleared
      expect(held.anonymizedUserIds).toEqual([]);
      for (const u of [subject, reporter]) {
        const after = await row(u.id);
        expect(after.phone).toBe('+2348100000000');
        expect(after.passwordHash).toBe('real-looking-hash');
        expect(after.accountStatus).toBe('pending_deletion');
      }
      expect((await sweep.listStalledHolds(0, T0)).map((h) => h.holdType)).toEqual(['legal_hold', 'legal_hold']);

      // lift one: only that account is released
      const lifted = await holds.liftHold(placed.find((h) => h.userId === reporter.id)!.id, a.id, 'Counsel confirmed release.', T0);
      expect(lifted.liftedAt).toEqual(T0);
      const afterLift = await sweep.sweepPendingDeletions(T0);
      expect(afterLift.anonymizedUserIds).toEqual([reporter.id]);
      expect(afterLift.heldUserIds).toEqual([subject.id]);

      // the audit rows exist: 2 placed + 1 lifted, none of them carrying anything but ids and the reason
      const log = await prisma().adminActionLog.findMany({ orderBy: { createdAt: 'asc' } });
      expect(log.map((l) => l.action).sort()).toEqual(['account_hold.legal_hold_placed', 'account_hold.legal_hold_placed', 'account_hold.lifted']);
      // and nobody was notified
      expect(await prisma().notification.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('bad-faith hold: the REPORTER is held in full for the configured months, or until lifted', () => {
    it('holds in full until expiresAt (boundary exact), then the account is anonymised normally', async () => {
      const a = await admin('bad');
      const reporter = await pendingUser('bad-reporter');
      const subject = await activeUser('bad-subject');
      const r = await report({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'reviewed', reviewedAt: longAgo });
      const placedAt = iso('2027-01-10T12:00:00.000Z');

      const hold = await holds.placeBadFaith(r.id, a.id, REASON, placedAt);
      expect(hold.expiresAt).toEqual(iso('2027-07-10T12:00:00.000Z'));

      const during = await sweep.sweepPendingDeletions(iso('2027-07-10T11:59:59.999Z'));
      expect(during.heldUserIds).toEqual([reporter.id]);
      expect(during.minimisedUserIds).toEqual([]);
      expect((await row(reporter.id)).phone).toBe('+2348100000000');

      const after = await sweep.sweepPendingDeletions(iso('2027-07-10T12:00:00.000Z'));
      expect(after.anonymizedUserIds).toEqual([reporter.id]);
    });

    it('an admin can lift it early (same lift path as a legal hold), then the account is anonymised', async () => {
      const a = await admin('bad-lift');
      const reporter = await pendingUser('bad-lift-reporter');
      const r = await report({ reporterId: reporter.id, targetType: 'user', targetId: (await activeUser('t')).id, status: 'reviewed', reviewedAt: longAgo });
      const hold = await holds.placeBadFaith(r.id, a.id, REASON, iso('2027-01-10T00:00:00.000Z'));
      expect((await sweep.sweepPendingDeletions(T0)).heldUserIds).toEqual([reporter.id]);

      await holds.liftHold(hold.id, a.id, 'Bad-faith finding withdrawn.', T0);
      expect((await sweep.sweepPendingDeletions(T0)).anonymizedUserIds).toEqual([reporter.id]);
    });

    it('is refused for a public (no-account) report and for an already-anonymised reporter', async () => {
      const a = await admin('bad-refuse');
      const subject = await activeUser('s');
      const publicReport = await report({ reporterId: null, reporterContactEmail: 'x@example.com', targetType: 'user', targetId: subject.id });
      await expect(holds.placeBadFaith(publicReport.id, a.id, REASON, T0)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'reporter_has_no_account' }),
      });

      const gone = await pendingUser('gone', { accountStatus: 'deleted', pendingDeletionAt: null });
      const r = await report({ reporterId: gone.id, targetType: 'user', targetId: subject.id });
      await expect(holds.placeBadFaith(r.id, a.id, REASON, T0)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'account_already_deleted' }),
      });
      expect(await prisma().accountHold.count()).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('admin immediate delete (PATCH status=deleted)', () => {
    it('REFUSES with a coded 409 naming the hold type while a legal hold is active; works after the lift', async () => {
      const a = await admin('del');
      const subject = await activeUser('del-subject');
      const reporter = await activeUser('del-reporter');
      const r = await report({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'reviewed', reviewedAt: longAgo });
      const [hold] = await holds.placeLegalHold(r.id, a.id, REASON);

      const attempt = adminUsers.updateUserStatus(hold.userId, a.id, { status: 'deleted' });
      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: expect.objectContaining({ code: 'account_hold_active', holdType: 'legal_hold' }) });
      expect((await row(hold.userId)).accountStatus).toBe('active');

      await holds.liftHold(hold.id, a.id, 'Hold no longer needed.');
      await expect(adminUsers.updateUserStatus(hold.userId, a.id, { status: 'deleted' })).resolves.toEqual({ deleted: true, id: hold.userId });
      expect((await row(hold.userId)).accountStatus).toBe('deleted');
    });

    it('a report-based hold does NOT block it (explicit admin choice, as before)', async () => {
      const a = await admin('del2');
      const subject = await activeUser('del2-subject');
      const reporter = await activeUser('del2-reporter');
      await report({ reporterId: reporter.id, targetType: 'user', targetId: subject.id }); // open report
      await expect(adminUsers.updateUserStatus(subject.id, a.id, { status: 'deleted' })).resolves.toEqual({ deleted: true, id: subject.id });
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('appeal window (POST /reports/:id/appeal, through the service)', () => {
    async function appealFixture(reviewedAt: Date) {
      const subject = await activeUser('appeal-subject');
      const reporter = await activeUser('appeal-reporter');
      const a = await admin('appeal');
      const r = await report({
        reporterId: reporter.id,
        targetType: 'user',
        targetId: subject.id,
        status: 'actioned',
        actionTaken: 'warning_issued',
        reviewedAt,
        reviewedByAdminId: a.id,
      });
      return { subject, r };
    }
    const daysBack = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

    it('is accepted inside the window and refused (coded 403) once it has lapsed', async () => {
      const inside = await appealFixture(daysBack(29));
      await expect(moderation.appealReport(inside.r.id, inside.subject.id, { reason: 'unfair' })).resolves.toMatchObject({ appealStatus: 'pending' });

      const outside = await appealFixture(daysBack(31));
      await expect(moderation.appealReport(outside.r.id, outside.subject.id, { reason: 'unfair' })).rejects.toMatchObject({
        response: expect.objectContaining({ statusCode: 403, code: 'appeal_window_closed' }),
      });
      expect((await prisma().report.findUniqueOrThrow({ where: { id: outside.r.id } })).appealStatus).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('AccountHold CHECK constraints (the database backstop)', () => {
    async function insert(data: Record<string, unknown>) {
      const a = await admin('check');
      const u = await activeUser('check');
      const r = await report({ reporterId: u.id, targetType: 'user', targetId: u.id });
      return prisma().accountHold.create({
        data: { userId: u.id, reportId: r.id, placedByAdminId: a.id, placeReason: REASON, type: 'legal_hold', ...data } as never,
      });
    }

    it('accepts a well-formed legal hold and bad-faith hold', async () => {
      await expect(insert({ type: 'legal_hold', expiresAt: null })).resolves.toBeDefined();
      await expect(insert({ type: 'bad_faith', expiresAt: iso('2027-06-01T00:00:00.000Z') })).resolves.toBeDefined();
    });

    it('rejects an unknown type', async () => {
      await expect(insert({ type: 'house_arrest' })).rejects.toThrow();
    });

    it('rejects half-lifted rows (lifted columns are all set or all null)', async () => {
      await expect(insert({ liftedAt: T0 })).rejects.toThrow();
      await expect(insert({ liftReason: REASON })).rejects.toThrow();
    });

    it('rejects a bad-faith hold with no expiry, and a legal hold WITH an expiry', async () => {
      await expect(insert({ type: 'bad_faith', expiresAt: null })).rejects.toThrow();
      await expect(insert({ type: 'legal_hold', expiresAt: T0 })).rejects.toThrow();
    });

    it('rejects a bad-faith hold with no report', async () => {
      const a = await admin('noreport');
      const u = await activeUser('noreport');
      await expect(
        prisma().accountHold.create({
          data: { userId: u.id, placedByAdminId: a.id, placeReason: REASON, type: 'bad_faith', expiresAt: T0 } as never,
        }),
      ).rejects.toThrow();
    });
  });
});
