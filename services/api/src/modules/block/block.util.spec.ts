import { BadRequestException } from '@nestjs/common';
import { decodeBlockCursor, encodeBlockCursor } from './block.cursor';
import { blockedPairWhere, notBlockedWith, relationFromRows } from './block.util';

describe('block.util', () => {
  it('notBlockedWith covers BOTH directions for the viewer', () => {
    expect(notBlockedWith('v')).toEqual({
      blockedBy: { none: { blockerId: 'v' } },
      blocksMade: { none: { blockedId: 'v' } },
    });
  });

  it('blockedPairWhere matches either direction of the pair', () => {
    expect(blockedPairWhere('a', 'b')).toEqual({
      OR: [
        { blockerId: 'a', blockedId: 'b' },
        { blockerId: 'b', blockedId: 'a' },
      ],
    });
  });

  describe('relationFromRows', () => {
    it('is none with no rows', () => {
      expect(relationFromRows([], 'v', 'o')).toBe('none');
    });
    it('is viewer_blocked_other when the viewer made the block', () => {
      expect(relationFromRows([{ blockerId: 'v', blockedId: 'o' }], 'v', 'o')).toBe('viewer_blocked_other');
    });
    it('is other_blocked_viewer when the other user made the block', () => {
      expect(relationFromRows([{ blockerId: 'o', blockedId: 'v' }], 'v', 'o')).toBe('other_blocked_viewer');
    });
    it("the viewer's OWN block wins when both exist (the direction they may know about)", () => {
      expect(
        relationFromRows(
          [
            { blockerId: 'o', blockedId: 'v' },
            { blockerId: 'v', blockedId: 'o' },
          ],
          'v',
          'o',
        ),
      ).toBe('viewer_blocked_other');
    });
    it('ignores rows about a third party', () => {
      expect(relationFromRows([{ blockerId: 'x', blockedId: 'y' }], 'v', 'o')).toBe('none');
    });
  });
});

describe('block cursor', () => {
  it('round-trips a sequence and carries NOTHING else (no date)', () => {
    const raw = encodeBlockCursor(42);
    expect(decodeBlockCursor(raw)).toBe(42);
    expect(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))).toEqual({ sequence: 42 });
  });

  it.each(['not-a-cursor', Buffer.from('{"sequence":"x"}').toString('base64url'), Buffer.from('{"sequence":0}').toString('base64url'), Buffer.from('{"createdAt":"2026-01-01"}').toString('base64url')])(
    'rejects %s with a 400',
    (raw) => {
      expect(() => decodeBlockCursor(raw)).toThrow(BadRequestException);
    },
  );
});
