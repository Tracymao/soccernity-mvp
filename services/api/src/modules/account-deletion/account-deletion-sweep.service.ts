import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';

// Build Plan Section 9, Decision Log #42 (30-day grace period + consent-
// record retention) as RECONSIDERED by Decision Log #341
// (sprint-2/account-anonymization-reconsideration), which supersedes
// Decision Log #44's cascade resolution and #42's "hard-delete the User
// row" step.
//
// A "pending_deletion" account (AuthService.deleteAccount, an admin
// delete, or a guardian refusal) gets a 30-day grace period from
// User.pendingDeletionAt. At the end of it this service ANONYMIZES the
// User row IN PLACE -- one UPDATE, accountStatus -> 'deleted' -- and
// NEVER runs a literal DELETE on it. Why: the earlier cascade model
// removed OTHER users' Comment/Like/SavedPost rows on a departing user's
// Post as a side effect, a bigger erasure than the principle ("this
// user's own footprint is gone") needs, and than GDPR Art. 17 requires
// (another user's comment is that user's own data). Anonymized data that
// can no longer be attributed to the person falls outside the regulation
// (Recital 26). It is also mechanically far safer: a single UPDATE
// instead of a multi-table cascading delete -- the class of operation
// that produced the Fixture/Result RESTRICT bug.
//
// What anonymizeUser does, in one transaction: overwrite the User row's
// identifying fields; null GrassrootsTeam.createdById on teams they
// organised (the team goes dormant/read-only -- the existing
// createdById !== caller -> 403 checks already do that); delete their
// Follow / Like / SavedPost / Notification rows and their Banter Room /
// Community Group / Club memberships (ephemeral signal, not content)
// keeping Post.likeCount and every memberCount honest; and, for a minor with a
// Guardian row, snapshot into ConsentAuditRecord then delete the
// Guardian row (Decision Log #42, unchanged -- ConsentAuditRecord keeps
// its own 6-month purge clock, measured from anonymization time).
// Post / Comment / Message / Result are untouched: their FKs keep
// pointing at the now-anonymized row, which is the whole point. Report
// rows are NEVER touched -- the moderation audit trail stays intact.
//
// INVESTIGATION HOLD: before anonymizing a due account the sweep checks
// for a non-terminal Report involving them (as reporter, as the reported
// user, or as author of the reported post/comment). If one exists the
// account is SKIPPED this cycle -- still fully identifiable, still
// blocked from login via 'pending_deletion' -- and retried on every
// later run. No "held" flag: it is just a query predicate.
//
// All FKs into User that #44 had flipped to CASCADE are RESTRICT again,
// so an accidental real DELETE FROM "User" fails loudly instead of
// silently cascading.
//
// AdminUsersService.updateUserStatus('deleted') also calls anonymizeUser
// directly (skipping the grace period, and the hold -- the admin has
// explicitly chosen it). The scheduled sweep only ever acts on
// 30-days-past-due "pending_deletion" rows.
//
// GRACE_PERIOD_DAYS is exported so guardian-consent emails can quote the
// real grace period rather than hardcoding it.
export const GRACE_PERIOD_DAYS = 30;
const CONSENT_AUDIT_RETENTION_MONTHS = 6;

// Starting default for "this hold has stalled" -- tunable, a judgment
// call (Decision Log #343-adjacent; see admin-users/README.md).
export const HELD_INVESTIGATION_ALERT_DAYS = 90;

export interface StalledHold {
  userId: string;
  displayName: string;
  email: string;
  heldSince: Date;
  daysHeld: number;
}

export interface SweepPendingDeletionsResult {
  anonymizedUserIds: string[];
  // Due accounts skipped this run because an open moderation Report
  // involves them (see hasOpenInvestigation). Left untouched in
  // pending_deletion and retried on the next run.
  heldUserIds: string[];
}

export interface PurgeConsentAuditRecordsResult {
  purgedCount: number;
}

// What an anonymized User row looks like. The email is deterministic on
// the user's own id, so it is unique with no collision checking.
export const DELETED_USER_DISPLAY_NAME = '[deleted user]';
// Not a valid argon2 PHC string: PasswordService.verify returns false for
// it (it catches the parse error), so it can never authenticate. Defence
// in depth -- accountStatus 'deleted' is the primary login block.
export const UNUSABLE_PASSWORD_HASH = '!anonymized';
export function deletedUserEmail(userId: string): string {
  return `deleted-${userId}@deleted.soccernity.internal`;
}

@Injectable()
export class AccountDeletionSweepService {
  private readonly logger = new Logger(AccountDeletionSweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Scheduled, deliberately NOT also exposed as an HTTP endpoint: an
  // irreversible sweep over every account has no legitimate on-demand
  // caller. The methods stay callable in-process (tests pass an explicit
  // `now`).
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailySweep(): Promise<void> {
    const result = await this.sweepPendingDeletions();
    const purgeResult = await this.purgeExpiredConsentAuditRecords();
    this.logger.log(
      `Account deletion sweep complete: anonymized=${result.anonymizedUserIds.length} ` +
        `heldForInvestigation=${result.heldUserIds.length} consentAuditRecordsPurged=${purgeResult.purgedCount}`,
    );
  }

  // (a) — finds accountStatus = 'pending_deletion' rows past their 30-day
  // mark and anonymizes each one, unless an open investigation holds it.
  // `now` is an explicit parameter so tests can prove the boundary
  // without mocking global time.
  async sweepPendingDeletions(now: Date = new Date()): Promise<SweepPendingDeletionsResult> {
    const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const dueUsers = await this.prisma.user.findMany({
      where: {
        accountStatus: 'pending_deletion',
        pendingDeletionAt: { lte: cutoff },
      },
      select: { id: true, isMinor: true },
    });

    const anonymizedUserIds: string[] = [];
    const heldUserIds: string[] = [];

    for (const user of dueUsers) {
      if (await this.hasOpenInvestigation(user.id)) {
        this.logger.log(`Account deletion sweep: user ${user.id} held -- open moderation report involves them.`);
        heldUserIds.push(user.id);
        continue;
      }
      await this.anonymizeUser(user.id, user.isMinor);
      anonymizedUserIds.push(user.id);
    }

    return { anonymizedUserIds, heldUserIds };
  }

  // True iff a NON-TERMINAL Report involves this user: status 'open', or
  // 'actioned' with an appeal still 'pending' (an overturned appeal
  // flips the report back to 'open', so it is covered by the first
  // case). "Involves" = they are the reporter; or the report targets
  // them directly (targetType 'user'); or it targets a post/comment THEY
  // authored (Report.targetId is a bare string, so the post/comment
  // cases join through Post/Comment.authorId -- Decision Log #341).
  // Raw SQL because Prisma's query builder cannot express the
  // per-targetType correlated EXISTS cleanly.
  async hasOpenInvestigation(userId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ found: number }[]>`
      SELECT 1 AS found
      FROM "Report" r
      WHERE (r."status" = 'open' OR (r."status" = 'actioned' AND r."appealStatus" = 'pending'))
        AND (
          r."reporterId" = ${userId}
          OR (r."targetType" = 'user' AND r."targetId" = ${userId})
          OR (r."targetType" = 'post' AND EXISTS (
                SELECT 1 FROM "Post" p WHERE p."id" = r."targetId" AND p."authorId" = ${userId}))
          OR (r."targetType" = 'comment' AND EXISTS (
                SELECT 1 FROM "Comment" c WHERE c."id" = r."targetId" AND c."authorId" = ${userId}))
        )
      LIMIT 1
    `;
    return rows.length > 0;
  }

  // Accounts currently held by an open investigation for longer than
  // `thresholdDays`. A hold has no maximum duration BY DESIGN (auto-
  // expiring it would undermine evidence integrity), so this is the
  // visibility half: a stalled investigation becomes an admin's problem
  // to chase. Read-only -- never acts on the account. "Held since" is the
  // moment the account first became due for anonymization
  // (pendingDeletionAt + GRACE_PERIOD_DAYS); an account is listed once
  // that moment is more than thresholdDays ago AND it still has an open
  // investigation. Bounded by nature (only accounts with an open report
  // past their grace period), so unpaginated.
  async listStalledHolds(
    thresholdDays: number = HELD_INVESTIGATION_ALERT_DAYS,
    now: Date = new Date(),
  ): Promise<StalledHold[]> {
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoff = new Date(now.getTime() - (GRACE_PERIOD_DAYS + thresholdDays) * dayMs);
    const candidates = await this.prisma.user.findMany({
      where: { accountStatus: 'pending_deletion', pendingDeletionAt: { lte: cutoff } },
      select: { id: true, displayName: true, email: true, pendingDeletionAt: true },
      orderBy: { pendingDeletionAt: 'asc' },
    });
    const stalled: StalledHold[] = [];
    for (const c of candidates) {
      if (!(await this.hasOpenInvestigation(c.id)) || !c.pendingDeletionAt) continue;
      const heldSince = new Date(c.pendingDeletionAt.getTime() + GRACE_PERIOD_DAYS * dayMs);
      stalled.push({
        userId: c.id,
        displayName: c.displayName,
        email: c.email,
        heldSince,
        daysHeld: Math.floor((now.getTime() - heldSince.getTime()) / dayMs),
      });
    }
    return stalled;
  }

  // One transaction -- the whole anonymization happens or none of it
  // does. Public because AdminUsersService calls it directly for an
  // admin-triggered immediate delete; that caller owns its own
  // authorization/confirmation gate. Idempotent: re-running on an
  // already-anonymized row rewrites the same values.
  async anonymizeUser(userId: string, isMinor: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Decision Log #349: no longer gated on isMinor -- a user reclassified
      // as an adult (turned 18) may still hold a Guardian row whose consent
      // proof must be snapshotted and the row removed like any other's.
      // `isMinor` stays in the signature for existing callers.
      void isMinor;
      {
        const guardian = await tx.guardian.findUnique({
          where: { minorUserId: userId },
          select: {
            consentStatus: true,
            consentTimestamp: true,
            consentScreenVersion: true,
            consentDeviceType: true,
            consentVerificationMethod: true,
            consentVerificationAt: true,
          },
        });
        // Not every minor has a Guardian row (rare edge case) -- nothing
        // to snapshot or delete then.
        if (guardian) {
          await tx.consentAuditRecord.create({
            data: {
              minorUserId: userId,
              consentStatus: guardian.consentStatus,
              consentConfirmedAt: guardian.consentTimestamp,
              consentScreenVersion: guardian.consentScreenVersion,
              deviceType: guardian.consentDeviceType,
              // sprint-1/coppa-card-verification
              verificationMethod: guardian.consentVerificationMethod,
              verificationAt: guardian.consentVerificationAt,
            },
          });
          await tx.guardian.delete({ where: { minorUserId: userId } });
        }
      }

      // Removing this user's Likes must keep Post.likeCount honest (it is
      // a denormalized cache, see schema.prisma). Like has
      // @@unique([userId, postId]) so each liked post loses exactly 1.
      await tx.$executeRaw`
        UPDATE "Post" SET "likeCount" = GREATEST("likeCount" - 1, 0)
        WHERE "id" IN (SELECT "postId" FROM "Like" WHERE "userId" = ${userId})
      `;
      await tx.like.deleteMany({ where: { userId } });
      await tx.savedPost.deleteMany({ where: { userId } });
      await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } });
      await tx.notification.deleteMany({ where: { userId } });

      // Membership rows (Banter Rooms, Community Groups, Club pages) are
      // ephemeral participation signal, the same category as Follow/Like,
      // not authored content other users depend on. Deleting them here,
      // at the source, keeps each denormalized memberCount honest: every
      // affected room/group/club loses exactly 1 (each join table is
      // unique per user+target). Same GREATEST(..., 0) floor as likeCount.
      // ClubPage membership is an implicit m2m: "A" = ClubPage.id,
      // "B" = User.id (see ClubsService.joinClub).
      await tx.$executeRaw`
        UPDATE "BanterRoom" SET "memberCount" = GREATEST("memberCount" - 1, 0)
        WHERE "id" IN (SELECT "banterRoomId" FROM "BanterRoomMember" WHERE "userId" = ${userId})
      `;
      await tx.banterRoomMember.deleteMany({ where: { userId } });
      await tx.$executeRaw`
        UPDATE "CommunityGroup" SET "memberCount" = GREATEST("memberCount" - 1, 0)
        WHERE "id" IN (SELECT "communityGroupId" FROM "CommunityGroupMember" WHERE "userId" = ${userId})
      `;
      await tx.communityGroupMember.deleteMany({ where: { userId } });
      await tx.$executeRaw`
        UPDATE "ClubPage" SET "memberCount" = GREATEST("memberCount" - 1, 0)
        WHERE "id" IN (SELECT "A" FROM "_ClubMembership" WHERE "B" = ${userId})
      `;
      await tx.$executeRaw`DELETE FROM "_ClubMembership" WHERE "B" = ${userId}`;

      // Teams they organised go dormant: no organiser, so every
      // createdById-based authorization check fails closed (403).
      await tx.grassrootsTeam.updateMany({ where: { createdById: userId }, data: { createdById: null } });

      await tx.user.update({
        where: { id: userId },
        data: {
          email: deletedUserEmail(userId),
          phone: null,
          displayName: DELETED_USER_DISPLAY_NAME,
          passwordHash: UNUSABLE_PASSWORD_HASH,
          dateOfBirth: null,
          clubAffiliationId: null,
          accountStatus: 'deleted',
          pendingDeletionAt: null,
        },
      });
    });
  }

  // (b) — purges ConsentAuditRecord rows past their OWN 6-month mark,
  // measured from createdAt (hard-delete time — see this file's header
  // comment), entirely independent of any User row's deletion timing.
  // Calendar months (via setUTCMonth), not a fixed day count —
  // deliberately matching Decision Log #42's own "6 months" language
  // rather than converting it into an arbitrary day count that isn't
  // what was actually decided. setUTCMonth specifically, NOT setMonth —
  // a real, caught-by-test bug during this PR: setMonth reads/writes
  // local-time calendar fields, so subtracting 6 months across a
  // Northern-Hemisphere DST boundary (e.g. August BST -> February GMT)
  // silently shifted the computed cutoff by an hour in UTC terms.
  // setUTCMonth operates on UTC calendar fields throughout, which is
  // what this cutoff should mean regardless of the server's local
  // timezone or time of year.
  async purgeExpiredConsentAuditRecords(now: Date = new Date()): Promise<PurgeConsentAuditRecordsResult> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - CONSENT_AUDIT_RETENTION_MONTHS);

    const result = await this.prisma.consentAuditRecord.deleteMany({
      where: { createdAt: { lte: cutoff } },
    });

    return { purgedCount: result.count };
  }
}
