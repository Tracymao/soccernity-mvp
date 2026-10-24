import { BadRequestException } from '@nestjs/common';

// Cursor for the blocker's list. It carries ONLY the monotonic Block.sequence:
// the date a block was made is never shown (#404 item 8), and a createdAt in an
// opaque-but-decodable cursor would leak it.
export function encodeBlockCursor(sequence: number): string {
  return Buffer.from(JSON.stringify({ sequence }), 'utf8').toString('base64url');
}

export function decodeBlockCursor(raw: string): number {
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
