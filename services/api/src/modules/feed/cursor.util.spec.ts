import { BadRequestException } from '@nestjs/common';
import { decodeFeedCursor, encodeFeedCursor } from './cursor.util';

describe('feed cursor encode/decode', () => {
  it('round-trips a (createdAt, id) pair', () => {
    const createdAt = new Date('2026-08-19T12:34:56.789Z');
    const encoded = encodeFeedCursor({ createdAt, id: 'post-42' });
    const decoded = decodeFeedCursor(encoded);

    expect(decoded.id).toBe('post-42');
    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
  });

  it('is opaque (not a plain "createdAt,id" string a client could hand-craft)', () => {
    const encoded = encodeFeedCursor({ createdAt: new Date('2026-08-19T00:00:00.000Z'), id: 'post-1' });
    expect(encoded).not.toContain('post-1');
    expect(encoded).not.toContain('2026-08-19');
  });

  it('rejects a cursor that is not valid base64/JSON with a 400', () => {
    expect(() => decodeFeedCursor('%%%not-base64%%%')).toThrow(BadRequestException);
  });

  it('rejects a cursor whose decoded JSON is missing required fields', () => {
    const badPayload = Buffer.from(JSON.stringify({ id: 'post-1' }), 'utf8').toString('base64url');
    expect(() => decodeFeedCursor(badPayload)).toThrow(BadRequestException);
  });

  it('rejects a cursor with an unparseable createdAt value', () => {
    const badPayload = Buffer.from(
      JSON.stringify({ createdAt: 'not-a-date', id: 'post-1' }),
      'utf8',
    ).toString('base64url');
    expect(() => decodeFeedCursor(badPayload)).toThrow(BadRequestException);
  });
});
