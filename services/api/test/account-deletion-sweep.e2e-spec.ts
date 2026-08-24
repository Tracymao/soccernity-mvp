import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for AccountDeletionSweepService (Build Plan
// Section 9, Decision Log #42 and Decision Log #44) — the same category
// (1)/(2)/(3) "raw SQL", "transaction/isolation-level reasoning", and
// "genuinely novel Prisma relation/constraint" test/README.md's guiding
// principle calls out for e2e coverage. This one specifically needed
// real Postgres, not a mock, for two separate reasons: (1) the entire
// point of hardDeleteUser's transaction ordering is that
// Guardian.minorUserId is a real ON DELETE RESTRICT foreign key against
// User (confirmed against the real migration SQL before writing any
// code) — a mocked PrismaService would happily let a User delete
// "succeed" regardless of ordering, telling you nothing about whether
// the real constraint is actually satisfied; (2) Decision Log #44's own
// cascade behavior — including the cross-user consequence of cascading
// a Post into other users' Comment/Like/SavedPost rows — is entirely a
// database-level mechanism (ON DELETE CASCADE) that a mocked
// PrismaService cannot exercise at all; only a real Postgres instance
// can prove it actually fires.
describe('AccountDeletionSweepService e2e: 30-day hard-delete + 6-month consent-audit purge, against real Postgres', () => {
  let app: INestApplication;
  let sweepService: AccountDeletionSweepService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    sweepService = app.get(AccountDeletionSweepService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function uniqueEmail(label: string): string {
    return `e2e-deletion-sweep-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }

  async function seedPendingDeletionUser(
    label: string,
    overrides: { pendingDeletionAt: Date; isMinor?: boolean },
  ) {
    const prisma = getTestPrismaClient();
    return prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Deletion Sweep User ${label}`,
        dateOfBirth: overrides.isMinor ? new Date('2015-01-01') : new Date('1998-07-04'),
        isMinor: overrides.isMinor ?? false,
        accountStatus: 'pending_deletion',
        pendingDeletionAt: overrides.pendingDeletionAt,
      },
    });
  }

  describe('sweepPendingDeletions — the 30-day grace period boundary', () => {
    it('does NOT hard-delete an account that has not yet reached its 30-day mark', async () => {
      const notYetDue = await seedPendingDeletionUser('not-yet-due', { pendingDeletionAt: daysAgo(29) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).not.toContain(notYetDue.id);
      const prisma = getTestPrismaClient();
      const stillThere = await prisma.user.findUnique({ where: { id: notYetDue.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.accountStatus).toBe('pending_deletion');
    });

    it('hard-deletes an account past its 30-day mark that has no related content', async () => {
      const pastDue = await seedPendingDeletionUser('past-due', { pendingDeletionAt: daysAgo(31) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toContain(pastDue.id);
      const prisma = getTestPrismaClient();
      const gone = await prisma.user.findUnique({ where: { id: pastDue.id } });
      expect(gone).toBeNull();
    });

    it('a single sweep run correctly separates a not-yet-due account from a past-due one, side by side', async () => {
      const notYetDue = await seedPendingDeletionUser('boundary-not-due', { pendingDeletionAt: daysAgo(1) });
      const pastDue = await seedPendingDeletionUser('boundary-past-due', { pendingDeletionAt: daysAgo(30) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toContain(pastDue.id);
      expect(result.hardDeletedUserIds).not.toContain(notYetDue.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: pastDue.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: notYetDue.id } })).not.toBeNull();
    });

    it('leaves active and deactivated accounts alone regardless of how old they are', async () => {
      const prisma = getTestPrismaClient();
      const active = await prisma.user.create({
        data: {
          email: uniqueEmail('active'),
          passwordHash: 'unused',
          displayName: 'Still Active',
          dateOfBirth: new Date('1998-07-04'),
          accountStatus: 'active',
        },
      });
      const deactivated = await prisma.user.create({
        data: {
          email: uniqueEmail('deactivated'),
          passwordHash: 'unused',
          displayName: 'Deactivated Only',
          dateOfBirth: new Date('1998-07-04'),
          accountStatus: 'deactivated',
        },
      });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toHaveLength(0);
      expect(await prisma.user.findUnique({ where: { id: active.id } })).not.toBeNull();
      expect(await prisma.user.findUnique({ where: { id: deactivated.id } })).not.toBeNull();
    });
  });

  describe('sweepPendingDeletions — minors with a Guardian row: ConsentAuditRecord survives the User hard-delete', () => {
    async function seedMinorWithGuardian(
      label: string,
      guardianOverrides: { consentStatus: 'pending' | 'confirmed'; consentTimestamp: Date | null },
    ) {
      const prisma = getTestPrismaClient();
      const minor = await seedPendingDeletionUser(label, { pendingDeletionAt: daysAgo(31), isMinor: true });
      await prisma.guardian.create({
        data: {
          minorUserId: minor.id,
          name: 'Real Guardian Name',
          email: 'real-guardian-email@example.com',
          relationship: 'parent',
          consentStatus: guardianOverrides.consentStatus,
          consentToken: randomUUID(),
          consentTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          consentTimestamp: guardianOverrides.consentTimestamp,
        },
      });
      return minor;
    }

    it('confirmed consent: hard-deletes User and Guardian, and a ConsentAuditRecord survives with the confirmed snapshot', async () => {
      const confirmedAt = new Date('2026-06-01T12:00:00.000Z');
      const minor = await seedMinorWithGuardian('confirmed', {
        consentStatus: 'confirmed',
        consentTimestamp: confirmedAt,
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.hardDeletedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: minor.id } })).toBeNull();
      expect(await prisma.guardian.findUnique({ where: { minorUserId: minor.id } })).toBeNull();

      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(1);
      const record = auditRecords[0]!;
      expect(record.consentStatus).toBe('confirmed');
      expect(record.consentConfirmedAt).toEqual(confirmedAt);
      expect(record.consentMethod).toBe('guardian-consent-link');

      // No more PII than necessary — Decision Log #42 explicitly rules
      // out a full Guardian mirror. Structural proof, not just "we didn't
      // populate it": the model itself has no name/email/relationship
      // columns for this to even leak through.
      expect(Object.keys(record).sort()).toEqual(
        ['id', 'minorUserId', 'consentStatus', 'consentConfirmedAt', 'consentMethod', 'createdAt'].sort(),
      );
      expect(JSON.stringify(record)).not.toContain('Real Guardian Name');
      expect(JSON.stringify(record)).not.toContain('real-guardian-email@example.com');
    });

    it('pending (never-confirmed) consent: still hard-deletes and still snapshots — consentConfirmedAt is null', async () => {
      const minor = await seedMinorWithGuardian('pending', { consentStatus: 'pending', consentTimestamp: null });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.hardDeletedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: minor.id } })).toBeNull();

      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0]!.consentStatus).toBe('pending');
      expect(auditRecords[0]!.consentConfirmedAt).toBeNull();
    });

    it('a minor past due with no Guardian row at all is hard-deleted with no ConsentAuditRecord created', async () => {
      const minor = await seedPendingDeletionUser('minor-no-guardian', {
        pendingDeletionAt: daysAgo(31),
        isMinor: true,
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.hardDeletedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: minor.id } })).toBeNull();
      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(0);
    });
  });

  // sprint-2/account-deletion-cascade -- Decision Log #44 is now
  // RESOLVED (option a, cascade). The describe block this replaces
  // ("the RESTRICT/related-content gap ... not resolved by this PR")
  // proved a Post BLOCKED a hard-delete; that is now exactly backwards
  // and would fail against the current schema. See
  // account-deletion/README.md's "Decision Log #44" section for the
  // full resolution and the founder's own stated reasoning.
  describe('sweepPendingDeletions — Decision Log #44 (cascade) is live: related content no longer blocks a hard-delete', () => {
    async function createActiveUser(label: string) {
      const prisma = getTestPrismaClient();
      return prisma.user.create({
        data: {
          email: uniqueEmail(label),
          passwordHash: 'unused-in-this-e2e-spec-file',
          displayName: `E2E Cascade Other User ${label}`,
          dateOfBirth: new Date('1998-07-04'),
        },
      });
    }

    it('hard-deletes a past-due account that has its OWN Post, Comment, Like, and Follow — all of it is genuinely gone from Postgres afterward, and blockedUserIds is empty', async () => {
      const prisma = getTestPrismaClient();
      const author = await seedPendingDeletionUser('own-content', { pendingDeletionAt: daysAgo(31) });
      const other = await createActiveUser('follow-target');

      const post = await prisma.post.create({ data: { authorId: author.id, contentText: 'my own post' } });
      const comment = await prisma.comment.create({
        data: { postId: post.id, authorId: author.id, contentText: 'my own comment' },
      });
      const like = await prisma.like.create({ data: { userId: author.id, postId: post.id } });
      const follow = await prisma.follow.create({ data: { followerId: author.id, followeeId: other.id } });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toContain(author.id);
      expect(result.blockedUserIds).toEqual([]);

      expect(await prisma.user.findUnique({ where: { id: author.id } })).toBeNull();
      expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();
      expect(await prisma.comment.findUnique({ where: { id: comment.id } })).toBeNull();
      expect(await prisma.like.findUnique({ where: { id: like.id } })).toBeNull();
      expect(await prisma.follow.findUnique({ where: { id: follow.id } })).toBeNull();

      // The other, unrelated user's own account is untouched.
      expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
    });

    // THE single most important test in this PR — the founder's own,
    // explicitly stated real mechanical consequence of Decision Log #44,
    // proven directly against real Postgres, not left implicit inside a
    // broader test: "cascading Post also cascades away Comment/Like/
    // SavedPost rows written by OTHER, unrelated users on that post."
    it("CROSS-USER CASCADE — the core Decision Log #44 consequence: hard-deleting a Post's author also deletes ANOTHER user's Comment/Like/SavedPost rows on that same post, not just the author's own content", async () => {
      const prisma = getTestPrismaClient();
      const userA = await seedPendingDeletionUser('user-a-author', { pendingDeletionAt: daysAgo(31) });
      const userB = await createActiveUser('user-b-engager');

      const post = await prisma.post.create({ data: { authorId: userA.id, contentText: "User A's post" } });
      const commentByB = await prisma.comment.create({
        data: { postId: post.id, authorId: userB.id, contentText: "User B's comment on User A's post" },
      });
      const likeByB = await prisma.like.create({ data: { userId: userB.id, postId: post.id } });
      const savedByB = await prisma.savedPost.create({ data: { userId: userB.id, postId: post.id } });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toContain(userA.id);
      expect(result.blockedUserIds).toEqual([]);

      // User A and their Post are gone, as expected.
      expect(await prisma.user.findUnique({ where: { id: userA.id } })).toBeNull();
      expect(await prisma.post.findUnique({ where: { id: post.id } })).toBeNull();

      // The real, explicitly-stated consequence: User B's own Comment,
      // Like, and SavedPost rows on that post are ALSO gone — cascaded
      // away via the Post, even though User B's own account was never
      // touched by this sweep run at all.
      expect(await prisma.comment.findUnique({ where: { id: commentByB.id } })).toBeNull();
      expect(await prisma.like.findUnique({ where: { id: likeByB.id } })).toBeNull();
      expect(await prisma.savedPost.findUnique({ where: { id: savedByB.id } })).toBeNull();

      // Critically, User B's OWN ACCOUNT is entirely untouched — only
      // their engagement with User A's now-deleted post is gone. This is
      // what makes the previous assertions "cross-user cascade" and not
      // "User B was also deleted."
      const stillB = await prisma.user.findUnique({ where: { id: userB.id } });
      expect(stillB).not.toBeNull();
      expect(stillB!.accountStatus).toBe('active');
    });

    it('a Follow relationship cascades in either direction — whether the hard-deleted user is the follower or the followee', async () => {
      const prisma = getTestPrismaClient();
      const deletedAsFollower = await seedPendingDeletionUser('follower-deleted', { pendingDeletionAt: daysAgo(31) });
      const deletedAsFollowee = await seedPendingDeletionUser('followee-deleted', { pendingDeletionAt: daysAgo(31) });
      const bystander = await createActiveUser('bystander');

      const followAsFollower = await prisma.follow.create({
        data: { followerId: deletedAsFollower.id, followeeId: bystander.id },
      });
      const followAsFollowee = await prisma.follow.create({
        data: { followerId: bystander.id, followeeId: deletedAsFollowee.id },
      });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toEqual(
        expect.arrayContaining([deletedAsFollower.id, deletedAsFollowee.id]),
      );
      expect(await prisma.follow.findUnique({ where: { id: followAsFollower.id } })).toBeNull();
      expect(await prisma.follow.findUnique({ where: { id: followAsFollowee.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: bystander.id } })).not.toBeNull();
    });
  });

  // Direct, raw-SQL proof against Postgres's own system catalogs — the
  // "raw SQL" e2e-worthy category test/README.md's guiding principle
  // calls out, and the most authoritative possible confirmation that the
  // migration actually shipped the intended constraint set: not just
  // "these behaviors happen to work," but "these exact FK constraints
  // carry exactly the intended ON DELETE rule," queried the same way
  // account-deletion/README.md's own investigation section did before
  // any code was written.
  describe('Decision Log #44 — direct schema-level proof (Postgres system catalogs, not application behavior)', () => {
    async function getDeleteRule(constraintName: string): Promise<string> {
      const prisma = getTestPrismaClient();
      const rows = await prisma.$queryRaw<{ delete_rule: string }[]>`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name = ${constraintName}
      `;
      return rows[0]?.delete_rule ?? 'CONSTRAINT NOT FOUND';
    }

    it('all fifteen constraints Decision Log #44 resolved (eleven User-referencing tables, plus the three Post-referencing ones needed for cross-user cascade) are genuinely ON DELETE CASCADE in the live database', async () => {
      const cascadedConstraints = [
        'GrassrootsTeam_createdById_fkey',
        'Result_enteredById_fkey',
        'Post_authorId_fkey',
        'Comment_postId_fkey',
        'Comment_authorId_fkey',
        'Message_senderId_fkey',
        'Notification_userId_fkey',
        'SavedPost_userId_fkey',
        'SavedPost_postId_fkey',
        'Like_userId_fkey',
        'Like_postId_fkey',
        'Follow_followerId_fkey',
        'Follow_followeeId_fkey',
        'Report_reporterId_fkey',
        'LeaderboardEntry_userId_fkey',
      ];

      for (const constraintName of cascadedConstraints) {
        expect(await getDeleteRule(constraintName)).toBe('CASCADE');
      }
    });

    it('Guardian.minorUserId is genuinely UNCHANGED — still ON DELETE RESTRICT, confirmed directly, not assumed from this PR\'s own intent', async () => {
      expect(await getDeleteRule('Guardian_minorUserId_fkey')).toBe('RESTRICT');
    });
  });

  describe('purgeExpiredConsentAuditRecords — independent 6-month timer', () => {
    async function seedAuditRecord(createdAt: Date) {
      const prisma = getTestPrismaClient();
      return prisma.consentAuditRecord.create({
        data: {
          minorUserId: randomUUID(),
          consentStatus: 'confirmed',
          consentConfirmedAt: createdAt,
          createdAt,
        },
      });
    }

    it('purges a record whose createdAt is past the 6-month mark', async () => {
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
      const old = await seedAuditRecord(sevenMonthsAgo);

      const result = await sweepService.purgeExpiredConsentAuditRecords();

      expect(result.purgedCount).toBe(1);
      const prisma = getTestPrismaClient();
      expect(await prisma.consentAuditRecord.findUnique({ where: { id: old.id } })).toBeNull();
    });

    it('does NOT purge a record still inside its 6-month window', async () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const recent = await seedAuditRecord(oneMonthAgo);

      const result = await sweepService.purgeExpiredConsentAuditRecords();

      expect(result.purgedCount).toBe(0);
      const prisma = getTestPrismaClient();
      expect(await prisma.consentAuditRecord.findUnique({ where: { id: recent.id } })).not.toBeNull();
    });

    // The core claim of this describe block: this timer runs entirely off
    // ConsentAuditRecord.createdAt, with no dependency whatsoever on any
    // User row (there isn't one — minorUserId here doesn't reference a
    // real, currently-existing user, deliberately, since the record's
    // whole design point is to survive independently of one) or on
    // whether a sweepPendingDeletions() run has ever happened at all.
    it('fires independently of any User/pending_deletion state — no live User row is involved anywhere in this test', async () => {
      const eightMonthsAgo = new Date();
      eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
      const old = await seedAuditRecord(eightMonthsAgo);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.count()).toBe(0);

      const result = await sweepService.purgeExpiredConsentAuditRecords();

      expect(result.purgedCount).toBe(1);
      expect(await prisma.consentAuditRecord.findUnique({ where: { id: old.id } })).toBeNull();
    });
  });
});
