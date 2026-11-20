import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /admin/articles and GET
// /admin/categories — this module's own copy of the (createdAt, id)
// shape feed/cursor.util.ts established, per this codebase's established
// per-module-cursor-util convention (see clubs/cursor.util.ts's own
// header comment on why it's an adapted copy rather than a shared
// import). Both Article and Category gained a real `createdAt` column
// specifically so a newest-first list has something to order/page by —
// see schema.prisma's own comment on each field.
//
// Deliberately opaque (base64 of a small JSON envelope), same contract as
// every other cursor util here: a client should treat this as an
// internal detail, never construct or parse one itself.
export interface AdminContentCursor {
  createdAt: Date;
  id: string;
}

export function encodeAdminContentCursor(cursor: AdminContentCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeAdminContentCursor(raw: string): AdminContentCursor {
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
