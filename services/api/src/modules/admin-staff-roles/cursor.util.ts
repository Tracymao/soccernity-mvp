import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /admin/staff — this module's own copy
// of the (createdAt, id) shape feed/cursor.util.ts established, per this
// codebase's established per-module-cursor-util convention (see
// admin-users/cursor.util.ts's own header comment on why it's an adapted
// copy rather than a shared import). AdminUser.createdAt already existed
// — no schema change needed for this endpoint's own pagination.
//
// Deliberately opaque (base64 of a small JSON envelope), same contract as
// every other cursor util here: a client should treat this as an
// internal detail, never construct or parse one itself.
export interface AdminStaffRolesCursor {
  createdAt: Date;
  id: string;
}

export function encodeAdminStaffRolesCursor(cursor: AdminStaffRolesCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeAdminStaffRolesCursor(raw: string): AdminStaffRolesCursor {
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
