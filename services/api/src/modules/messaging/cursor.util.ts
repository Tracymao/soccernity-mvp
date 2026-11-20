import { BadRequestException } from '@nestjs/common';

// Keyset-pagination cursors for the two Messaging list endpoints (Build
// Plan Section 5.5). Two shapes, because the two surfaces order by
// different columns — exactly the "one cursor shape per ordering" split
// grassroots/cursor.util.ts and banter/cursor.util.ts already make:
//
//  - GET /conversations              -> most-recent-activity first
//    (Conversation.lastMessageAt desc), `id` tiebreak.
//  - GET /conversations/:id/messages -> newest message first
//    (Message.sentAt desc), `id` tiebreak — the same direction
//    GET /clubs/:id/feed / GET /posts/feed page in, which is the
//    convention this task was told to match.
//
// Same opaque-base64-of-a-small-JSON-envelope contract as
// feed/clubs/grassroots/banter cursor utils: a client treats these as
// internal detail, never constructs or parses one itself.

function decodeEnvelope(raw: string): { ts: string; id: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { ts?: unknown }).ts !== 'string' ||
    typeof (parsed as { id?: unknown }).id !== 'string'
  ) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  return parsed as { ts: string; id: string };
}

function toDate(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  return date;
}

// ---------- Conversation cursor: { lastMessageAt, id } ----------

export interface ConversationCursor {
  lastMessageAt: Date;
  id: string;
}

export function encodeConversationCursor(cursor: ConversationCursor): string {
  return Buffer.from(
    JSON.stringify({ ts: cursor.lastMessageAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeConversationCursor(raw: string): ConversationCursor {
  const { ts, id } = decodeEnvelope(raw);
  return { lastMessageAt: toDate(ts), id };
}

// ---------- Message cursor: { sentAt, id } ----------

export interface MessageCursor {
  sentAt: Date;
  id: string;
}

export function encodeMessageCursor(cursor: MessageCursor): string {
  return Buffer.from(
    JSON.stringify({ ts: cursor.sentAt.toISOString(), id: cursor.id }),
    'utf8',
  ).toString('base64url');
}

export function decodeMessageCursor(raw: string): MessageCursor {
  const { ts, id } = decodeEnvelope(raw);
  return { sentAt: toDate(ts), id };
}

// ---------- participantKey ----------
// The deterministic Conversation.participantKey (schema.prisma): the
// participant ids sorted and ':'-joined. Sorting makes it order-
// independent, so (A, B) and (B, A) produce the same key — which is what
// makes it a key for the participant SET, not the tuple. Used by
// POST /conversations's find-or-create.
export function participantKey(ids: string[]): string {
  return [...ids].sort().join(':');
}
