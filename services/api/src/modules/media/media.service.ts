import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { decodeMediaCursor, encodeMediaCursor } from './cursor.util';
import { ListMediaQueryDto } from './dto/list-media-query.dto';
import {
  MEDIA_ALLOWED_MIME_TYPES,
  MEDIA_DEFAULT_PAGE_SIZE,
  MEDIA_MAX_PAGE_SIZE,
  MediaAllowedMimeType,
  MediaType,
} from './media.constants';

// GET /admin/media response shape — lean, list-appropriate columns only
// (Section 5.5's low-bandwidth discipline, the same reasoning
// ARTICLE_LIST_SELECT / CLUB_SELECT already follow). `key` (the raw S3
// object key) is deliberately NOT selected — an internal storage detail
// the frontend has no use for; `url` already carries everything a caller
// needs to view/download the file.
const MEDIA_LIST_SELECT = {
  id: true,
  uploaderId: true,
  url: true,
  type: true,
  size: true,
  createdAt: true,
} as const;

export type MediaListItem = Prisma.MediaAssetGetPayload<{ select: typeof MEDIA_LIST_SELECT }>;

export interface MediaListPage {
  items: MediaListItem[];
  nextCursor: string | null;
}

// A file shape this service accepts — matches Express.Multer.File's own
// real surface (buffer/mimetype/size/originalname) without importing the
// Express namespace here, so this file stays testable with a plain object
// literal in media.service.spec.ts rather than a real multipart request.
export interface UploadedMediaFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

// Sanitizes an uploaded file's own name into something safe to embed in
// an S3 object key — strips any path components a crafted `originalname`
// might carry (Express/multer never guarantees this is a bare filename)
// and any character outside a small safe set, then bounds the length.
// The leading randomUUID() this feeds into (see buildMediaKey below)
// already guarantees a unique key on its own; this is purely for a
// human-readable trailing segment, not the actual collision-avoidance
// mechanism.
function sanitizeFileNameSegment(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const safe = base.replace(/[^a-zA-Z0-9.\-_]/g, '_').slice(0, 100);
  return safe || 'file';
}

function buildMediaKey(uploaderId: string, originalName: string): string {
  return `media/${uploaderId}/${randomUUID()}-${sanitizeFileNameSegment(originalName)}`;
}

function deriveMediaType(mimetype: string): MediaType {
  return mimetype.startsWith('image/') ? 'image' : 'video';
}

// Build Plan Section 4.8 (Admin Service) — Media library. See
// README.md for the full endpoint table, the StorageService abstraction
// this depends on, and every Decision Log candidate this module surfaces
// (the storage-provider choice itself; GET /admin/media beyond Section
// 4.8's literal upload-only line; MediaAsset.key).
@Injectable()
export class MediaService {
  constructor(
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  // POST /admin/media/upload (AdminRolesGuard('editor', 'superadmin')).
  // `uploaderId` comes from the caller's own verified access token
  // (@CurrentAdmin()), never the body — same discipline as
  // CreateArticleDto.authorAdminId / CreateTeamDto.createdById.
  //
  // Validation order, deliberately: (1) a file was actually attached —
  // FileInterceptor makes `file` optional at the type level even on a
  // required upload, since a caller can submit the multipart request
  // with no file part at all; (2) the file's own reported MIME type is
  // on the allow-list — checked BEFORE calling out to storage, so a
  // rejected file never reaches a real (or real-503) network call.
  // File-size enforcement happens one layer up, inside multer itself
  // (FileInterceptor's own `limits.fileSize`, see
  // admin-media.controller.ts) — NestJS already converts that into a
  // clean 413 before this method ever runs, so no redundant size check
  // is repeated here.
  async uploadMedia(uploaderId: string, file: UploadedMediaFile | undefined): Promise<MediaListItem> {
    if (!file) {
      throw new BadRequestException('No file was attached to this upload.');
    }
    if (!MEDIA_ALLOWED_MIME_TYPES.includes(file.mimetype as MediaAllowedMimeType)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed types are JPEG/PNG/GIF/WEBP images and MP4/MOV/WEBM video.`,
      );
    }

    const type = deriveMediaType(file.mimetype);
    const key = buildMediaKey(uploaderId, file.originalname);
    const url = await this.storage.upload(file.buffer, key, file.mimetype);

    return this.prisma.mediaAsset.create({
      data: { uploaderId, url, key, type, size: file.size },
      select: MEDIA_LIST_SELECT,
    });
  }

  // GET /admin/media (AdminRolesGuard('editor', 'superadmin') — see
  // README.md's "who may view" section). Keyset-paginated, newest-first,
  // one optional exact-match `type` filter.
  async listMedia(query: ListMediaQueryDto): Promise<MediaListPage> {
    const limit = Math.min(query.limit ?? MEDIA_DEFAULT_PAGE_SIZE, MEDIA_MAX_PAGE_SIZE);

    const conditions: Prisma.MediaAssetWhereInput[] = [];
    if (query.type) {
      conditions.push({ type: query.type });
    }
    if (query.cursor) {
      const cursor = decodeMediaCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.MediaAssetWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.mediaAsset.findMany({
      where,
      select: MEDIA_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeMediaCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }
}
