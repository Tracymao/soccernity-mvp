import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Build Plan Section 9, Decision Log #42 (grace period + hard-delete +
// consent-record retention) and Decision Log #44 (what happens to the
// hard-deleted user's other content — cascade). Two independent timers:
//
// 1. A "pending_deletion" account (AuthService.deleteAccount) gets a
//    30-day grace period from User.pendingDeletionAt, then this service
//    hard-deletes the User row -- a real DELETE, not an anonymize/scramble.
//    Per Decision Log #44 (sprint-2/account-deletion-cascade), that
//    single delete now cascades through the user's entire digital
//    footprint on the platform -- Posts, Comments, Follows, Likes,
//    SavedPosts, Notifications, Reports, Messages, LeaderboardEntry rows,
//    and any GrassrootsTeam/Result rows they created -- including
//    cascading away Comment/Like/SavedPost rows OTHER, unrelated users
//    wrote on THIS user's Posts. That is the founder's explicitly stated,
//    accepted consequence of "delete removes your entire footprint," not
//    an oversight -- see account-deletion/README.md.
// 2. Guardian/consent records are the deliberate exception, untouched by
//    Decision Log #44: they don't die with the User row. hardDeleteUser
//    snapshots what's needed to prove consent occurred into
//    ConsentAuditRecord (schema.prisma -- see that model's own comment
//    for why it's a plain userId string, not a foreign key) and deletes
//    the real Guardian row, before the User row itself can be deleted at
//    all (Guardian.minorUserId is ON DELETE RESTRICT against User,
//    confirmed against the real migration SQL, and confirmed still
//    RESTRICT after this PR -- ordering here isn't optional).
//    ConsentAuditRecord.createdAt is that record's OWN 6-month purge
//    clock, independent of whatever happens to the User row afterwards
//    -- Decision Log #42's own "~7 months total from the original
//    delete-account request" math only holds if this second clock
//    starts at hard-delete time, not at the (possibly years-earlier)
//    original consent-confirmation time.
const GRACE_PERIOD_DAYS = 30;
const CONSENT_AUDIT_RETENTION_MONTHS = 6;

export interface SweepPendingDeletionsResult {
  hardDeletedUserIds: string[];
  // sprint-2/account-deletion-cascade — Decision Log #44 is now resolved
  // (cascade, see account-deletion/README.md) and all eleven previously-
  // RESTRICT FKs from Post/Comment/Follow/Like/SavedPost/Notification/
  // Report/Message/LeaderboardEntry/GrassrootsTeam/Result to User are
  // ON DELETE CASCADE. **This should stay empty in normal operation** —
  // it is no longer an expected, routine outcome the way it was under
  // Decision Log #44's original "leave RESTRICT in place" default. See
  // sweepPendingDeletions' own comment for what a non-empty result here
  // actually means now.
  blockedUserIds: string[];
}

export interface PurgeConsentAuditRecordsResult {
  purgedCount: number;
}

@Injectable()
export class AccountDeletionSweepService {
  private readonly logger = new Logger(AccountDeletionSweepService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Scheduled, per this PR's brief — deliberately NOT also exposed as a
  // manually-triggered HTTP endpoint. A destructive, irreversible sweep
  // over every account on the platform has no legitimate reason to be
  // reachable on demand by any caller, including an admin one; the two
  // methods below remain independently callable in-process (tests call
  // them directly, passing an explicit `now` for determinism) without
  // needing @nestjs/schedule or a real clock at all.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runDailySweep(): Promise<void> {
    const deletionResult = await this.sweepPendingDeletions();
    const purgeResult = await this.purgeExpiredConsentAuditRecords();
    this.logger.log(
      `Account deletion sweep complete: hardDeleted=${deletionResult.hardDeletedUserIds.length} ` +
        `blocked=${deletionResult.blockedUserIds.length} consentAuditRecordsPurged=${purgeResult.purgedCount}`,
    );
  }

  // (a) — finds accountStatus = 'pending_deletion' rows past their 30-day
  // mark and hard-deletes each one (snapshotting a ConsentAuditRecord
  // first for any minor with a Guardian row). `now` defaults to the real
  // clock but is an explicit parameter specifically so tests can prove
  // the 30-day boundary without mocking global time.
  //
  // sprint-2/account-deletion-cascade — Decision Log #44 (cascade) is
  // now live: all eleven previously-RESTRICT FKs into User (Post,
  // Comment, Follow x2, Like, SavedPost, Notification, Report, Message,
  // LeaderboardEntry, GrassrootsTeam, Result), plus Comment.post/
  // SavedPost.post/Like.post (needed so a Post cascading away from its
  // author's delete keeps cascading into rows OTHER users wrote on it —
  // see schema.prisma's comments on those three relations and
  // account-deletion/README.md), are now ON DELETE CASCADE. A single
  // `tx.user.delete` below therefore removes a user's entire digital
  // footprint in one statement — no more per-table content handling is
  // needed here, and none should be added; that would just duplicate
  // what the database itself now does. Guardian.minorUserId is the one
  // deliberate exception, still RESTRICT — see hardDeleteUser's own
  // comment for why, and schema.prisma's Guardian model comment.
  async sweepPendingDeletions(now: Date = new Date()): Promise<SweepPendingDeletionsResult> {
    const cutoff = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const dueUsers = await this.prisma.user.findMany({
      where: {
        accountStatus: 'pending_deletion',
        pendingDeletionAt: { lte: cutoff },
      },
      select: { id: true, isMinor: true },
    });

    const hardDeletedUserIds: string[] = [];
    const blockedUserIds: string[] = [];

    for (const user of dueUsers) {
      try {
        await this.hardDeleteUser(user.id, user.isMinor);
        hardDeletedUserIds.push(user.id);
      } catch (err) {
        if (!this.isForeignKeyRestrictError(err)) {
          throw err;
        }
        // Reached only if something in the User→* deletion graph is
        // RESTRICT when Decision Log #44's own resolution says it
        // should now be CASCADE — a schema/migration drift or a newly
        // added table that reintroduced RESTRICT without this service
        // being updated, not a normal, expected outcome the way it was
        // before this PR. Kept as a defensive fallback (so a drift like
        // that fails safe — the account stays in pending_deletion,
        // nothing is silently lost — rather than crashing the whole
        // sweep run for every other due account too), but this branch
        // should never actually fire in normal operation post-cascade.
        // If it does, that is itself the thing to investigate, not a
        // routine "content is blocking this delete" case to shrug off.
        this.logger.warn(
          `Account deletion sweep: user ${user.id} is past its 30-day grace period but hit an ` +
            'unexpected foreign-key-restrict error (P2003) on hard-delete. Decision Log #44 (cascade) ' +
            'means this should not happen — every FK into User except Guardian.minorUserId is now ' +
            'ON DELETE CASCADE. This likely indicates schema drift (a new RESTRICT relation added ' +
            "without updating this service) rather than an expected 'blocked' outcome — investigate " +
            'rather than assume this is routine. Left in pending_deletion, not purged.',
        );
        blockedUserIds.push(user.id);
      }
    }

    return { hardDeletedUserIds, blockedUserIds };
  }

  // One transaction: the ConsentAuditRecord write, the Guardian delete,
  // and the User delete either all happen or none do. Guardian.minorUserId
  // is the one relation Decision Log #44 (cascade) deliberately did NOT
  // touch — it stays ON DELETE RESTRICT (Decision Log #42's own,
  // separate resolution: a Guardian row must be snapshotted into
  // ConsentAuditRecord and explicitly deleted here, never silently
  // cascaded away). That RESTRICT is still real and still load-bearing:
  // without deleting the Guardian row first, `tx.user.delete` below
  // would still fail for any minor with one. Every OTHER FK into User is
  // now CASCADE (see sweepPendingDeletions' own comment), so
  // `tx.user.delete` alone handles all eleven other tables — nothing
  // else needs deleting here. Wrapping this in a transaction still
  // matters for the Guardian/ConsentAuditRecord pairing specifically: if
  // the User delete somehow still fails (the P2003 fallback case above),
  // the Guardian delete and ConsentAuditRecord write already run in this
  // same transaction are rolled back too, so that unexpected case is
  // never left with the Guardian row (or its safeguarding audit trail)
  // already gone while the User row survives.
  private async hardDeleteUser(userId: string, isMinor: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (isMinor) {
        const guardian = await tx.guardian.findUnique({
          where: { minorUserId: userId },
          select: { consentStatus: true, consentTimestamp: true },
        });

        // Not every minor has a Guardian row by the time they reach this
        // sweep (a genuinely rare edge case — e.g. isMinor flipped true
        // by some other path with no guardian-consent flow ever started)
        // — nothing to snapshot or delete in that case, matching this
        // PR's brief: "if the user was ever a minor with a Guardian row."
        if (guardian) {
          await tx.consentAuditRecord.create({
            data: {
              minorUserId: userId,
              consentStatus: guardian.consentStatus,
              consentConfirmedAt: guardian.consentTimestamp,
            },
          });
          await tx.guardian.delete({ where: { minorUserId: userId } });
        }
      }

      await tx.user.delete({ where: { id: userId } });
    });
  }

  // Defensive fallback only — see sweepPendingDeletions' own comment on
  // the catch site. Post-Decision-Log-#44, a real P2003 here signals an
  // inconsistent/drifted schema state, not a routine "this account has
  // related content" case.
  private isForeignKeyRestrictError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003';
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
