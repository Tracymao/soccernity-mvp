import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursor for GET /notifications (Build Plan Section
// 5.5) — the same (createdAt desc, id desc) shape as feed/cursor.util.ts,
// re-declared here rather than imported, per this codebase's own
// established convention (clubs/grassroots/banter/messaging each carry
// their own copy of whichever cursor shape they need, even when it's
// identical to another module's — see banter/cursor.util.ts's own
// comment on why: modules don't couple their pagination contracts
// together just because two orderings happen to coincide).
//
// Same opaque-base64-of-a-small-JSON-envelope contract as every other
// cursor util in this codebase: a client treats this as an internal
// detail, never constructs or parses one itself.
export interface NotificationCursor {
  createdAt: Date;
  id: string;
}

export function encodeNotificationCursor(cursor: NotificationCursor): string {
  const payload = JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

export function decodeNotificationCursor(raw: string): NotificationCursor {
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
