import { BadRequestException } from '@nestjs/common';

// Keyset cursor for GET /admin/contact-enquiries: this module's own copy of the (createdAt, id) shape the other
// newest-first list endpoints use (the per-module cursor-util convention, see moderation/cursor.util.ts).
// Opaque base64url JSON; clients never build or parse one.
export interface ContactEnquiryCursor {
  createdAt: Date;
  id: string;
}

export function encodeContactEnquiryCursor(cursor: ContactEnquiryCursor): string {
  return Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeContactEnquiryCursor(raw: string): ContactEnquiryCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
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
