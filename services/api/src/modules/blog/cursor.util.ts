import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursors for GET /articles and GET /categories — this
// module's own copy of the (field, id) shape established across this
// codebase (feed/cursor.util.ts, admin-content/cursor.util.ts, etc.),
// per the established per-module-cursor-util convention (see
// clubs/cursor.util.ts's own header comment on why it's an adapted copy
// rather than a shared import).
//
// Articles page newest-PUBLISHED-first (publishedAt desc, id desc) —
// deliberately NOT createdAt: a public reader cares about when a piece
// went live, not when its draft was first created, and
// admin-content.service.ts's own invariant guarantees publishedAt is
// set (and never cleared) once an article is published — see
// blog.service.ts's PUBLISHED_ARTICLE_FILTER. Categories page by
// createdAt desc, id desc, mirroring GET /admin/categories's own order.
//
// Deliberately opaque (base64 of a small JSON envelope) — same contract
// as every other cursor util in this codebase: a client should treat
// this as an internal detail, never construct or parse one itself.

export interface ArticleCursor {
  publishedAt: Date;
  id: string;
}

export function encodeArticleCursor(cursor: ArticleCursor): string {
  const payload = JSON.stringify({ publishedAt: cursor.publishedAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeArticleCursor(raw: string): ArticleCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { publishedAt?: unknown }).publishedAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { publishedAt, id } = parsed as { publishedAt: string; id: string };
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { publishedAt: date, id };
}

export interface CategoryCursor {
  createdAt: Date;
  id: string;
}

export function encodeCategoryCursor(cursor: CategoryCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeCategoryCursor(raw: string): CategoryCursor {
  let parsed: unknown;
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { createdAt?: unknown }).createdAt !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  const { createdAt, id } = parsed as { createdAt: string; id: string };
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }

  return { createdAt: date, id };
}
