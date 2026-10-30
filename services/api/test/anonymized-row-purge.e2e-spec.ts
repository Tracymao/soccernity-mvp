import { randomUUID } from 'crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
import { UsernamePolicyService } from '../src/modules/users/username-policy.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w6-purge-anonymised-rows (B-043; Decision Log #375, supersedes #344).
//
// Real Postgres, because the whole point is database facts a mock cannot show: five of the foreign keys
// into User CASCADE (so a careless DELETE would silently destroy their rows), the no-foreign-key
// references (Report.targetId, RevokedUsername.userId) that no DELETE would ever object to, the
// RESTRICT keys, and the Serializable transaction itself.
describe('AnonymizedRowPurgeService e2e: 30-day purge of anonymised User rows, against real Postgres', () => {
  const DAY = 24 * 60 * 60 * 1000;
  let app: INestApplication;
  let sweep: AccountDeletionSweepService;
  let purge: AnonymizedRowPurgeService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    sweep = app.get(AccountDeletionSweepService);
    purge = app.get(AnonymizedRowPurgeService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // The logical clock of the test: the sweep runs at T0, the purge runs later.
  const T0 = new Date('2026-12-01T03:00:00.000Z');
  const daysAfter = (n: number, extraMs = 0) => new Date(T0.getTime() + n * DAY + extraMs);

  async function seedPendingDeletion(label: string, opts: { isMinor?: boolean } = {}) {
    return getTestPrismaClient().user.create({
      data: {
        email: `e2e-purge-${label}-${randomUUID()}@example.com`,
        passwordHash: 'unused',
        displayName: `Purge ${label}`,
        dateOfBirth: opts.isMinor ? seedDob('2015-01-01') : seedDob('1998-07-04'),
        isMinor: opts.isMinor ?? false,
        accountStatus: 'pending_deletion',
        pendingDeletionAt: new Date(T0.getTime() - 31 * DAY),
      },
    });
  }

  /** Seed a pending-deletion account and anonymise it through the REAL sweep at T0. */
  async function anonymised(label: string, opts: { isMinor?: boolean } = {}) {
    const u = await seedPendingDeletion(label, opts);
    const r = await sweep.sweepPendingDeletions(T0);
    expect(r.anonymizedUserIds).toContain(u.id);
    return u;
  }

  const exists = async (id: string) => (await getTestPrismaClient().user.findUnique({ where: { id } })) !== null;

  describe('the clock and the 30-day boundary', () => {
    it('the sweep stamps anonymizedAt with its own now, in the same transaction as accountStatus -> deleted', async () => {
      const u = await anonymised('stamp');
      const row = await getTestPrismaClient().user.findUnique({ where: { id: u.id } });
      expect(row!.accountStatus).toBe('deleted');
      expect(row!.anonymizedAt).toEqual(T0);
    });

    it('29 days 23 hours after anonymisation: the row is kept; at 30 days: it is deleted', async () => {
      const u = await anonymised('boundary');

      const early = await purge.purgeAnonymizedRows(daysAfter(30, -60 * 60 * 1000));
      expect(early.purgedUserIds).toEqual([]);
      expect(await exists(u.id)).toBe(true);

      const due = await purge.purgeAnonymizedRows(daysAfter(30));
      expect(due.purgedUserIds).toEqual([u.id]);
      expect(await exists(u.id)).toBe(false);
    });

    it('a second run is a no-op (the row is already gone)', async () => {
      await anonymised('twice');
      await purge.purgeAnonymizedRows(daysAfter(31));
      const again = await purge.purgeAnonymizedRows(daysAfter(32));
      expect(again.purgedUserIds).toEqual([]);
      expect(again.keptUserIds).toEqual([]);
    });

    it("a 'deleted' row with a NULL anonymizedAt (anonymised before the column existed) is never purged", async () => {
      const legacy = await getTestPrismaClient().user.create({
        data: {
          email: `deleted-${randomUUID()}@deleted.soccernity.internal`,
          passwordHash: '!anonymized',
          displayName: '[deleted user]',
          accountStatus: 'deleted',
          anonymizedAt: null,
        },
      });
      const r = await purge.purgeAnonymizedRows(daysAfter(3650));
      expect(r.purgedUserIds).toEqual([]);
      expect(await exists(legacy.id)).toBe(true);
    });

    it('re-running the anonymiser does not restart the clock', async () => {
      const u = await anonymised('rerun');
      await sweep.anonymizeUser(u.id, false, daysAfter(20));
      const row = await getTestPrismaClient().user.findUnique({ where: { id: u.id } });
      expect(row!.anonymizedAt).toEqual(T0);
    });

    it('only rows in the deleted state are ever touched', async () => {
      const pending = await seedPendingDeletion('still-pending');
      const r = await purge.purgeAnonymizedRows(daysAfter(3650));
      expect(r.purgedUserIds).toEqual([]);
      expect(await exists(pending.id)).toBe(true);
    });
  });

  describe('(b) an account with no content is purged; anything that still refers to it keeps it', () => {
    it('purges an anonymised account that left nothing behind', async () => {
      const u = await anonymised('clean');
      const r = await purge.purgeAnonymizedRows(daysAfter(30));
      expect(r.purgedUserIds).toEqual([u.id]);
      expect(r.purgedReasons[u.id]).toBe('no_content');
    });

    it('keeps a user who authored a post (RESTRICT) -- and the post survives', async () => {
      const prisma = getTestPrismaClient();
      const u = await seedPendingDeletion('author');
      const post = await prisma.post.create({ data: { authorId: u.id, contentText: 'still here' } });
      await sweep.sweepPendingDeletions(T0);

      const r = await purge.purgeAnonymizedRows(daysAfter(31));

      expect(r.purgedUserIds).toEqual([]);
      expect(r.keptUserIds).toEqual([{ userId: u.id, blocker: 'Post.author', kind: 'content' }]);
      expect(await exists(u.id)).toBe(true);
      expect(await prisma.post.findUnique({ where: { id: post.id } })).not.toBeNull();
    });

    // The CASCADE foreign keys: the point of checking explicitly. A plain DELETE would have succeeded and
    // taken these rows with it. Both are proven here against the real constraint.
    it('keeps a user with points-ledger rows (CASCADE) -- the rows are NOT silently deleted', async () => {
      const prisma = getTestPrismaClient();
      const u = await seedPendingDeletion('ledger');
      await prisma.pointsLedgerEntry.create({
        data: { userId: u.id, source: 'engagement_like_given', refId: randomUUID(), quarterPoints: 4 },
      });
      await sweep.sweepPendingDeletions(T0);

      const r = await purge.purgeAnonymizedRows(daysAfter(31));

      expect(r.keptUserIds).toEqual([{ userId: u.id, blocker: 'PointsLedgerEntry.user', kind: 'content' }]);
      expect(await exists(u.id)).toBe(true);
      expect(await prisma.pointsLedgerEntry.count({ where: { userId: u.id } })).toBe(1);
    });

    it('keeps a user who created a Community Group (CASCADE) -- the group is NOT silently deleted', async () => {
      const prisma = getTestPrismaClient();
      const u = await seedPendingDeletion('group-owner');
      const group = await prisma.communityGroup.create({
        data: { name: 'Lagos Strikers', nameNormalized: `lagos-strikers-${randomUUID()}`, city: 'Lagos', createdById: u.id },
      });
      await sweep.sweepPendingDeletions(T0);

      const r = await purge.purgeAnonymizedRows(daysAfter(31));

      expect(r.keptUserIds).toEqual([{ userId: u.id, blocker: 'CommunityGroup.createdBy', kind: 'content' }]);
      expect(await prisma.communityGroup.findUnique({ where: { id: group.id } })).not.toBeNull();
    });

    // The no-foreign-key references: no DELETE would ever have objected to these.
    it('keeps a user a Report was filed against (Report.targetId has no foreign key) -- the report survives', async () => {
      const prisma = getTestPrismaClient();
      const u = await anonymised('reported');
      const reporter = await prisma.user.create({
        data: { email: `reporter-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Reporter', dateOfBirth: seedDob('1990-01-01') },
      });
      const report = await prisma.report.create({
        data: { reporterId: reporter.id, targetType: 'user', targetId: u.id, reason: 'spam', status: 'reviewed' },
      });

      const r = await purge.purgeAnonymizedRows(daysAfter(31));

      expect(r.keptUserIds).toEqual([{ userId: u.id, blocker: 'Report.targetId', kind: 'content' }]);
      expect(await exists(u.id)).toBe(true);
      expect(await prisma.report.findUnique({ where: { id: report.id } })).not.toBeNull();
    });

    // The post/comment arms of the report lookup run against real Postgres here. A report on a post the user
    // authored is normally already held by Post.author (RESTRICT); once the post is gone the report no
    // longer resolves to this user, so it must not hold the row either.
    it('a Report on a post that no longer exists does not hold its former author', async () => {
      const prisma = getTestPrismaClient();
      const u = await seedPendingDeletion('post-reported');
      const post = await prisma.post.create({ data: { authorId: u.id, contentText: 'reported' } });
      const reporter = await prisma.user.create({
        data: { email: `reporter-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Reporter', dateOfBirth: seedDob('1990-01-01') },
      });
      await prisma.report.create({
        // B-044: an actioned report is closed only once its window and post-closure months have run out; an
        // actioned report with no reviewedAt would FAIL SAFE (held), so give it a decision long before T0.
        data: {
          reporterId: reporter.id,
          targetType: 'post',
          targetId: post.id,
          reason: 'abuse',
          status: 'actioned',
          reviewedAt: new Date(T0.getTime() - 400 * DAY),
        },
      });
      await sweep.sweepPendingDeletions(T0);
      await prisma.post.delete({ where: { id: post.id } });
      const r = await purge.purgeAnonymizedRows(daysAfter(31));
      expect(r.purgedUserIds).toEqual([u.id]);
    });

    it('keeps a user who has a RevokedUsername record (no foreign key)', async () => {
      const prisma = getTestPrismaClient();
      const u = await anonymised('revoked');
      await prisma.revokedUsername.create({
        data: { username: 'taken_name', userId: u.id, holdUntil: daysAfter(60) },
      });
      const r = await purge.purgeAnonymizedRows(daysAfter(31));
      expect(r.keptUserIds).toEqual([{ userId: u.id, blocker: 'RevokedUsername.userId', kind: 'content' }]);
      expect(await exists(u.id)).toBe(true);
    });

    it('keeps a user an admin action log row names as its target (no foreign key)', async () => {
      const prisma = getTestPrismaClient();
      const u = await anonymised('audited');
      const admin = await prisma.adminUser.create({
        data: { email: `admin-${randomUUID()}@example.com`, role: 'superadmin', passwordHash: 'x', fullName: 'Admin' },
      });
      await prisma.adminActionLog.create({
        data: { adminId: admin.id, action: 'user.dob_viewed', targetType: 'user', targetId: u.id },
      });
      const r = await purge.purgeAnonymizedRows(daysAfter(31));
      expect(r.keptUserIds).toEqual([{ userId: u.id, blocker: 'AdminActionLog.targetId', kind: 'content' }]);
    });
  });

  // B-139 (founder decision 2026-10-30): a RevokedUsername record is kept while its user's account exists
  // and deleted when the account is anonymised AND holdUntil has passed. Real Postgres, real sweep: the
  // record has no foreign key to User, so only a database shows what survives which step.
  describe('B-139: revoked-username records', () => {
    const rev = (userId: string) =>
      getTestPrismaClient().revokedUsername.findMany({ where: { userId }, orderBy: { username: 'asc' } });
    const seedRevocation = (userId: string, username: string, holdUntil: Date) =>
      getTestPrismaClient().revokedUsername.create({
        data: { username, userId, revokedAt: new Date(holdUntil.getTime() - 30 * DAY), holdUntil },
      });

    it('anonymising with the hold already over deletes the record; a hold still running is kept', async () => {
      const u = await seedPendingDeletion('rev-anon');
      await seedRevocation(u.id, 'over_hold', new Date(T0.getTime() - DAY));
      await seedRevocation(u.id, 'running_hold', daysAfter(10));

      const r = await sweep.sweepPendingDeletions(T0);
      expect(r.anonymizedUserIds).toContain(u.id);

      expect((await rev(u.id)).map((x) => x.username)).toEqual(['running_hold']);
    });

    it('anonymising when the hold is over exactly now deletes it (the boundary is inclusive)', async () => {
      const u = await seedPendingDeletion('rev-boundary');
      await seedRevocation(u.id, 'boundary_hold', T0);
      await sweep.sweepPendingDeletions(T0);
      expect(await rev(u.id)).toEqual([]);
    });

    it('the cleanup keeps a running hold until holdUntil, then deletes it; running it again is a no-op', async () => {
      const u = await anonymised('rev-cleanup');
      const rec = await seedRevocation(u.id, 'held_name', daysAfter(10));

      const early = await purge.cleanupRevokedUsernames(daysAfter(10, -1000));
      expect(early.deletedIds).toEqual([]);
      expect(await rev(u.id)).toHaveLength(1);

      const due = await purge.cleanupRevokedUsernames(daysAfter(10));
      expect(due.deletedIds).toEqual([rec.id]);
      expect(await rev(u.id)).toEqual([]);

      const again = await purge.cleanupRevokedUsernames(daysAfter(11));
      expect(again).toEqual({ deletedIds: [], erroredIds: [], capped: false });
    });

    it("the cleanup leaves the records of accounts that are NOT anonymised alone, however old the hold is", async () => {
      const prisma = getTestPrismaClient();
      const active = await prisma.user.create({
        data: { email: `e2e-rev-active-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Active', accountStatus: 'active' },
      });
      const pending = await seedPendingDeletion('rev-pending');
      const deactivated = await prisma.user.create({
        data: { email: `e2e-rev-deact-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Deact', accountStatus: 'deactivated' },
      });
      // 'deleted' but never stamped (anonymised before the column existed): also left alone.
      const legacy = await prisma.user.create({
        data: { email: `deleted-${randomUUID()}@deleted.soccernity.internal`, passwordHash: '!anonymized', displayName: '[deleted user]', accountStatus: 'deleted', anonymizedAt: null },
      });
      const longAgo = new Date(T0.getTime() - 400 * DAY);
      for (const [n, id] of [['a', active.id], ['p', pending.id], ['d', deactivated.id], ['l', legacy.id]] as const) {
        await seedRevocation(id, `old_hold_${n}`, longAgo);
      }

      const r = await purge.cleanupRevokedUsernames(daysAfter(3650));

      expect(r.deletedIds).toEqual([]);
      expect(await prisma.revokedUsername.count()).toBe(4);
    });

    it('the purge is blocked while a hold runs (kept, retried) and unblocked once it is over', async () => {
      const u = await anonymised('rev-purge');
      await seedRevocation(u.id, 'long_hold', daysAfter(60));

      const blocked = await purge.purgeAnonymizedRows(daysAfter(31));
      expect(blocked.keptUserIds).toEqual([{ userId: u.id, blocker: 'RevokedUsername.userId', kind: 'content' }]);
      expect(await exists(u.id)).toBe(true);
      expect(await rev(u.id)).toHaveLength(1);

      // The daily order: cleanup first, then the purge. Nothing from RevokedUsername blocks any more.
      await purge.cleanupRevokedUsernames(daysAfter(60));
      const free = await purge.purgeAnonymizedRows(daysAfter(61));
      expect(free.purgedUserIds).toEqual([u.id]);
      expect(await exists(u.id)).toBe(false);
      expect(await getTestPrismaClient().revokedUsername.count()).toBe(0);
    });

    it('the purge deletes an expired record itself when the cleanup has not reached it (no record is left pointing at a purged row)', async () => {
      const u = await anonymised('rev-purge-alone');
      await seedRevocation(u.id, 'expired_name', daysAfter(5));

      const r = await purge.purgeAnonymizedRows(daysAfter(31)); // no cleanup run first

      expect(r.purgedUserIds).toEqual([u.id]);
      expect(await getTestPrismaClient().revokedUsername.count()).toBe(0);
    });

    it('the handle looks taken to another user while the hold runs, and is assignable once the record is deleted', async () => {
      const policy = app.get(UsernamePolicyService, { strict: false });
      const prisma = getTestPrismaClient();
      const other = await prisma.user.create({
        data: { email: `e2e-rev-other-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'Other', accountStatus: 'active' },
      });
      const u = await anonymised('rev-handle');
      await seedRevocation(u.id, 'club_handle9', daysAfter(10));
      const assign = (now: Date) =>
        policy.assertAssignable(
          { userId: other.id, candidate: 'club_handle9', current: null, usernameChangedAt: null, owner: {} },
          now,
        );

      await expect(assign(daysAfter(5))).rejects.toBeInstanceOf(ConflictException);

      await purge.cleanupRevokedUsernames(daysAfter(10));
      expect(await rev(u.id)).toEqual([]);
      await expect(assign(daysAfter(10))).resolves.toBeUndefined();
    });

    it('caps a cleanup run at 200 records, reports it, and the next run finishes the rest', async () => {
      const prisma = getTestPrismaClient();
      const u = await anonymised('rev-cap');
      await prisma.revokedUsername.createMany({
        data: Array.from({ length: 201 }, (_, i) => ({
          username: `capped_${String(i).padStart(3, '0')}`,
          userId: u.id,
          revokedAt: T0,
          holdUntil: daysAfter(10),
        })),
      });

      const first = await purge.cleanupRevokedUsernames(daysAfter(11));
      expect(first.capped).toBe(true);
      expect(first.deletedIds).toHaveLength(200);
      expect(await prisma.revokedUsername.count({ where: { userId: u.id } })).toBe(1);

      const second = await purge.cleanupRevokedUsernames(daysAfter(11));
      expect(second).toMatchObject({ capped: false });
      expect(second.deletedIds).toHaveLength(1);
      expect(await prisma.revokedUsername.count({ where: { userId: u.id } })).toBe(0);
    });
  });

  describe('(a) a never-approved minor', () => {
    it('is purged, the Guardian row is already gone, and its ConsentAuditRecord snapshot is left alone', async () => {
      const prisma = getTestPrismaClient();
      const minor = await seedPendingDeletion('minor', { isMinor: true });
      await prisma.guardian.create({
        data: {
          minorUserId: minor.id,
          name: 'Guardian',
          email: `g-${randomUUID()}@example.com`,
          relationship: 'parent',
          consentStatus: 'pending',
          consentToken: randomUUID(),
          consentTokenExpiresAt: new Date(T0.getTime() + 3 * DAY),
        },
      });
      await sweep.sweepPendingDeletions(T0);
      expect(await prisma.guardian.count({ where: { minorUserId: minor.id } })).toBe(0);
      expect(await prisma.consentAuditRecord.count({ where: { minorUserId: minor.id } })).toBe(1);

      const r = await purge.purgeAnonymizedRows(daysAfter(30));

      expect(r.purgedUserIds).toEqual([minor.id]);
      expect(r.purgedReasons[minor.id]).toBe('never_approved_minor');
      expect(await exists(minor.id)).toBe(false);
      // The audit snapshot has no foreign key and its own clock: untouched.
      expect(await prisma.consentAuditRecord.count({ where: { minorUserId: minor.id } })).toBe(1);
    });

    it('a minor whose guardian DID confirm consent is purged only under "no content"', async () => {
      const prisma = getTestPrismaClient();
      const minor = await seedPendingDeletion('approved-minor', { isMinor: true });
      await prisma.guardian.create({
        data: {
          minorUserId: minor.id,
          name: 'Guardian',
          email: `g-${randomUUID()}@example.com`,
          relationship: 'parent',
          consentStatus: 'confirmed',
          consentTimestamp: new Date(T0.getTime() - 100 * DAY),
          consentToken: randomUUID(),
          consentTokenExpiresAt: new Date(T0.getTime() + 3 * DAY),
        },
      });
      await sweep.sweepPendingDeletions(T0);

      const r = await purge.purgeAnonymizedRows(daysAfter(30));

      expect(r.purgedReasons[minor.id]).toBe('no_content');
    });

    it('is NOT forced out when it still has content: a never-approved minor with a Report filed against it stays', async () => {
      const prisma = getTestPrismaClient();
      const minor = await anonymised('minor-reported', { isMinor: true });
      const reporter = await prisma.user.create({
        data: { email: `reporter-${randomUUID()}@example.com`, passwordHash: 'x', displayName: 'R', dateOfBirth: seedDob('1990-01-01') },
      });
      await prisma.report.create({
        data: { reporterId: reporter.id, targetType: 'user', targetId: minor.id, reason: 'x' },
      });

      const r = await purge.purgeAnonymizedRows(daysAfter(31));

      expect(r.purgedUserIds).toEqual([]);
      expect(await exists(minor.id)).toBe(true);
    });
  });
});
