import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
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
        data: { reporterId: reporter.id, targetType: 'post', targetId: post.id, reason: 'abuse', status: 'actioned' },
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
