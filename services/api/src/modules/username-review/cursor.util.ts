import { BadRequestException } from '@nestjs/common';
import { USERNAME_REVIEW_CURSOR_INVALID_CODE } from './username-review.constants';

// Keyset cursor for GET /admin/username-reviews: this module's own copy of the (createdAt, id) shape every list
// endpoint here uses (per-module cursor convention). Opaque base64url JSON; clients never build or parse one.
export interface UsernameReviewCursor {
  createdAt: Date;
  id: string;
}

export function encodeUsernameReviewCursor(cursor: UsernameReviewCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeUsernameReviewCursor(raw: string): UsernameReviewCursor {
  const bad = () =>
    new BadRequestException({ message: 'Invalid pagination cursor', code: USERNAME_REVIEW_CURSOR_INVALID_CODE });
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw bad();
  }
  const p = parsed as { createdAt?: unknown; id?: unknown } | null;
  if (typeof p !== 'object' || p === null || typeof p.createdAt !== 'string' || typeof p.id !== 'string') throw bad();
  const createdAt = new Date(p.createdAt);
  if (Number.isNaN(createdAt.getTime())) throw bad();
  return { createdAt, id: p.id };
}
