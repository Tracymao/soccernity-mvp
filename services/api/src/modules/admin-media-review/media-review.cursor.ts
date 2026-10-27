import { BadRequestException } from '@nestjs/common';

// Cursor for the moderator queue. Carries ONLY the monotonic PostMedia.sequence (insertion order): the
// direction comes from the request's `order`, and nothing about the item, its uploader or its age is
// recoverable from the cursor.
export function encodeMediaReviewCursor(sequence: number): string {
  return Buffer.from(JSON.stringify({ sequence }), 'utf8').toString('base64url');
}

export function decodeMediaReviewCursor(raw: string): number {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { sequence?: unknown };
    if (typeof parsed.sequence === 'number' && Number.isInteger(parsed.sequence) && parsed.sequence > 0) {
      return parsed.sequence;
    }
  } catch {
    // fall through
  }
  throw new BadRequestException('Invalid pagination cursor');
}
