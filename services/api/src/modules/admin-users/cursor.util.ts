import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /admin/users — this module's own copy
// of the (createdAt, id) shape feed/cursor.util.ts established, per this
// codebase's established per-module-cursor-util convention (see
// admin-content/cursor.util.ts's own header comment on why it's an
// adapted copy rather than a shared import). User.createdAt already
// existed (Section 3) — no schema change needed for this endpoint's own
// pagination.
//
// Deliberately opaque (base64 of a small JSON envelope), same contract as
// every other cursor util here: a client should treat this as an
// internal detail, never construct or parse one itself.
export interface AdminUsersCursor {
  createdAt: Date;
  id: string;
}

export function encodeAdminUsersCursor(cursor: AdminUsersCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeAdminUsersCursor(raw: string): AdminUsersCursor {
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
