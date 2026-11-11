import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  addUtcMonths,
  resolveReportAppealWindowDays,
} from '../account-hold/account-hold.config';
import { findActiveAccountHold, reportClosedAt } from '../account-hold/account-hold.rules';
import {
  recordDeferrals,
  removedMediaDeletableNow,
  RemovedMediaItem,
} from '../post-media/rejected-media-evidence.util';
import {
  readReportRetentionConfig,
  REPORT_RETENTION_MAX_PER_RUN,
  REPORT_RETENTION_PAGE_SIZE,
  ReportRetentionConfig,
  retentionMonthsFor,
} from './report-retention.config';
import { resolveReportedUserId } from './report-target.util';

// backend/b294-report-retention (B-294; Decision Log #487, founder decision of 2026-11-11).
//
// A daily sweep that deletes a report once it has been CLOSED for REPORT_RETENTION_MONTHS (default 12), or for
// REPORT_RETENTION_CONCERNS_MINOR_YEARS (default 6) when Report.concernsMinor is true, together with the content
// the report removed (B-289). "Closed" is reportClosedAt (account-hold.rules.ts): the one computed closure moment
// (there is no column and no event) -- dismissed: reviewedAt; actioned with no appeal: reviewedAt + the appeal
// window; appeal upheld: appealReviewedAt. An open report (including one reopened by an overturned appeal) or one
// with an appeal pending has no closure and is never due. The period is anchored to that result and measured in
// calendar months (setUTCMonth, the convention of the other retention jobs); a report is due STRICTLY after
// closure + period.
//
// A REPORT IS SKIPPED (kept, with its content, retried next run) while any of these holds:
//   - an ACTIVE legal_hold or bad_faith hold (findActiveAccountHold, the one read of that rule) is on the
//     reporter, on the account behind the target (resolveReportedUserId), or, for a message report, on the
//     reported message's sender or any other participant of its conversation;
//   - the report has been ESCALATED (Report.escalatedAt) -- until counsel answers B-206;
//   - the removed post's media is not deletable now (removedMediaDeletableNow, the B-206 hook: if that function
//     says keep, the whole report is kept);
//   - ANOTHER report that is not yet closed targets an item this deletion would destroy (the removed item, or for
//     a removed post the comments under it): the same principle as postsWithUnclosedReport in the media rule.
//
// A REPORT IS BLOCKED (kept; the finding is logged as a COUNT per kind and listed in the PR) when a record outside
// the deletion list depends on it or on an item, and no rule says what to do with that record. Nothing is invented:
//   - hold_record               an AccountHold row (lifted or expired) still references the report (a RESTRICT FK);
//   - contact_enquiry           a ContactEnquiry was escalated into this report (a RESTRICT FK);
//   - contest_entry             the removed post is a Contest entry (deleting it would delete votes, winners and
//                               impressions with it);
//   - context_of_other_report   a removed message is attached as context to a DIFFERENT report (a RESTRICT FK).
//
// WHEN A REPORT IS DUE AND NOT SKIPPED OR BLOCKED, in this order, in ONE Serializable transaction:
//   1. the content the report removed (Post / Comment / Message rows with removedByReportId = this report) together
//      with the rows that exist only because of that item -- for a post: its PostMedia rows (a deferral record is
//      written for every stored object), Hashtag.postCount decrements, the like/comment notifications that point
//      at it, and (by cascade) its comments, likes, saves, views, hashtag links and media reports; for a message:
//      its MessageHide rows (cascade) and, if the conversation is then empty, the conversation (as the message
//      retention job does);
//   2. the ReportContextMessage rows of this report (the context messages themselves STAY and fall to the normal
//      message retention);
//   3. the report.
// Everything is re-checked inside the transaction (a hold placed or a report filed since the scan stops it).
// The stored objects are deleted only AFTER the commit, through the existing deferred-deletion pattern: the record is
// written in the transaction, the object is deleted afterwards and the record removed on success, so a failed delete
// is retried by RejectedMediaSweepService.processDeferred and is never lost.
//
// NEVER TOUCHED: AdminActionLog; PointsLedgerEntry (earned points stay, Decision Log #483); the moderation_decision
// Notification rows that point at the report (they already degrade to a generic row); the context messages.
// User.suspendedByReportId is ON DELETE SET NULL, so a still-suspended account stays suspended and simply loses the
// link (a manual reinstatement is then the only way back; the appeal window has closed by definition).
//
// Cron discipline copied from MessageRetentionService: daily, 6-field cron, oldest first, counts only in the log
// (never an id, name or text), `now` injectable. 04:15 -- after the 04:00 message retention.

export interface PurgeReportsResult {
  /** Candidates examined (closed long enough to be due on the cheap pre-filter). */
  examined: number;
  deletedReports: number;
  deletedPosts: number;
  deletedComments: number;
  deletedMessages: number;
  deletedConversations: number;
  /** Stored objects whose delete failed after commit; their deferral records stay and are retried. */
  objectDeletesFailed: number;
  skippedEscalated: number;
  skippedHold: number;
  skippedMedia: number;
  skippedOtherReportOpen: number;
  blockedHoldRecord: number;
  blockedContactEnquiry: number;
  blockedContestEntry: number;
  blockedContextOfOtherReport: number;
  /** A serialization conflict or a report that changed under us; retried next run. */
  retryLater: number;
  /** More reports were due than REPORT_RETENTION_MAX_PER_RUN; the rest wait for the next run. */
  capped: boolean;
}

type Db = Prisma.TransactionClient;

interface Candidate {
  id: string;
  targetType: string;
  targetId: string;
  reporterId: string | null;
  concernsMinor: boolean;
  status: string;
  appealStatus: string | null;
  reviewedAt: Date | null;
  appealReviewedAt: Date | null;
  escalatedAt: Date | null;
}

type SkipReason = 'escalated' | 'hold' | 'media' | 'other_report_open';
type BlockReason = 'hold_record' | 'contact_enquiry' | 'contest_entry' | 'context_of_other_report';
type Outcome =
  | { kind: 'delete' }
  | { kind: 'not_due' }
  | { kind: 'skip'; reason: SkipReason }
  | { kind: 'blocked'; reason: BlockReason };

interface Plan {
  postIds: string[];
  commentIds: string[];
  messageIds: string[];
}

const CANDIDATE_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  reporterId: true,
  concernsMinor: true,
  status: true,
  appealStatus: true,
  reviewedAt: true,
  appealReviewedAt: true,
  escalatedAt: true,
} as const;

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function emptyResult(): PurgeReportsResult {
  return {
    examined: 0,
    deletedReports: 0,
    deletedPosts: 0,
    deletedComments: 0,
    deletedMessages: 0,
    deletedConversations: 0,
    objectDeletesFailed: 0,
    skippedEscalated: 0,
    skippedHold: 0,
    skippedMedia: 0,
    skippedOtherReportOpen: 0,
    blockedHoldRecord: 0,
    blockedContactEnquiry: 0,
    blockedContestEntry: 0,
    blockedContextOfOtherReport: 0,
    retryLater: 0,
    capped: false,
  };
}

@Injectable()
export class ReportRetentionService {
  private readonly logger = new Logger(ReportRetentionService.name);
  private readonly cfg: ReportRetentionConfig;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
    // Optional so the cron still loads where no object store is wired; the deferral records then wait for one.
    @Optional() private readonly storage?: StorageService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {
    this.cfg = readReportRetentionConfig({ get: (k) => config.get<string>(k) });
  }

  @Cron('0 15 4 * * *')
  async runDailyPurge(): Promise<void> {
    try {
      const r = await this.purgeDue(this.clock.now());
      this.logger.log(
        `Report retention complete: examined=${r.examined} reports=${r.deletedReports} posts=${r.deletedPosts} ` +
          `comments=${r.deletedComments} messages=${r.deletedMessages} conversations=${r.deletedConversations} ` +
          `objectDeletesFailed=${r.objectDeletesFailed} skipped(escalated=${r.skippedEscalated} hold=${r.skippedHold} ` +
          `media=${r.skippedMedia} otherReportOpen=${r.skippedOtherReportOpen}) blocked(holdRecord=${r.blockedHoldRecord} ` +
          `contactEnquiry=${r.blockedContactEnquiry} contestEntry=${r.blockedContestEntry} ` +
          `contextOfOtherReport=${r.blockedContextOfOtherReport}) retryLater=${r.retryLater} capped=${r.capped}`,
      );
    } catch (err) {
      this.logger.error(`Report retention failed (${msg(err)}); it will run again tomorrow.`);
    }
  }

  async purgeDue(now: Date = this.clock.now()): Promise<PurgeReportsResult> {
    const result = emptyResult();
    const appealWindowDays = resolveReportAppealWindowDays();
    // A report cannot be due before reviewedAt + the SHORTER of the two periods, so this is a safe SQL pre-filter.
    // The exact test (closure moment, own period) is applied per report below.
    const shortest = Math.min(this.cfg.months, this.cfg.concernsMinorYears * 12);
    const prefilter = addUtcMonths(now, -shortest);

    let after: { reviewedAt: Date; id: string } | null = null;
    for (;;) {
      const page: Candidate[] = await this.prisma.report.findMany({
        where: {
          status: { in: ['reviewed', 'actioned'] },
          reviewedAt: { not: null, lt: prefilter },
          ...(after
            ? { OR: [{ reviewedAt: { gt: after.reviewedAt } }, { reviewedAt: after.reviewedAt, id: { gt: after.id } }] }
            : {}),
        },
        select: CANDIDATE_SELECT,
        orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }],
        take: REPORT_RETENTION_PAGE_SIZE,
      });
      if (page.length === 0) return result;
      const last = page[page.length - 1];
      after = { reviewedAt: last.reviewedAt as Date, id: last.id };

      for (const candidate of page) {
        if (result.deletedReports >= REPORT_RETENTION_MAX_PER_RUN) {
          result.capped = true;
          return result;
        }
        result.examined += 1;
        const { outcome } = await this.evaluate(this.prisma, candidate, now, appealWindowDays);
        if (outcome.kind !== 'delete') {
          this.count(result, outcome);
          continue;
        }
        const done = await this.deleteOne(candidate.id, now, appealWindowDays, result);
        if (done) result.deletedReports += 1;
      }
      if (page.length < REPORT_RETENTION_PAGE_SIZE) return result;
    }
  }

  private count(result: PurgeReportsResult, outcome: Outcome): void {
    if (outcome.kind === 'skip') {
      if (outcome.reason === 'escalated') result.skippedEscalated += 1;
      else if (outcome.reason === 'hold') result.skippedHold += 1;
      else if (outcome.reason === 'media') result.skippedMedia += 1;
      else result.skippedOtherReportOpen += 1;
    } else if (outcome.kind === 'blocked') {
      if (outcome.reason === 'hold_record') result.blockedHoldRecord += 1;
      else if (outcome.reason === 'contact_enquiry') result.blockedContactEnquiry += 1;
      else if (outcome.reason === 'contest_entry') result.blockedContestEntry += 1;
      else result.blockedContextOfOtherReport += 1;
    }
  }

  // ---- the decision (read only; runs once outside and once inside the delete transaction) ----------------

  private async evaluate(
    db: Db,
    r: Candidate,
    now: Date,
    appealWindowDays: number,
  ): Promise<{ outcome: Outcome; plan: Plan }> {
    const plan: Plan = { postIds: [], commentIds: [], messageIds: [] };

    // 1. due? The closure moment is the existing computed predicate; an open / appeal-pending report has none.
    const closure = reportClosedAt(r, appealWindowDays);
    if (closure === null) return { outcome: { kind: 'not_due' }, plan };
    const dueAt = addUtcMonths(closure, retentionMonthsFor(r, this.cfg));
    if (now.getTime() <= dueAt.getTime()) return { outcome: { kind: 'not_due' }, plan };

    // 2. escalated: kept until counsel answers B-206.
    if (r.escalatedAt !== null) return { outcome: { kind: 'skip', reason: 'escalated' }, plan };

    // 3. what this report removed.
    const [posts, comments, messages] = await Promise.all([
      db.post.findMany({ where: { removedByReportId: r.id }, select: { id: true } }),
      db.comment.findMany({ where: { removedByReportId: r.id }, select: { id: true } }),
      db.message.findMany({ where: { removedByReportId: r.id }, select: { id: true } }),
    ]);
    plan.postIds = posts.map((p) => p.id);
    plan.commentIds = comments.map((c) => c.id);
    plan.messageIds = messages.map((m) => m.id);

    // 4. an active admin hold on anyone involved.
    for (const userId of await this.involvedUserIds(db, r)) {
      if (await findActiveAccountHold(db, userId, now)) return { outcome: { kind: 'skip', reason: 'hold' }, plan };
    }

    // 5. records outside the deletion list that depend on the report or on an item: kept, counted, reported.
    if ((await db.accountHold.count({ where: { reportId: r.id } })) > 0) {
      return { outcome: { kind: 'blocked', reason: 'hold_record' }, plan };
    }
    if ((await db.contactEnquiry.count({ where: { escalatedReportId: r.id } })) > 0) {
      return { outcome: { kind: 'blocked', reason: 'contact_enquiry' }, plan };
    }
    if (plan.postIds.length > 0 && (await db.contestEntry.count({ where: { postId: { in: plan.postIds } } })) > 0) {
      return { outcome: { kind: 'blocked', reason: 'contest_entry' }, plan };
    }
    if (
      plan.messageIds.length > 0 &&
      (await db.reportContextMessage.count({ where: { messageId: { in: plan.messageIds }, reportId: { not: r.id } } })) > 0
    ) {
      return { outcome: { kind: 'blocked', reason: 'context_of_other_report' }, plan };
    }

    // 6. another report, not yet closed, on something this deletion destroys.
    if (await this.otherUnclosedReport(db, r.id, plan, now, appealWindowDays)) {
      return { outcome: { kind: 'skip', reason: 'other_report_open' }, plan };
    }

    // 7. the private copy kept of a removed post's media (B-290). The B-206 hook lives in removedMediaDeletableNow.
    if (plan.postIds.length > 0) {
      const media = await db.postMedia.findMany({
        where: { postId: { in: plan.postIds }, privateKey: { not: null } },
        select: { id: true, uploaderId: true, postId: true, privateKey: true },
      });
      const items: RemovedMediaItem[] = media.map((m) => ({
        mediaId: m.id,
        uploaderId: m.uploaderId,
        postId: m.postId,
        key: m.privateKey as string,
        removingReportId: r.id,
      }));
      const { waiting } = await removedMediaDeletableNow(db, items, now, appealWindowDays);
      if (waiting.length > 0) return { outcome: { kind: 'skip', reason: 'media' }, plan };
    }

    return { outcome: { kind: 'delete' }, plan };
  }

  // The reporter, the account behind the target and, for a message report, the sender and every participant of the
  // conversation. (A removed message is always the reported one, so its participants are covered the same way.)
  private async involvedUserIds(db: Db, r: Candidate): Promise<string[]> {
    const ids = new Set<string>();
    if (r.reporterId) ids.add(r.reporterId);
    const behind = await resolveReportedUserId(db, r.targetType, r.targetId);
    if (behind) ids.add(behind);
    if (r.targetType === 'message') {
      const m = await db.message.findUnique({
        where: { id: r.targetId },
        select: { senderId: true, conversation: { select: { participantIds: true } } },
      });
      if (m) {
        ids.add(m.senderId);
        for (const p of m.conversation.participantIds) ids.add(p);
      }
    }
    return [...ids];
  }

  // True when a report other than this one, and not yet closed, targets the removed item or, for a removed post,
  // one of the comments under it (the comments go with the post by cascade).
  private async otherUnclosedReport(
    db: Db,
    reportId: string,
    plan: Plan,
    now: Date,
    appealWindowDays: number,
  ): Promise<boolean> {
    const clauses: Prisma.ReportWhereInput[] = [];
    if (plan.postIds.length > 0) clauses.push({ targetType: 'post', targetId: { in: plan.postIds } });
    if (plan.commentIds.length > 0) clauses.push({ targetType: 'comment', targetId: { in: plan.commentIds } });
    if (plan.messageIds.length > 0) clauses.push({ targetType: 'message', targetId: { in: plan.messageIds } });

    const rows: Pick<Candidate, 'status' | 'appealStatus' | 'reviewedAt' | 'appealReviewedAt'>[] = [];
    if (clauses.length > 0) {
      rows.push(
        ...(await db.report.findMany({
          where: { id: { not: reportId }, OR: clauses },
          select: { status: true, appealStatus: true, reviewedAt: true, appealReviewedAt: true },
        })),
      );
    }
    if (plan.postIds.length > 0) {
      rows.push(
        ...(await db.$queryRaw<Pick<Candidate, 'status' | 'appealStatus' | 'reviewedAt' | 'appealReviewedAt'>[]>`
          SELECT r."status", r."appealStatus", r."reviewedAt", r."appealReviewedAt"
          FROM "Report" r JOIN "Comment" c ON c."id" = r."targetId"
          WHERE r."targetType" = 'comment' AND r."id" <> ${reportId} AND c."postId" = ANY(${plan.postIds}::text[])`),
      );
    }
    return rows.some((o) => {
      const closure = reportClosedAt(o, appealWindowDays);
      return closure === null || now.getTime() < closure.getTime();
    });
  }

  // ---- the deletion --------------------------------------------------------------------------------------

  private async deleteOne(
    reportId: string,
    now: Date,
    appealWindowDays: number,
    result: PurgeReportsResult,
  ): Promise<boolean> {
    let objectKeys: string[] = [];
    let counts = { posts: 0, comments: 0, messages: 0, conversations: 0 };
    try {
      const outcome = await this.prisma.$transaction(
        async (tx) => {
          const fresh = await tx.report.findUnique({ where: { id: reportId }, select: CANDIDATE_SELECT });
          if (!fresh) return { kind: 'not_due' } as Outcome;
          const { outcome: o, plan } = await this.evaluate(tx, fresh, now, appealWindowDays);
          if (o.kind !== 'delete') return o;
          const applied = await this.applyDeletion(tx, fresh.id, plan);
          objectKeys = applied.keys;
          counts = applied.counts;
          return o;
        },
        // The default 5 s is too short for a post with thousands of comments to cascade.
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000, maxWait: 10_000 },
      );
      if (outcome.kind !== 'delete') {
        // It changed since the scan (a hold, a new report, an appeal): kept, retried next run.
        this.count(result, outcome);
        result.retryLater += outcome.kind === 'not_due' ? 1 : 0;
        return false;
      }
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2034' || err.code === 'P2003')) {
        // P2034: serialization conflict; P2003: a foreign key we did not anticipate. Kept, retried next run, and
        // the second is logged because it is a finding (a record that depends on the item and is not on the list).
        result.retryLater += 1;
        if (err.code === 'P2003') {
          this.logger.warn('Report retention: a deletion was refused by an unexpected foreign key; the report is kept (finding).');
        }
        return false;
      }
      throw err;
    }

    result.deletedPosts += counts.posts;
    result.deletedComments += counts.comments;
    result.deletedMessages += counts.messages;
    result.deletedConversations += counts.conversations;
    result.objectDeletesFailed += await this.deleteObjectsAfterCommit(objectKeys);
    return true;
  }

  private async applyDeletion(
    tx: Db,
    reportId: string,
    plan: Plan,
  ): Promise<{ keys: string[]; counts: { posts: number; comments: number; messages: number; conversations: number } }> {
    const counts = { posts: 0, comments: 0, messages: 0, conversations: 0 };
    const keys: string[] = [];

    // 1a. posts (media rows first: a deferral record per stored object is written in this transaction).
    for (const postId of plan.postIds) {
      const media = await tx.postMedia.findMany({
        where: { postId },
        select: { id: true, uploaderId: true, publishedAt: true, publicKey: true, privateKey: true, quarantineKey: true },
      });
      const items: { mediaId: string; uploaderId: string; postId: string; key: string }[] = [];
      for (const m of media) {
        const mediaKeys = [m.publishedAt ? m.publicKey : null, m.privateKey, m.quarantineKey].filter((k): k is string => !!k);
        for (const key of mediaKeys) items.push({ mediaId: m.id, uploaderId: m.uploaderId, postId, key });
      }
      await recordDeferrals(tx, items);
      keys.push(...items.map((i) => i.key));

      // The like-count of a hashtag follows its links, which the post delete cascades away (as FeedService.deletePost).
      const links = await tx.postHashtag.findMany({ where: { postId }, select: { hashtagId: true } });
      for (const { hashtagId } of links) {
        await tx.hashtag.updateMany({ where: { id: hashtagId, postCount: { gt: 0 } }, data: { postCount: { decrement: 1 } } });
      }
      // Notifications that exist only because of the post (a like / a comment on it, a decision on one of its files).
      await tx.notification.deleteMany({
        where: {
          OR: [
            { type: { in: ['like', 'comment'] }, payloadRefId: postId },
            ...(media.length > 0
              ? [{ type: { in: ['post_media_approved', 'post_media_rejected'] }, payloadRefId: { in: media.map((m) => m.id) } }]
              : []),
          ],
        },
      });
      // Cascades: comments under it, likes, saves, views, hashtag links, PostMedia (and its media reports).
      await tx.post.delete({ where: { id: postId } });
      counts.posts += 1;
    }

    // 1b. comments. Post.commentCount was already reduced when the comment was removed, so it is not touched again.
    for (const commentId of plan.commentIds) {
      const res = await tx.comment.deleteMany({ where: { id: commentId } });
      counts.comments += res.count;
    }

    // 1c. messages (MessageHide cascades). Another report's context rows were checked in evaluate().
    const touchedConversations = new Set<string>();
    for (const messageId of plan.messageIds) {
      const m = await tx.message.findUnique({ where: { id: messageId }, select: { conversationId: true } });
      if (!m) continue;
      await tx.message.delete({ where: { id: messageId } });
      touchedConversations.add(m.conversationId);
      counts.messages += 1;
    }

    // 2. this report's context rows (the context messages themselves stay).
    await tx.reportContextMessage.deleteMany({ where: { reportId } });

    // A conversation that lost its last message would be listed as an empty thread (the message retention job
    // removes such a conversation the same way); a conversation that still has a message is never touched.
    if (touchedConversations.size > 0) {
      const res = await tx.conversation.deleteMany({
        where: { id: { in: [...touchedConversations] }, messages: { none: {} } },
      });
      counts.conversations = res.count;
    }

    // 3. the report.
    await tx.report.delete({ where: { id: reportId } });
    return { keys, counts };
  }

  // The stored objects go only after the rows are committed. Each has a PostMediaDeferredDeletion record written in
  // the transaction: it is removed on success and left for RejectedMediaSweepService.processDeferred on failure.
  private async deleteObjectsAfterCommit(keys: readonly string[]): Promise<number> {
    if (!this.storage) return 0;
    let failed = 0;
    for (const key of keys) {
      try {
        await this.storage.delete(key); // deleting a missing object is a success
        await this.prisma.postMediaDeferredDeletion.deleteMany({ where: { objectKey: key } });
      } catch (err) {
        failed += 1;
        this.logger.warn(`Report retention: a stored object was not deleted (${msg(err)}); its record stays and is retried.`);
      }
    }
    return failed;
  }
}
