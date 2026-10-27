import { Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdtemp, open, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { CreateUploadDto } from './dto/create-upload.dto';
import { MediaProcessor, UnprocessableMediaError } from './media-processor';
import {
  POST_MEDIA_EXT_BY_TYPE,
  POST_MEDIA_KIND_BY_TYPE,
  PostMediaContentType,
  PostMediaKind,
  detectPostMedia,
  isPostMediaContentType,
} from './media-signature.util';
import { PostMediaConfig } from './post-media.config';
import { deleteStoredObjects } from './post-media-cleanup.util';
import { POST_MEDIA_CODES, UPLOADS_UNAVAILABLE_MESSAGE, postMediaError } from './post-media.errors';

// backend/w14-post-media-pipeline (B-041; Decision Log #419). The upload half of the pipeline:
//
//   POST   /media/uploads             a one-time link into the QUARANTINE prefix (limits from configuration)
//   POST   /media/uploads/:id/confirm the server reads the object, checks magic bytes, size and (video)
//                                     duration, STRIPS metadata, writes to the PUBLIC prefix, deletes the
//                                     quarantined original, and queues the automatic check
//   GET    /media/uploads/:id         the uploader's own view of one upload (status, reason, url)
//   DELETE /media/uploads/:id         remove an upload (and its files) the uploader no longer wants
//
// An upload is 'pending' and invisible to everyone but its uploader until approved; nothing here ever
// approves anything (media-check.service.ts and, later, a moderator do).

export const QUARANTINE_PREFIX = 'quarantine';
export const PUBLIC_PREFIX = 'post-media';
const PROCESSING_LEASE_MS = 10 * 60 * 1000;
const SIGNATURE_BYTES = 64;

/** What the uploader sees of one upload. Never the check labels, never anyone else's upload. */
export interface PostMediaView {
  id: string;
  kind: PostMediaKind;
  /** 'awaiting_upload' | 'processing' | 'ready' */
  uploadState: string;
  /** 'pending' | 'approved' | 'rejected'. 'pending' once ready means "under review". */
  status: string;
  rejectionReason: string | null;
  /** The stored file's URL once ready, else null. Only ever returned to the uploader. */
  url: string | null;
  contentType: string | null;
  byteSize: number | null;
  durationSeconds: number | null;
  postId: string | null;
  createdAt: Date;
}

export interface UploadLink {
  id: string;
  uploadUrl: string;
  uploadMethod: 'PUT';
  uploadHeaders: Record<string, string>;
  expiresAt: Date;
  maxBytes: number;
}

const VIEW_SELECT = {
  id: true,
  kind: true,
  uploadState: true,
  status: true,
  rejectionReason: true,
  publicUrl: true,
  contentType: true,
  byteSize: true,
  durationSeconds: true,
  postId: true,
  createdAt: true,
} as const;

function toView(row: {
  id: string;
  kind: string;
  uploadState: string;
  status: string;
  rejectionReason: string | null;
  publicUrl: string | null;
  contentType: string | null;
  byteSize: number | null;
  durationSeconds: number | null;
  postId: string | null;
  createdAt: Date;
}): PostMediaView {
  return {
    id: row.id,
    kind: row.kind as PostMediaKind,
    uploadState: row.uploadState,
    status: row.status,
    rejectionReason: row.rejectionReason,
    url: row.uploadState === 'ready' ? row.publicUrl : null,
    contentType: row.contentType,
    byteSize: row.byteSize,
    durationSeconds: row.durationSeconds,
    postId: row.postId,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PostMediaService {
  private readonly logger = new Logger(PostMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    private readonly processor: MediaProcessor,
    private readonly config: PostMediaConfig,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---- POST /media/uploads ----------------------------------------------------------------------

  async createUpload(userId: string, dto: CreateUploadDto): Promise<UploadLink> {
    if (!isPostMediaContentType(dto.contentType)) {
      throw postMediaError(400, POST_MEDIA_CODES.unsupportedFile, 'Please choose a JPEG, PNG or WebP picture, or an MP4, WebM or MOV video.');
    }
    const kind = POST_MEDIA_KIND_BY_TYPE[dto.contentType];
    const limits = this.config.limits;
    const maxBytes = kind === 'image' ? limits.imageMaxBytes : limits.videoMaxBytes;
    if (dto.size > maxBytes) {
      throw postMediaError(
        400,
        POST_MEDIA_CODES.fileTooLarge,
        `That file is too large. ${kind === 'image' ? 'Pictures' : 'Videos'} can be up to ${Math.floor(maxBytes / (1024 * 1024))} MB.`,
      );
    }
    // Fail closed BEFORE issuing a link: a video is never accepted on a host that cannot strip it.
    if (kind === 'video') await this.processor.assertVideoToolsAvailable();

    const now = this.clock.now();
    await this.enforceUploadRateLimit(userId, now);

    const id = randomUUID();
    const quarantineKey = `${QUARANTINE_PREFIX}/${userId}/${id}`;
    const ttl = this.config.uploadLinkTtlSeconds;
    let link: { url: string; headers: Record<string, string> };
    try {
      link = await this.storage.createUploadUrl(quarantineKey, dto.contentType, dto.size, ttl);
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        this.logger.warn(`Upload link refused (storage unavailable): ${err.message}`);
        throw postMediaError(503, 'uploads_unavailable', UPLOADS_UNAVAILABLE_MESSAGE);
      }
      throw err;
    }

    await this.prisma.postMedia.create({
      data: {
        id,
        uploaderId: userId,
        kind,
        declaredContentType: dto.contentType,
        declaredSize: dto.size,
        quarantineKey,
        // From the app clock (not the database's now()) so the throttle window and the 24 h purge are
        // measured on the same clock the e2e suite can drive.
        createdAt: now,
      },
    });
    return {
      id,
      uploadUrl: link.url,
      uploadMethod: 'PUT',
      uploadHeaders: link.headers,
      expiresAt: new Date(now.getTime() + ttl * 1000),
      maxBytes,
    };
  }

  /** Per-user throttle: at most N upload links in the window (configuration). */
  private async enforceUploadRateLimit(userId: string, now: Date): Promise<void> {
    const { max, windowSeconds } = this.config.uploadRateLimit;
    const since = new Date(now.getTime() - windowSeconds * 1000);
    const used = await this.prisma.postMedia.count({ where: { uploaderId: userId, createdAt: { gte: since } } });
    if (used >= max) {
      throw postMediaError(429, POST_MEDIA_CODES.uploadRateLimited, 'You have started a lot of uploads recently. Please try again later.');
    }
  }

  // ---- POST /media/uploads/:id/confirm -----------------------------------------------------------

  async confirmUpload(userId: string, id: string): Promise<PostMediaView> {
    const row = await this.prisma.postMedia.findFirst({ where: { id, uploaderId: userId } });
    if (!row) throw new NotFoundException('Upload not found');
    if (row.uploadState === 'ready') return toView(row);
    if (!row.quarantineKey) throw postMediaError(409, POST_MEDIA_CODES.uploadNotReceived, 'That upload is no longer available. Please start again.');

    const now = this.clock.now();
    const claim = await this.prisma.postMedia.updateMany({
      where: {
        id,
        OR: [{ uploadState: 'awaiting_upload' }, { uploadState: 'processing', processingUntil: { lt: now } }],
      },
      data: { uploadState: 'processing', processingUntil: new Date(now.getTime() + PROCESSING_LEASE_MS) },
    });
    if (claim.count === 0) {
      const again = await this.prisma.postMedia.findFirst({ where: { id, uploaderId: userId } });
      if (again?.uploadState === 'ready') return toView(again);
      throw postMediaError(409, POST_MEDIA_CODES.uploadInProgress, 'That upload is already being processed.');
    }

    const dir = await mkdtemp(path.join(tmpdir(), 'post-media-'));
    let finished = false;
    try {
      const view = await this.processClaimed(row, dir);
      finished = true;
      return view;
    } finally {
      // A failure that is not a permanent rejection of the file (storage hiccup, missing video tools,
      // object not uploaded yet) hands the claim back so the client can simply confirm again.
      if (!finished) await this.releaseClaim(id);
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async releaseClaim(id: string): Promise<void> {
    await this.prisma.postMedia
      .updateMany({ where: { id, uploadState: 'processing' }, data: { uploadState: 'awaiting_upload', processingUntil: null } })
      .catch(() => undefined);
  }

  private async processClaimed(
    row: { id: string; uploaderId: string; kind: string; declaredContentType: string; declaredSize: number; quarantineKey: string | null },
    dir: string,
  ): Promise<PostMediaView> {
    const quarantineKey = row.quarantineKey as string;
    const kind = row.kind as PostMediaKind;
    const limits = this.config.limits;
    const maxBytes = kind === 'image' ? limits.imageMaxBytes : limits.videoMaxBytes;

    const head = await this.storage.head(quarantineKey);
    if (!head) {
      throw postMediaError(409, POST_MEDIA_CODES.uploadNotReceived, "We haven't received the file yet. Please upload it, then confirm.");
    }
    // The signed link pins the length; this is the authoritative re-check of what actually arrived.
    if (head.size !== row.declaredSize || head.size > maxBytes) {
      throw await this.discard(row.id, quarantineKey, postMediaError(400, POST_MEDIA_CODES.fileTooLarge, 'The uploaded file is not the size you declared or is too large.'));
    }

    const source = path.join(dir, 'source');
    await this.storage.downloadToFile(quarantineKey, source);
    const detected = detectPostMedia(await readHead(source));
    if (!detected || detected.contentType !== row.declaredContentType || detected.kind !== kind) {
      throw await this.discard(row.id, quarantineKey, postMediaError(400, POST_MEDIA_CODES.unsupportedFile, "That file isn't a supported picture or video."));
    }

    const publicKey = `${PUBLIC_PREFIX}/${row.uploaderId}/${row.id}.${POST_MEDIA_EXT_BY_TYPE[detected.contentType]}`;
    let publicUrl: string;
    let byteSize: number;
    let durationSeconds: number | null = null;
    const contentType: PostMediaContentType = detected.contentType;

    try {
      if (kind === 'image') {
        const clean = await this.processor.sanitizeImage(source, contentType);
        byteSize = clean.buffer.length;
        publicUrl = await this.storage.upload(clean.buffer, publicKey, contentType);
      } else {
        // Fail closed (503, nothing stored) when ffmpeg/ffprobe are missing.
        await this.processor.assertVideoToolsAvailable();
        const probe = await this.processor.probeVideo(source);
        if (!probe.hasVideoStream || probe.durationSeconds <= 0) {
          throw new UnprocessableMediaError('No video stream');
        }
        if (probe.durationSeconds > limits.videoMaxSeconds) {
          throw await this.discard(
            row.id,
            quarantineKey,
            postMediaError(400, POST_MEDIA_CODES.videoTooLong, `Videos can be up to ${limits.videoMaxSeconds} seconds long.`),
          );
        }
        durationSeconds = probe.durationSeconds;
        const stripped = path.join(dir, 'stripped');
        await this.processor.stripVideo(source, stripped, contentType);
        byteSize = (await stat(stripped)).size;
        publicUrl = await this.storage.uploadFile(stripped, publicKey, contentType);
      }
    } catch (err) {
      if (err instanceof UnprocessableMediaError) {
        throw await this.discard(row.id, quarantineKey, postMediaError(400, POST_MEDIA_CODES.unsupportedFile, "That file couldn't be read as a picture or video."));
      }
      throw err;
    }

    const now = this.clock.now();
    const done = await this.prisma.postMedia.updateMany({
      where: { id: row.id, uploadState: 'processing' },
      data: {
        uploadState: 'ready',
        processingUntil: null,
        publicKey,
        publicUrl,
        byteSize,
        contentType,
        durationSeconds,
        confirmedAt: now,
        // Queue the automatic check. Nothing is approved here.
        checkState: 'queued',
        checkNextAt: now,
      },
    });
    if (done.count === 0) {
      // Deleted (or finished by another confirm) while we worked: drop the object we just wrote.
      await deleteStoredObjects(this.storage, this.logger, [publicKey], `Confirm of ${row.id}`);
      throw postMediaError(409, POST_MEDIA_CODES.uploadInProgress, 'That upload changed while it was being processed.');
    }

    // The original (which may carry metadata) is deleted now; if that fails the key stays on the row and
    // the quarantine purge removes it within 24 hours.
    try {
      await this.storage.delete(quarantineKey);
      await this.prisma.postMedia.update({ where: { id: row.id }, data: { quarantineKey: null } });
    } catch (err) {
      this.logger.warn(`Quarantined original ${quarantineKey} not deleted yet (${err instanceof Error ? err.message : String(err)}); the purge will retry.`);
    }

    const fresh = await this.prisma.postMedia.findUniqueOrThrow({ where: { id: row.id }, select: VIEW_SELECT });
    return toView(fresh);
  }

  /** A permanently invalid upload: the original and the row are removed. Returns the error to throw. */
  private async discard(id: string, quarantineKey: string, error: Error): Promise<Error> {
    await deleteStoredObjects(this.storage, this.logger, [quarantineKey], `Discard of ${id}`);
    await this.prisma.postMedia.deleteMany({ where: { id, uploadState: 'processing' } });
    return error;
  }

  // ---- GET / DELETE /media/uploads/:id -----------------------------------------------------------

  async getOwnUpload(userId: string, id: string): Promise<PostMediaView> {
    const row = await this.prisma.postMedia.findFirst({ where: { id, uploaderId: userId }, select: VIEW_SELECT });
    if (!row) throw new NotFoundException('Upload not found');
    return toView(row);
  }

  async deleteOwnUpload(userId: string, id: string): Promise<void> {
    const row = await this.prisma.postMedia.findFirst({
      where: { id, uploaderId: userId },
      select: { id: true, uploadState: true, postId: true, publicUrl: true, publicKey: true, quarantineKey: true },
    });
    if (!row) throw new NotFoundException('Upload not found');
    if (row.uploadState === 'processing') {
      throw postMediaError(409, POST_MEDIA_CODES.uploadInProgress, 'That upload is being processed. Please try again in a moment.');
    }
    if (row.postId) {
      const entry = await this.prisma.contestEntry.findUnique({ where: { postId: row.postId }, select: { id: true } });
      if (entry) {
        throw postMediaError(409, POST_MEDIA_CODES.mediaInContestEntry, "A contest entry's file can't be removed.");
      }
    }
    await this.prisma.$transaction(async (tx) => {
      if (row.postId && row.publicUrl) {
        await tx.$executeRaw`UPDATE "Post" SET "mediaUrls" = array_remove("mediaUrls", ${row.publicUrl}) WHERE "id" = ${row.postId}`;
      }
      await tx.postMedia.delete({ where: { id: row.id } });
    });
    await deleteStoredObjects(
      this.storage,
      this.logger,
      [row.publicKey, row.quarantineKey].filter((k): k is string => Boolean(k)),
      `Delete of upload ${row.id}`,
    );
  }

  // ---- housekeeping ------------------------------------------------------------------------------

  /**
   * Removes quarantine objects older than the configured age (24 h). A link that was never used loses
   * its object and its row; a confirmed upload whose original could not be deleted at the time only loses
   * the original. Returns how many were handled.
   */
  async purgeQuarantine(now: Date = this.clock.now()): Promise<{ purged: number }> {
    const cutoff = new Date(now.getTime() - this.config.quarantineMaxAgeHours * 3600 * 1000);
    let purged = 0;
    for (;;) {
      const batch = await this.prisma.postMedia.findMany({
        where: { quarantineKey: { not: null }, createdAt: { lt: cutoff } },
        select: { id: true, quarantineKey: true, uploadState: true },
        take: 200,
        orderBy: { createdAt: 'asc' },
      });
      if (batch.length === 0) break;
      for (const r of batch) {
        const key = r.quarantineKey as string;
        try {
          await this.storage.delete(key);
        } catch (err) {
          this.logger.warn(`Quarantine purge: ${key} not deleted (${err instanceof Error ? err.message : String(err)}).`);
          return { purged }; // storage is down; stop and retry next run instead of spinning
        }
        if (r.uploadState === 'ready') {
          await this.prisma.postMedia.update({ where: { id: r.id }, data: { quarantineKey: null } });
        } else {
          await this.prisma.postMedia.delete({ where: { id: r.id } });
        }
        purged += 1;
      }
      if (batch.length < 200) break;
    }
    return { purged };
  }
}

async function readHead(filePath: string): Promise<Buffer> {
  const handle = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(SIGNATURE_BYTES);
    const { bytesRead } = await handle.read(buf, 0, SIGNATURE_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
