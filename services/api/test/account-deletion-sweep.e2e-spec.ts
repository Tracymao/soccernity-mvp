import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  AccountDeletionSweepService,
  DELETED_USER_DISPLAY_NAME,
  deletedUserEmail,
} from '../src/modules/account-deletion/account-deletion-sweep.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for AccountDeletionSweepService — Decision Log
// #42 (30-day grace + consent-record retention) as RECONSIDERED by
// Decision Log #341 (sprint-2/account-anonymization-reconsideration): at
// the end of the grace period the User row is ANONYMIZED IN PLACE, never
// DELETEd, and an open moderation investigation holds the anonymization.
// Needs real Postgres, not a mock: the RESTRICT foreign keys, the
// transaction's all-or-nothing behaviour, the raw-SQL investigation-hold
// query and likeCount decrement, and "cross-user content survives" are
// all database-level facts a mocked PrismaService cannot exercise.
describe('AccountDeletionSweepService e2e: 30-day anonymize-in-place + investigation hold + 6-month consent-audit purge, against real Postgres', () => {
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
        phone: '+2348100000000',
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Deletion Sweep User ${label}`,
        dateOfBirth: overrides.isMinor ? new Date('2015-01-01') : new Date('1998-07-04'),
        isMinor: overrides.isMinor ?? false,
        accountStatus: 'pending_deletion',
        pendingDeletionAt: overrides.pendingDeletionAt,
      },
    });
  }

  async function createActiveUser(label: string) {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Other User ${label}`,
        dateOfBirth: new Date('1998-07-04'),
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { ...user, accessToken: accessToken.token };
  }

  describe('sweepPendingDeletions — the 30-day grace period boundary', () => {
    it('does NOT anonymize an account that has not yet reached its 30-day mark', async () => {
      const notYetDue = await seedPendingDeletionUser('not-yet-due', { pendingDeletionAt: daysAgo(29) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.anonymizedUserIds).not.toContain(notYetDue.id);
      const stillThere = await getTestPrismaClient().user.findUnique({ where: { id: notYetDue.id } });
      expect(stillThere!.accountStatus).toBe('pending_deletion');
      expect(stillThere!.email).toBe(notYetDue.email);
    });

    it('anonymizes an account past its 30-day mark IN PLACE: the row still exists, every identifying field is overwritten, accountStatus is deleted', async () => {
      const pastDue = await seedPendingDeletionUser('past-due', { pendingDeletionAt: daysAgo(31) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.anonymizedUserIds).toContain(pastDue.id);
      expect(result.heldUserIds).toEqual([]);
      const row = await getTestPrismaClient().user.findUnique({ where: { id: pastDue.id } });
      expect(row).not.toBeNull();
      expect(row!.accountStatus).toBe('deleted');
      expect(row!.email).toBe(deletedUserEmail(pastDue.id));
      expect(row!.displayName).toBe(DELETED_USER_DISPLAY_NAME);
      expect(row!.phone).toBeNull();
      expect(row!.dateOfBirth).toBeNull();
      expect(row!.clubAffiliationId).toBeNull();
      expect(row!.pendingDeletionAt).toBeNull();
      expect(row!.passwordHash).not.toBe(pastDue.passwordHash);
      // Unchanged on purpose: role is inert, isMinor is a safeguarding field.
      expect(row!.role).toBe(pastDue.role);
      expect(row!.isMinor).toBe(pastDue.isMinor);
    });

    it('a single sweep run correctly separates a not-yet-due account from a past-due one, side by side', async () => {
      const notYetDue = await seedPendingDeletionUser('boundary-not-due', { pendingDeletionAt: daysAgo(1) });
      const pastDue = await seedPendingDeletionUser('boundary-past-due', { pendingDeletionAt: daysAgo(30) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.anonymizedUserIds).toContain(pastDue.id);
      expect(result.anonymizedUserIds).not.toContain(notYetDue.id);
      const prisma = getTestPrismaClient();
      expect((await prisma.user.findUnique({ where: { id: pastDue.id } }))!.accountStatus).toBe('deleted');
      expect((await prisma.user.findUnique({ where: { id: notYetDue.id } }))!.accountStatus).toBe('pending_deletion');
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

      expect(result.anonymizedUserIds).toHaveLength(0);
      expect((await prisma.user.findUnique({ where: { id: active.id } }))!.displayName).toBe('Still Active');
      expect((await prisma.user.findUnique({ where: { id: deactivated.id } }))!.displayName).toBe('Deactivated Only');
    });

    it('an anonymized account can no longer log in (real POST /auth/login on the placeholder email -> 401)', async () => {
      const pastDue = await seedPendingDeletionUser('login-blocked', { pendingDeletionAt: daysAgo(31) });
      await sweepService.sweepPendingDeletions();

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: deletedUserEmail(pastDue.id), password: 'anything-at-all' })
        .expect(401);
    });
  });

  describe('sweepPendingDeletions — minors with a Guardian row: ConsentAuditRecord survives, Guardian row is removed', () => {
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

    it('confirmed consent: anonymizes User, deletes Guardian, and a ConsentAuditRecord survives with the confirmed snapshot', async () => {
      const confirmedAt = new Date('2026-06-01T12:00:00.000Z');
      const minor = await seedMinorWithGuardian('confirmed', {
        consentStatus: 'confirmed',
        consentTimestamp: confirmedAt,
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect((await prisma.user.findUnique({ where: { id: minor.id } }))!.accountStatus).toBe('deleted');
      expect(await prisma.guardian.findUnique({ where: { minorUserId: minor.id } })).toBeNull();

      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(1);
      const record = auditRecords[0]!;
      expect(record.consentStatus).toBe('confirmed');
      expect(record.consentConfirmedAt).toEqual(confirmedAt);
      expect(record.consentMethod).toBe('guardian-consent-link');

      // No more PII than necessary — Decision Log #42 rules out a full
      // Guardian mirror; the model has no name/email/relationship columns.
      expect(Object.keys(record).sort()).toEqual(
        [
          'id',
          'minorUserId',
          'consentStatus',
          'consentConfirmedAt',
          'consentMethod',
          'consentScreenVersion',
          'deviceType',
          'verificationMethod',
          'verificationAt',
          'createdAt',
        ].sort(),
      );
      expect(JSON.stringify(record)).not.toContain('Real Guardian Name');
      expect(JSON.stringify(record)).not.toContain('real-guardian-email@example.com');
    });

    it('pending (never-confirmed) consent: still anonymizes and still snapshots — consentConfirmedAt is null', async () => {
      const minor = await seedMinorWithGuardian('pending', { consentStatus: 'pending', consentTimestamp: null });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0]!.consentStatus).toBe('pending');
      expect(auditRecords[0]!.consentConfirmedAt).toBeNull();
    });

    it('a minor past due with no Guardian row at all is anonymized with no ConsentAuditRecord created', async () => {
      const minor = await seedPendingDeletionUser('minor-no-guardian', {
        pendingDeletionAt: daysAgo(31),
        isMinor: true,
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect((await prisma.user.findUnique({ where: { id: minor.id } }))!.accountStatus).toBe('deleted');
      expect(await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } })).toHaveLength(0);
    });
  });

  describe('Decision Log #341 — what anonymization removes and what it deliberately leaves alone', () => {
    it("removes the departing user's own Like / SavedPost / Follow (both directions) / Notification rows, keeps Post.likeCount honest, and leaves their Post / Comment / Message / Result in place", async () => {
      const prisma = getTestPrismaClient();
      const leaver = await seedPendingDeletionUser('leaver', { pendingDeletionAt: daysAgo(31) });
      const other = await createActiveUser('other');

      // Content that must SURVIVE:
      const ownPost = await prisma.post.create({ data: { authorId: leaver.id, contentText: 'my own post' } });
      const ownComment = await prisma.comment.create({
        data: { postId: ownPost.id, authorId: leaver.id, contentText: 'my own comment' },
      });
      const conversation = await prisma.conversation.create({
        data: {
          participantIds: [leaver.id, other.id],
          participantKey: [leaver.id, other.id].sort().join(':'),
        },
      });
      const message = await prisma.message.create({
        data: { conversationId: conversation.id, senderId: leaver.id, contentText: 'hello' },
      });

      // Ephemeral signal that must GO:
      const othersPost = await prisma.post.create({
        data: { authorId: other.id, contentText: "other's post", likeCount: 1 },
      });
      await prisma.like.create({ data: { userId: leaver.id, postId: othersPost.id } });
      await prisma.savedPost.create({ data: { userId: leaver.id, postId: othersPost.id } });
      await prisma.follow.create({ data: { followerId: leaver.id, followeeId: other.id } });
      await prisma.follow.create({ data: { followerId: other.id, followeeId: leaver.id } });
      await prisma.notification.create({
        data: { userId: leaver.id, type: 'follow', payloadRefId: other.id },
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(leaver.id);

      expect(await prisma.like.count({ where: { userId: leaver.id } })).toBe(0);
      expect(await prisma.savedPost.count({ where: { userId: leaver.id } })).toBe(0);
      expect(await prisma.follow.count({ where: { OR: [{ followerId: leaver.id }, { followeeId: leaver.id }] } })).toBe(0);
      expect(await prisma.notification.count({ where: { userId: leaver.id } })).toBe(0);
      // likeCount cache did not drift: the leaver's like is gone, so 1 -> 0.
      expect((await prisma.post.findUnique({ where: { id: othersPost.id } }))!.likeCount).toBe(0);

      expect(await prisma.post.findUnique({ where: { id: ownPost.id } })).not.toBeNull();
      expect(await prisma.comment.findUnique({ where: { id: ownComment.id } })).not.toBeNull();
      expect(await prisma.message.findUnique({ where: { id: message.id } })).not.toBeNull();
      expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
    });

    // THE cross-user test the reconsideration exists for: under the old
    // cascade model User B's comment/like/save on User A's post were
    // deleted as a side effect. Now they must be completely untouched.
    it('CROSS-USER: User A (departing) authored a Post that User B commented on / liked / saved — the Post survives attributed to "[deleted user]" and User B\'s rows are completely untouched', async () => {
      const prisma = getTestPrismaClient();
      const userA = await seedPendingDeletionUser('user-a-author', { pendingDeletionAt: daysAgo(31) });
      const userB = await createActiveUser('user-b-engager');

      const post = await prisma.post.create({
        data: { authorId: userA.id, contentText: "User A's post", likeCount: 1, commentCount: 1 },
      });
      const commentByB = await prisma.comment.create({
        data: { postId: post.id, authorId: userB.id, contentText: "User B's comment on User A's post" },
      });
      const likeByB = await prisma.like.create({ data: { userId: userB.id, postId: post.id } });
      const savedByB = await prisma.savedPost.create({ data: { userId: userB.id, postId: post.id } });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(userA.id);

      // The Post survives, still pointing at User A's (now anonymized) row.
      const survivingPost = await prisma.post.findUnique({
        where: { id: post.id },
        include: { author: { select: { displayName: true, accountStatus: true } } },
      });
      expect(survivingPost).not.toBeNull();
      expect(survivingPost!.authorId).toBe(userA.id);
      expect(survivingPost!.author.displayName).toBe(DELETED_USER_DISPLAY_NAME);
      expect(survivingPost!.author.accountStatus).toBe('deleted');
      expect(survivingPost!.likeCount).toBe(1);

      // User B's rows: byte-for-byte untouched.
      expect(await prisma.comment.findUnique({ where: { id: commentByB.id } })).toEqual(commentByB);
      expect(await prisma.like.findUnique({ where: { id: likeByB.id } })).toEqual(likeByB);
      expect(await prisma.savedPost.findUnique({ where: { id: savedByB.id } })).toEqual(savedByB);
      expect((await prisma.user.findUnique({ where: { id: userB.id } }))!.accountStatus).toBe('active');

      // And through the real HTTP read path: an active user still sees the
      // post (feed visibility allows 'deleted' authors), credited to
      // "[deleted user]".
      const res = await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .expect(200);
      expect(res.body.contentText).toBe("User A's post");
      expect(res.body.author.displayName).toBe(DELETED_USER_DISPLAY_NAME);
    });

    it('a deactivated / pending_deletion author\'s post is still HIDDEN from the feed — only anonymized (deleted) authors\' posts stay visible', async () => {
      const prisma = getTestPrismaClient();
      const pending = await seedPendingDeletionUser('pending-author', { pendingDeletionAt: daysAgo(5) });
      const viewer = await createActiveUser('viewer');
      const post = await prisma.post.create({ data: { authorId: pending.id, contentText: 'hidden while pending' } });

      await request(app.getHttpServer())
        .get(`/posts/${post.id}`)
        .set('Authorization', `Bearer ${viewer.accessToken}`)
        .expect(404);
    });

    it("a Grassroots team the departing user organised goes dormant: createdById becomes null, its fixtures/results survive, and another user's manage attempt is 403 (fails closed, no new guard code)", async () => {
      const prisma = getTestPrismaClient();
      const organiser = await seedPendingDeletionUser('organiser', { pendingDeletionAt: daysAgo(31) });
      const rival = await createActiveUser('rival-organiser');
      const bystander = await createActiveUser('bystander');

      const teamA = await prisma.grassrootsTeam.create({
        data: { name: 'Dormant FC', city: 'Lagos', leagueType: 'informal', createdById: organiser.id },
      });
      const teamB = await prisma.grassrootsTeam.create({
        data: { name: 'Rival FC', city: 'Lagos', leagueType: 'informal', createdById: rival.id },
      });
      const fixture = await prisma.fixture.create({
        data: { teamAId: teamA.id, teamBId: teamB.id, scheduledAt: new Date(Date.now() - 86400000), status: 'full_time' },
      });
      const resultRow = await prisma.result.create({
        data: { fixtureId: fixture.id, scoreA: 2, scoreB: 1, enteredById: organiser.id },
      });

      await sweepService.sweepPendingDeletions();

      expect((await prisma.grassrootsTeam.findUnique({ where: { id: teamA.id } }))!.createdById).toBeNull();
      // Rival's own team is untouched.
      expect((await prisma.grassrootsTeam.findUnique({ where: { id: teamB.id } }))!.createdById).toBe(rival.id);
      expect(await prisma.fixture.findUnique({ where: { id: fixture.id } })).not.toBeNull();
      expect((await prisma.result.findUnique({ where: { id: resultRow.id } }))!.enteredById).toBe(organiser.id);

      // The team page still reads fine...
      await request(app.getHttpServer())
        .get(`/teams/${teamA.id}`)
        .set('Authorization', `Bearer ${bystander.accessToken}`)
        .expect(200);
      // ...but nobody can manage the dormant team.
      await request(app.getHttpServer())
        .post('/fixtures')
        .set('Authorization', `Bearer ${bystander.accessToken}`)
        .send({ teamAId: teamA.id, scheduledAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(403);
      await request(app.getHttpServer())
        .post('/fixtures')
        .set('Authorization', `Bearer ${rival.accessToken}`)
        .send({ teamAId: teamA.id, scheduledAt: new Date(Date.now() + 86400000).toISOString() })
        .expect(403);
    });
  });

  // The core new mechanic. Every case proves the account is left FULLY
  // IDENTIFIABLE while held, then that a later run anonymizes once the
  // report reaches a terminal state.
  describe('Decision Log #341 — investigation hold', () => {
    async function seedReport(over: {
      reporterId: string;
      targetType: 'user' | 'post' | 'comment';
      targetId: string;
      status?: string;
      appealStatus?: string | null;
    }) {
      return getTestPrismaClient().report.create({
        data: {
          reporterId: over.reporterId,
          targetType: over.targetType,
          targetId: over.targetId,
          reason: 'e2e hold test',
          status: over.status ?? 'open',
          appealStatus: over.appealStatus ?? null,
        },
      });
    }

    async function expectHeld(userId: string, original: { email: string; displayName: string }) {
      const row = await getTestPrismaClient().user.findUnique({ where: { id: userId } });
      expect(row!.accountStatus).toBe('pending_deletion');
      expect(row!.email).toBe(original.email);
      expect(row!.displayName).toBe(original.displayName);
      expect(row!.dateOfBirth).not.toBeNull();
    }

    it('open report AGAINST the user: held (row untouched, still identifiable) across repeated runs; resolving the report lets the next run anonymize', async () => {
      const prisma = getTestPrismaClient();
      const subject = await seedPendingDeletionUser('held-subject', { pendingDeletionAt: daysAgo(45) });
      const reporter = await createActiveUser('the-reporter');
      const report = await seedReport({ reporterId: reporter.id, targetType: 'user', targetId: subject.id });

      const first = await sweepService.sweepPendingDeletions();
      expect(first.heldUserIds).toEqual([subject.id]);
      expect(first.anonymizedUserIds).not.toContain(subject.id);
      await expectHeld(subject.id, subject);

      // Still held on a later run (retried every sweep, no bookkeeping).
      const second = await sweepService.sweepPendingDeletions();
      expect(second.heldUserIds).toEqual([subject.id]);
      await expectHeld(subject.id, subject);

      // Resolve the report -> terminal -> next run anonymizes.
      await prisma.report.update({ where: { id: report.id }, data: { status: 'actioned' } });
      const third = await sweepService.sweepPendingDeletions();
      expect(third.heldUserIds).toEqual([]);
      expect(third.anonymizedUserIds).toContain(subject.id);
      const row = await prisma.user.findUnique({ where: { id: subject.id } });
      expect(row!.accountStatus).toBe('deleted');
      expect(row!.displayName).toBe(DELETED_USER_DISPLAY_NAME);

      // The Report row is never touched: reporter and target still resolve.
      const kept = await prisma.report.findUnique({ where: { id: report.id } });
      expect(kept!.reporterId).toBe(reporter.id);
      expect(kept!.targetId).toBe(subject.id);
    });

    it('open report FILED BY the user (they are the reporter): held', async () => {
      const subject = await seedPendingDeletionUser('held-reporter', { pendingDeletionAt: daysAgo(45) });
      const target = await createActiveUser('reported-by-subject');
      await seedReport({ reporterId: subject.id, targetType: 'user', targetId: target.id });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.heldUserIds).toEqual([subject.id]);
      await expectHeld(subject.id, subject);
    });

    it("open report against the user's POST (not their profile): held — the join through Post.authorId", async () => {
      const prisma = getTestPrismaClient();
      const subject = await seedPendingDeletionUser('held-post-author', { pendingDeletionAt: daysAgo(45) });
      const reporter = await createActiveUser('post-reporter');
      const post = await prisma.post.create({ data: { authorId: subject.id, contentText: 'reported post' } });
      await seedReport({ reporterId: reporter.id, targetType: 'post', targetId: post.id });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.heldUserIds).toEqual([subject.id]);
      await expectHeld(subject.id, subject);
    });

    it("open report against the user's COMMENT: held — the join through Comment.authorId", async () => {
      const prisma = getTestPrismaClient();
      const subject = await seedPendingDeletionUser('held-comment-author', { pendingDeletionAt: daysAgo(45) });
      const reporter = await createActiveUser('comment-reporter');
      const someoneElse = await createActiveUser('post-owner');
      const post = await prisma.post.create({ data: { authorId: someoneElse.id, contentText: 'p' } });
      const comment = await prisma.comment.create({
        data: { postId: post.id, authorId: subject.id, contentText: 'reported comment' },
      });
      await seedReport({ reporterId: reporter.id, targetType: 'comment', targetId: comment.id });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.heldUserIds).toEqual([subject.id]);
      await expectHeld(subject.id, subject);
    });

    it("an actioned report with a PENDING appeal still holds; once the appeal is decided the hold lifts", async () => {
      const prisma = getTestPrismaClient();
      const subject = await seedPendingDeletionUser('held-appeal', { pendingDeletionAt: daysAgo(45) });
      const reporter = await createActiveUser('appeal-reporter');
      const report = await seedReport({
        reporterId: reporter.id,
        targetType: 'user',
        targetId: subject.id,
        status: 'actioned',
        appealStatus: 'pending',
      });

      expect((await sweepService.sweepPendingDeletions()).heldUserIds).toEqual([subject.id]);
      await expectHeld(subject.id, subject);

      await prisma.report.update({ where: { id: report.id }, data: { appealStatus: 'upheld' } });
      const after = await sweepService.sweepPendingDeletions();
      expect(after.anonymizedUserIds).toContain(subject.id);
    });

    it('terminal reports do NOT hold: dismissed (reviewed), actioned with no appeal, and actioned with a decided appeal', async () => {
      const subject = await seedPendingDeletionUser('not-held', { pendingDeletionAt: daysAgo(45) });
      const reporter = await createActiveUser('terminal-reporter');
      await seedReport({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'reviewed' });
      await seedReport({ reporterId: reporter.id, targetType: 'user', targetId: subject.id, status: 'actioned' });
      await seedReport({
        reporterId: reporter.id,
        targetType: 'user',
        targetId: subject.id,
        status: 'actioned',
        appealStatus: 'upheld',
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.heldUserIds).toEqual([]);
      expect(result.anonymizedUserIds).toContain(subject.id);
    });

    it('an open report about an UNRELATED user does not hold this one', async () => {
      const subject = await seedPendingDeletionUser('unrelated', { pendingDeletionAt: daysAgo(45) });
      const a = await createActiveUser('unrelated-a');
      const b = await createActiveUser('unrelated-b');
      await seedReport({ reporterId: a.id, targetType: 'user', targetId: b.id });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(subject.id);
    });
  });

  // Raw-SQL proof against Postgres's own catalogs: the FK delete rules are
  // what actually make an accidental `DELETE FROM "User"` fail loudly.
  describe('Decision Log #341 — schema-level proof (Postgres system catalogs, not application behaviour)', () => {
    async function getDeleteRule(constraintName: string): Promise<string> {
      const rows = await getTestPrismaClient().$queryRaw<{ delete_rule: string }[]>`
        SELECT rc.delete_rule
        FROM information_schema.referential_constraints rc
        WHERE rc.constraint_name = ${constraintName}
      `;
      return rows[0]?.delete_rule ?? 'CONSTRAINT NOT FOUND';
    }

    it('all fifteen constraints Decision Log #44 had flipped to CASCADE are RESTRICT again in the live database', async () => {
      const restricted = [
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
      for (const name of restricted) {
        expect(await getDeleteRule(name)).toBe('RESTRICT');
      }
    });

    it('Guardian.minorUserId is still ON DELETE RESTRICT (unchanged)', async () => {
      expect(await getDeleteRule('Guardian_minorUserId_fkey')).toBe('RESTRICT');
    });

    it('a literal DELETE FROM "User" for a user with a Post now FAILS LOUDLY instead of cascading — and the post survives', async () => {
      const prisma = getTestPrismaClient();
      const author = await seedPendingDeletionUser('accidental-delete', { pendingDeletionAt: daysAgo(31) });
      const post = await prisma.post.create({ data: { authorId: author.id, contentText: 'must survive' } });

      await expect(prisma.user.delete({ where: { id: author.id } })).rejects.toThrow();

      expect(await prisma.user.findUnique({ where: { id: author.id } })).not.toBeNull();
      expect(await prisma.post.findUnique({ where: { id: post.id } })).not.toBeNull();
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

  describe('membership cleanup + stalled-hold visibility (sprint-2/anonymization-followups)', () => {
    it('deletes Banter/Group/Club membership rows and leaves each memberCount exactly one lower, other members untouched', async () => {
      const prisma = getTestPrismaClient();
      const leaver = await seedPendingDeletionUser('leaver', { pendingDeletionAt: daysAgo(31) });
      const other = await createActiveUser('other');

      const room = await prisma.banterRoom.create({
        data: { name: 'Room', scopeType: 'topic', createdBy: other.id, memberCount: 2 },
      });
      await prisma.banterRoomMember.createMany({
        data: [
          { userId: leaver.id, banterRoomId: room.id },
          { userId: other.id, banterRoomId: room.id },
        ],
      });
      const group = await prisma.communityGroup.create({
        data: { name: 'G', nameNormalized: `g-${Date.now()}`, city: 'Lagos', createdById: other.id, memberCount: 2 },
      });
      await prisma.communityGroupMember.createMany({
        data: [
          { userId: leaver.id, communityGroupId: group.id },
          { userId: other.id, communityGroupId: group.id },
        ],
      });
      const club = await prisma.clubPage.create({ data: { name: 'C', memberCount: 2 } });
      await prisma.$executeRaw`INSERT INTO "_ClubMembership" ("A", "B") VALUES (${club.id}, ${leaver.id}), (${club.id}, ${other.id})`;

      await sweepService.sweepPendingDeletions();

      expect((await prisma.banterRoom.findUnique({ where: { id: room.id } }))!.memberCount).toBe(1);
      expect((await prisma.communityGroup.findUnique({ where: { id: group.id } }))!.memberCount).toBe(1);
      expect((await prisma.clubPage.findUnique({ where: { id: club.id } }))!.memberCount).toBe(1);
      expect(await prisma.banterRoomMember.count({ where: { userId: leaver.id } })).toBe(0);
      expect(await prisma.communityGroupMember.count({ where: { userId: leaver.id } })).toBe(0);
      const clubRows = await prisma.$queryRaw<{ B: string }[]>`SELECT "B" FROM "_ClubMembership" WHERE "A" = ${club.id}`;
      expect(clubRows.map((r) => r.B)).toEqual([other.id]);
      expect(await prisma.banterRoomMember.count({ where: { userId: other.id } })).toBe(1);
    });

    it('listStalledHolds lists a hold older than the threshold, omits a fresh hold and a non-held account', async () => {
      const prisma = getTestPrismaClient();
      const reporter = await createActiveUser('reporter');
      // due 130 days ago (pendingDeletionAt 160d ago) -> held ~130d
      const stale = await seedPendingDeletionUser('stale', { pendingDeletionAt: daysAgo(160) });
      // due 10 days ago -> held ~10d
      const fresh = await seedPendingDeletionUser('fresh', { pendingDeletionAt: daysAgo(40) });
      // old but no open report
      await seedPendingDeletionUser('noreport', { pendingDeletionAt: daysAgo(200) });
      for (const u of [stale, fresh]) {
        await prisma.report.create({
          data: { reporterId: reporter.id, targetType: 'user', targetId: u.id, reason: 'e2e', status: 'open' },
        });
      }

      const out = await sweepService.listStalledHolds(90);

      expect(out.map((h) => h.userId)).toEqual([stale.id]);
      expect(out[0].daysHeld).toBeGreaterThanOrEqual(129);
      // read-only: still pending_deletion, untouched
      expect((await prisma.user.findUnique({ where: { id: stale.id } }))!.accountStatus).toBe('pending_deletion');
    });
  });
});
