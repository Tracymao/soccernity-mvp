import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { AdminMediaReviewService } from '../admin-media-review/admin-media-review.service';
import { isProfileItemId } from '../admin-media-review/profile-image-item-id';
import { assertAdminChildSafetyVetted, isAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';
import { PostMediaConfig } from '../post-media/post-media.config';
import { postMediaError } from '../post-media/post-media.errors';
import { PostMediaDecisionService } from '../post-media/post-media-decision.service';
import { currentObjectKey } from '../post-media/post-media.service';
import { OTHER_BODY_KEY, suggestedBodiesFor, SuggestedBody } from './receiving-bodies.constants';
import {
  SUSPECTED_MEDIA_CODES,
  SUSPECTED_MEDIA_DEFAULT_PAGE_SIZE,
  SUSPECTED_MEDIA_MAX_PAGE_SIZE,
  SuspectedMediaStatus,
} from './suspected-illegal-media.constants';
import { ListSuspectedIllegalQueryDto } from './dto/list-suspected-illegal-query.dto';
import { RecordFiledDto } from './dto/record-filed.dto';
import { RecordNotFiledDto } from './dto/record-not-filed.dto';
import { SetAsideSuspectedIllegalDto } from './dto/set-aside-suspected-illegal.dto';

// backend/suspected-illegal-imagery-path (B-206; founder decision 2026-11-15).
//
// When a child-safety-vetted admin sees an image or video that may be illegal imagery, they SET IT ASIDE: the file is
// rejected through the existing generic rejection (the uploader sees only the usual "didn't meet our rules"), a
// SuspectedIllegalMedia record is written, and the file is then PROTECTED from every private-object deletion path
// until counsel decides evidence handling and the preservation period ends (rejected-media-evidence.util.ts). A
// human then records whether the report was FILED with a receiving body outside this system, or that it was
// decided NOT to file, with the reason. This code never contacts an authority, never auto-actions on a Rekognition
// label and never matches hashes.
//
// Who may act: a child-safety-vetted admin (any role among moderator / superadmin), for EVERY file, not only a
// minor's. A non-vetted admin on a MINOR's item gets the same 404 a missing id gets (the media review queue's rule);
// on an ADULT's item a coded 403, because no secrecy is gained by hiding an adult's item from them.

const RECORD_SELECT = {
  id: true,
  mediaId: true,
  uploaderId: true,
  postId: true,
  reportId: true,
  kind: true,
  reason: true,
  uploaderCountry: true,
  uploaderIsMinor: true,
  status: true,
  setAsideByAdminId: true,
  setAsideAt: true,
  preserveUntil: true,
  decidedByAdminId: true,
  decidedAt: true,
  bodyKey: true,
  bodyOther: true,
  reference: true,
  filedAt: true,
  note: true,
  notFiledReason: true,
} satisfies Prisma.SuspectedIllegalMediaSelect;

type RecordRow = Prisma.SuspectedIllegalMediaGetPayload<{ select: typeof RECORD_SELECT }>;

export interface SuspectedIllegalRecord extends RecordRow {
  suggestedBodies: SuggestedBody[];
}

export interface SuspectedIllegalDetail extends SuspectedIllegalRecord {
  /** A short-lived signed link to the file while a stored object still exists; null otherwise. */
  viewUrl: string | null;
  viewUrlExpiresAt: Date | null;
}

export interface SuspectedIllegalPage {
  items: SuspectedIllegalRecord[];
  nextCursor: string | null;
}

function encodeCursor(row: { setAsideAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: row.setAsideAt.toISOString(), id: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { t: Date; id: string } {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t?: unknown; id?: unknown };
    const t = typeof parsed.t === 'string' ? new Date(parsed.t) : null;
    if (t && !Number.isNaN(t.getTime()) && typeof parsed.id === 'string') return { t, id: parsed.id };
  } catch {
    // fall through
  }
  throw postMediaError(400, SUSPECTED_MEDIA_CODES.cursorInvalid, 'The cursor is not valid.');
}

@Injectable()
export class SuspectedIllegalMediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly decisions: PostMediaDecisionService,
    private readonly mediaReview: AdminMediaReviewService,
    private readonly config: PostMediaConfig,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---- POST /admin/media-review/:id/suspected-illegal --------------------------------------------

  async setAside(mediaId: string, adminId: string, dto: SetAsideSuspectedIllegalDto): Promise<SuspectedIllegalRecord> {
    // Post and contest media only: a profile picture's id ("avatar:<user>:<file>") is not a media id (recorded gap).
    if (isProfileItemId(mediaId)) throw postMediaError(404, 'media_not_found', 'Media not found');
    await this.assertVettedOrHide(mediaId, adminId);
    if (dto.reportId) {
      const report = await this.prisma.report.findUnique({ where: { id: dto.reportId }, select: { id: true } });
      if (!report) throw postMediaError(404, SUSPECTED_MEDIA_CODES.reportNotFound, 'Report not found');
    }

    const now = this.clock.now();
    const preserveUntil = new Date(now.getTime() + this.config.suspectedMediaPreserveDays * 24 * 3600 * 1000);
    let outcome: { record: RecordRow; uploaderId: string; changed: boolean };
    try {
      outcome = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.suspectedIllegalMedia.findUnique({ where: { mediaId }, select: { id: true } });
        if (existing) throw this.alreadyRecorded();

        const rejection = await this.decisions.rejectForSetAside(tx, mediaId, adminId, now);
        const uploader = await tx.user.findUnique({
          where: { id: rejection.uploaderId },
          select: { isMinor: true, derivedCountry: true, declaredCountry: true },
        });
        const record = await tx.suspectedIllegalMedia.create({
          data: {
            mediaId,
            uploaderId: rejection.uploaderId,
            postId: rejection.postId,
            reportId: dto.reportId ?? null,
            objectKey: rejection.objectKey,
            kind: rejection.kind,
            reason: dto.reason,
            uploaderCountry: uploader?.derivedCountry ?? uploader?.declaredCountry ?? null,
            uploaderIsMinor: uploader?.isMinor ?? false,
            status: 'set_aside',
            setAsideByAdminId: adminId,
            setAsideAt: now,
            preserveUntil,
          },
          select: RECORD_SELECT,
        });
        // The audit row, in the SAME transaction (AdminActionLogService.record is not transactional). No reason text.
        await tx.adminActionLog.create({
          data: {
            adminId,
            action: ADMIN_ACTION_LOG_ACTIONS.MEDIA_SUSPECTED_ILLEGAL_SET_ASIDE,
            targetType: ADMIN_ACTION_LOG_TARGET_TYPES.POST_MEDIA,
            targetId: mediaId,
            notes: `record=${record.id}; kind=${rejection.kind}${dto.reportId ? `; report=${dto.reportId}` : ''}`,
          },
        });
        return { record, uploaderId: rejection.uploaderId, changed: rejection.changed };
      });
    } catch (err) {
      // Two simultaneous set-asides: mediaId is unique, the loser is the same 409.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw this.alreadyRecorded();
      throw err;
    }
    await this.decisions.afterSetAside(mediaId, outcome.uploaderId, outcome.changed);
    return this.withSuggestions(outcome.record);
  }

  // ---- GET /admin/suspected-illegal-media --------------------------------------------------------

  async list(query: ListSuspectedIllegalQueryDto, adminId: string): Promise<SuspectedIllegalPage> {
    await assertAdminChildSafetyVetted(this.prisma, adminId);
    const limit = Math.min(query.limit ?? SUSPECTED_MEDIA_DEFAULT_PAGE_SIZE, SUSPECTED_MEDIA_MAX_PAGE_SIZE);
    const conditions: Prisma.SuspectedIllegalMediaWhereInput[] = [];
    if (query.status) conditions.push({ status: query.status });
    if (query.cursor) {
      const c = decodeCursor(query.cursor);
      conditions.push({ OR: [{ setAsideAt: { lt: c.t } }, { setAsideAt: c.t, id: { lt: c.id } }] });
    }
    const rows = await this.prisma.suspectedIllegalMedia.findMany({
      where: conditions.length > 0 ? { AND: conditions } : undefined,
      orderBy: [{ setAsideAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: RECORD_SELECT,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((r) => this.withSuggestions(r)),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    };
  }

  // ---- GET /admin/suspected-illegal-media/:id ----------------------------------------------------

  async get(id: string, adminId: string): Promise<SuspectedIllegalDetail> {
    await assertAdminChildSafetyVetted(this.prisma, adminId);
    const row = await this.prisma.suspectedIllegalMedia.findUnique({ where: { id }, select: RECORD_SELECT });
    if (!row) throw this.notFound();
    // The file may be gone (its row is deleted with the post): then there is simply no link.
    const media = await this.prisma.postMedia.findUnique({
      where: { id: row.mediaId },
      select: { publishedAt: true, publicKey: true, privateKey: true },
    });
    const link = await this.mediaReview.viewLinkForObject(media ? currentObjectKey(media) : null);
    return { ...this.withSuggestions(row), viewUrl: link.url, viewUrlExpiresAt: link.expiresAt };
  }

  // ---- POST /admin/suspected-illegal-media/:id/filed | not-filed ---------------------------------

  async recordFiled(id: string, adminId: string, dto: RecordFiledDto): Promise<SuspectedIllegalRecord> {
    await assertAdminChildSafetyVetted(this.prisma, adminId);
    if (dto.bodyKey === OTHER_BODY_KEY && !dto.bodyOther) {
      throw postMediaError(400, SUSPECTED_MEDIA_CODES.bodyOtherRequired, 'Name the body when you choose "other".');
    }
    const now = this.clock.now();
    const filedAt = dto.filedAt ? new Date(dto.filedAt) : now;
    if (Number.isNaN(filedAt.getTime()) || filedAt.getTime() > now.getTime() + 60_000) {
      throw postMediaError(400, SUSPECTED_MEDIA_CODES.filedAtInvalid, 'The filing time cannot be in the future.');
    }
    return this.decide(id, adminId, now, {
      data: {
        status: 'filed',
        bodyKey: dto.bodyKey,
        bodyOther: dto.bodyKey === OTHER_BODY_KEY ? dto.bodyOther ?? null : null,
        reference: dto.reference,
        filedAt,
        note: dto.note ? dto.note : null,
      },
      action: ADMIN_ACTION_LOG_ACTIONS.MEDIA_SUSPECTED_ILLEGAL_FILED,
      // The reference number and the note are NOT copied into the audit log.
      notes: `body=${dto.bodyKey}`,
    });
  }

  async recordNotFiled(id: string, adminId: string, dto: RecordNotFiledDto): Promise<SuspectedIllegalRecord> {
    await assertAdminChildSafetyVetted(this.prisma, adminId);
    const now = this.clock.now();
    return this.decide(id, adminId, now, {
      data: { status: 'not_filed', notFiledReason: dto.reason },
      action: ADMIN_ACTION_LOG_ACTIONS.MEDIA_SUSPECTED_ILLEGAL_NOT_FILED,
      notes: 'reason recorded',
    });
  }

  // The status test is in the WHERE, so two admins deciding at once cannot both win (the loser is the 409), and a
  // decided record can never be decided again.
  private async decide(
    id: string,
    adminId: string,
    now: Date,
    change: { data: Prisma.SuspectedIllegalMediaUpdateManyMutationInput; action: string; notes: string },
  ): Promise<SuspectedIllegalRecord> {
    const row = await this.prisma.$transaction(async (tx) => {
      const status: SuspectedMediaStatus = 'set_aside';
      const updated = await tx.suspectedIllegalMedia.updateMany({
        where: { id, status },
        data: { ...change.data, decidedAt: now, decidedByAdminId: adminId },
      });
      if (updated.count === 0) {
        const exists = await tx.suspectedIllegalMedia.findUnique({ where: { id }, select: { id: true } });
        if (!exists) throw this.notFound();
        throw postMediaError(409, SUSPECTED_MEDIA_CODES.alreadyDecided, 'This record has already been decided.');
      }
      const record = await tx.suspectedIllegalMedia.findUniqueOrThrow({ where: { id }, select: RECORD_SELECT });
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: change.action,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.POST_MEDIA,
          targetId: record.mediaId,
          notes: `record=${id}; ${change.notes}`,
        },
      });
      return record;
    });
    return this.withSuggestions(row);
  }

  // ---- helpers -----------------------------------------------------------------------------------

  /**
   * A vetted admin passes. A non-vetted admin gets the existing 404 for a missing id or a MINOR's item, and a coded 403
   * for an ADULT's item.
   */
  private async assertVettedOrHide(mediaId: string, adminId: string): Promise<void> {
    if (await isAdminChildSafetyVetted(this.prisma, adminId)) return;
    const item = await this.prisma.postMedia.findFirst({
      where: { id: mediaId, uploadState: 'ready' },
      select: { uploader: { select: { isMinor: true } } },
    });
    if (!item || item.uploader.isMinor) throw postMediaError(404, 'media_not_found', 'Media not found');
    await assertAdminChildSafetyVetted(this.prisma, adminId);
  }

  private withSuggestions(row: RecordRow): SuspectedIllegalRecord {
    return { ...row, suggestedBodies: suggestedBodiesFor(row.uploaderCountry) };
  }

  private alreadyRecorded() {
    return postMediaError(409, SUSPECTED_MEDIA_CODES.alreadyRecorded, 'This file has already been set aside.');
  }

  private notFound() {
    return postMediaError(404, SUSPECTED_MEDIA_CODES.notFound, 'Record not found');
  }
}
