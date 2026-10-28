import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { isAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';
import { PostMediaConfig } from '../post-media/post-media.config';
import { postMediaError } from '../post-media/post-media.errors';
import { ModeratorDecisionResult, PostMediaDecisionService } from '../post-media/post-media-decision.service';
import { PostMediaReviewSource } from '../post-media/post-media-review.constants';
import { currentObjectKey } from '../post-media/post-media.service';
import { PUBLIC_NAME_SELECT, toPublicUser } from '../users/public-name.util';
import { ListMediaReviewQueryDto } from './dto/list-media-review-query.dto';
import { MEDIA_REVIEW_STATS_DEFAULT_DAYS } from './dto/media-review-stats-query.dto';
import { decodeMediaReviewCursor, encodeMediaReviewCursor } from './media-review.cursor';

// backend/w15-media-review-queue (B-037; Decision Log #419 item 4). The moderator side of the media review
// queue. The queue holds ONLY:
//   - pending items the automatic check left uncertain, gave up on, or never ran for (reviewEnteredAt set), and
//   - approved items users have reported (reportCount > 0).
// Everything else (an item the check approved or rejected on its own, an item still waiting for the check)
// is not here. See README.md.
//
// What a moderator sees: the uploader's PUBLIC name and id (never their email or real name), the file's kind,
// size and age, why it is here, the check's category labels, and a short-lived link to view the file. What
// they never get: any contact detail of the uploader or of a reporter.
//
// backend/media-privacy-vetting-followups (B-257, B-258; Decision Log #430 items 2 and 3):
//   - the view link is a short-lived SIGNED link to the file's CURRENT object: the private prefix while the item
//     awaits a decision or is rejected, the public one once approved (a pending or rejected file is never
//     public, so there is no public URL to hand a reviewer);
//   - an item whose uploader is a MINOR is visible to, and decidable by, a child-safety-vetted admin ONLY
//     (the same rule as moderation of reports that concern a minor, child-safety-vetting.util.ts). To anyone
//     else it does not exist: it is left out of the list and is a 404 (not a 403) by id, so nothing leaks.
//     The statistics counts stay accurate and are counts only;
//   - what reporters wrote (the optional reason) is shown here and nowhere else, never with who wrote it.

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

const ROW_SELECT = {
  id: true,
  sequence: true,
  kind: true,
  contentType: true,
  byteSize: true,
  durationSeconds: true,
  status: true,
  decisionSource: true,
  decidedAt: true,
  rejectionReason: true,
  checkLabels: true,
  publicKey: true,
  postId: true,
  confirmedAt: true,
  createdAt: true,
  privateKey: true,
  publishedAt: true,
  reviewEnteredAt: true,
  reviewEntrySource: true,
  reportCount: true,
  hiddenPendingReview: true,
  uploader: { select: { id: true, ...PUBLIC_NAME_SELECT } },
  _count: { select: { reports: true } },
  // Reporters' optional reasons, newest first. Reason text only: never the reporter.
  reports: { where: { reason: { not: null } }, select: { reason: true }, orderBy: { createdAt: 'desc' }, take: 20 },
} satisfies Prisma.PostMediaSelect;

type Row = Prisma.PostMediaGetPayload<{ select: typeof ROW_SELECT }>;

export interface MediaReviewItem {
  id: string;
  kind: string;
  contentType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  /** 'pending' (undecided) | 'approved' | 'rejected'. An approved item with reportCount > 0 is waiting for a decision. */
  status: string;
  awaitingDecision: boolean;
  /** Why the item is (or was) in the queue: the automatic check and/or user reports. */
  sources: PostMediaReviewSource[];
  /** Open reports; 0 once decided. A count only, never who. */
  reportCount: number;
  /** True once the report threshold hid it from everyone but its author. */
  hiddenPendingReview: boolean;
  /** What reporters wrote (optional free text, newest first, at most 20). Never who wrote it. */
  reportReasons: string[];
  /** The automatic check's category labels (e.g. "Suggestive"); empty when the check never ran. */
  checkLabels: string[];
  uploader: { id: string; publicName: string };
  postId: string | null;
  uploadedAt: Date;
  /** Seconds since the file was uploaded (confirmed). */
  ageSeconds: number;
  enteredQueueAt: Date | null;
  decidedAt: Date | null;
  decisionSource: string | null;
  rejectionReason: string | null;
  /** A short-lived link to the file; null if storage is unavailable. */
  viewUrl: string | null;
  viewUrlExpiresAt: Date | null;
}

export interface MediaReviewPage {
  items: MediaReviewItem[];
  nextCursor: string | null;
}

export interface MediaReviewStats {
  windowDays: number;
  from: Date;
  to: Date;
  autoApproved: number;
  autoRejected: number;
  /** Items the automatic check sent to a person (uncertain, gave up, or never ran). */
  sentToReview: number;
  /** Distinct items that received at least one user report in the window. */
  reported: number;
  /** Moderator decisions (approve, keep and reject) recorded in the admin action log. */
  decidedByModerator: number;
}

@Injectable()
export class AdminMediaReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    private readonly decisions: PostMediaDecisionService,
    private readonly actionLog: AdminActionLogService,
    private readonly config: PostMediaConfig,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---- GET /admin/media-review -------------------------------------------------------------------

  async list(query: ListMediaReviewQueryDto, adminId: string): Promise<MediaReviewPage> {
    const limit = Math.min(query.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const order = query.order ?? 'newest';
    const conditions: Prisma.PostMediaWhereInput[] = [{ uploadState: 'ready' }, this.statusWhere(query.status ?? 'pending')];
    // A minor's items are for child-safety-vetted admins only (B-258): left out of the list, not flagged.
    if (!(await isAdminChildSafetyVetted(this.prisma, adminId))) conditions.push({ uploader: { is: { isMinor: false } } });

    if (query.source === 'auto_check') {
      conditions.push({ reviewEntrySource: 'auto_check' });
    } else if (query.source === 'user_report') {
      conditions.push({ OR: [{ reviewEntrySource: 'user_report' }, { reports: { some: {} } }] });
    }
    if (query.cursor) {
      const sequence = decodeMediaReviewCursor(query.cursor);
      conditions.push({ sequence: order === 'newest' ? { lt: sequence } : { gt: sequence } });
    }

    const rows = await this.prisma.postMedia.findMany({
      where: { AND: conditions },
      orderBy: { sequence: order === 'newest' ? 'desc' : 'asc' },
      take: limit + 1,
      select: ROW_SELECT,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: await Promise.all(page.map((r) => this.toItem(r))),
      nextCursor: hasMore && last ? encodeMediaReviewCursor(last.sequence) : null,
    };
  }

  /** The review state a status filter names. 'pending' = waiting for a decision. */
  private statusWhere(status: 'pending' | 'approved' | 'rejected'): Prisma.PostMediaWhereInput {
    if (status === 'pending') {
      return { OR: [{ status: 'pending', reviewEnteredAt: { not: null } }, { reportCount: { gt: 0 } }] };
    }
    return { status, reviewEnteredAt: { not: null }, reportCount: 0 };
  }

  // ---- GET /admin/media-review/:id ---------------------------------------------------------------

  async get(id: string, adminId: string): Promise<MediaReviewItem> {
    // Only items that have been through the queue: this is not a general browser of everyone's uploads.
    const conditions: Prisma.PostMediaWhereInput[] = [
      { id, uploadState: 'ready' },
      { OR: [{ reviewEnteredAt: { not: null } }, { reportCount: { gt: 0 } }] },
    ];
    if (!(await isAdminChildSafetyVetted(this.prisma, adminId))) conditions.push({ uploader: { is: { isMinor: false } } });
    const row = await this.prisma.postMedia.findFirst({ where: { AND: conditions }, select: ROW_SELECT });
    if (!row) throw postMediaError(404, 'media_not_found', 'Media not found');
    return this.toItem(row);
  }

  /**
   * A non-vetted admin cannot decide a minor's item, and cannot learn it exists: the SAME 404 a missing id
   * gets. Costs one fresh vetting read per decision; a vetted admin pays only that read.
   */
  private async assertMayActOn(id: string, adminId: string): Promise<void> {
    if (await isAdminChildSafetyVetted(this.prisma, adminId)) return;
    const minorItem = await this.prisma.postMedia.findFirst({ where: { id, uploader: { is: { isMinor: true } } }, select: { id: true } });
    if (minorItem) throw postMediaError(404, 'media_not_found', 'Media not found');
  }

  // ---- POST /admin/media-review/:id/approve | reject ---------------------------------------------

  async approve(id: string, adminId: string): Promise<ModeratorDecisionResult> {
    await this.assertMayActOn(id, adminId);
    const result = await this.decisions.approve(id, adminId);
    await this.actionLog.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.MEDIA_APPROVED,
      ADMIN_ACTION_LOG_TARGET_TYPES.POST_MEDIA,
      id,
      result.outcome === 'kept' ? 'kept after user reports' : undefined,
    );
    return result;
  }

  async reject(id: string, adminId: string, reason: string): Promise<ModeratorDecisionResult> {
    await this.assertMayActOn(id, adminId);
    const result = await this.decisions.reject(id, adminId, reason);
    await this.actionLog.record(adminId, ADMIN_ACTION_LOG_ACTIONS.MEDIA_REJECTED, ADMIN_ACTION_LOG_TARGET_TYPES.POST_MEDIA, id, reason);
    return result;
  }

  // ---- GET /admin/media-review/stats -------------------------------------------------------------

  /** Aggregates only: counts over the window, never a row or a person. */
  async stats(days: number = MEDIA_REVIEW_STATS_DEFAULT_DAYS): Promise<MediaReviewStats> {
    const to = this.clock.now();
    const from = new Date(to.getTime() - days * 24 * 3600 * 1000);
    const inWindow = { gte: from, lte: to };

    const [autoApproved, autoRejected, sentToReview, reportedGroups, decidedByModerator] = await Promise.all([
      this.prisma.postMedia.count({ where: { decisionSource: 'auto', status: 'approved', decidedAt: inWindow } }),
      this.prisma.postMedia.count({ where: { decisionSource: 'auto', status: 'rejected', decidedAt: inWindow } }),
      this.prisma.postMedia.count({ where: { reviewEntrySource: 'auto_check', reviewEnteredAt: inWindow } }),
      this.prisma.postMediaReport.groupBy({ by: ['mediaId'], where: { createdAt: inWindow } }),
      this.prisma.adminActionLog.count({
        where: {
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.POST_MEDIA,
          action: { in: [ADMIN_ACTION_LOG_ACTIONS.MEDIA_APPROVED, ADMIN_ACTION_LOG_ACTIONS.MEDIA_REJECTED] },
          createdAt: inWindow,
        },
      }),
    ]);
    return { windowDays: days, from, to, autoApproved, autoRejected, sentToReview, reported: reportedGroups.length, decidedByModerator };
  }

  // ---- shaping -----------------------------------------------------------------------------------

  private async toItem(row: Row): Promise<MediaReviewItem> {
    const sources: PostMediaReviewSource[] = [];
    if (row.reviewEntrySource === 'auto_check') sources.push('auto_check');
    if (row.reviewEntrySource === 'user_report' || row._count.reports > 0) sources.push('user_report');

    const { url, expiresAt } = await this.viewLink(
      currentObjectKey({ publishedAt: row.publishedAt, publicKey: row.publicKey, privateKey: row.privateKey }),
    );
    const uploadedAt = row.confirmedAt ?? row.createdAt;
    return {
      id: row.id,
      kind: row.kind,
      contentType: row.contentType,
      sizeBytes: row.byteSize,
      durationSeconds: row.durationSeconds,
      status: row.status,
      awaitingDecision: (row.status === 'pending' && row.reviewEnteredAt !== null) || row.reportCount > 0,
      sources,
      reportCount: row.reportCount,
      hiddenPendingReview: row.hiddenPendingReview,
      reportReasons: row.reports.map((r) => r.reason).filter((r): r is string => typeof r === 'string'),
      checkLabels: Array.isArray(row.checkLabels) ? row.checkLabels.filter((l): l is string => typeof l === 'string') : [],
      uploader: toPublicUser(row.uploader),
      postId: row.postId,
      uploadedAt,
      ageSeconds: Math.max(0, Math.floor((this.clock.now().getTime() - uploadedAt.getTime()) / 1000)),
      enteredQueueAt: row.reviewEnteredAt,
      decidedAt: row.decidedAt,
      decisionSource: row.decisionSource,
      rejectionReason: row.rejectionReason,
      viewUrl: url,
      viewUrlExpiresAt: expiresAt,
    };
  }

  /** A short-lived signed link to the CURRENT object, never stored. A storage outage degrades the item to "no link", not an error. */
  private async viewLink(objectKey: string | null): Promise<{ url: string | null; expiresAt: Date | null }> {
    if (!objectKey) return { url: null, expiresAt: null };
    const ttl = this.config.reviewViewUrlTtlSeconds;
    try {
      const url = await this.storage.createDownloadUrl(objectKey, ttl);
      return { url, expiresAt: new Date(this.clock.now().getTime() + ttl * 1000) };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) return { url: null, expiresAt: null };
      throw err;
    }
  }
}
