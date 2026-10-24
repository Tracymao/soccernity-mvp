import { PrismaService } from '../../prisma/prisma.service';
import { hasBlockBetween } from '../block/block.util';
import { notificationBlockHiddenFilter } from './block-visibility.util';

function prismaWith(blocks: Array<{ blockerId: string; blockedId: string }>) {
  return {
    block: { findMany: jest.fn().mockResolvedValue(blocks) },
    conversation: { findMany: jest.fn().mockResolvedValue([]) },
    fixture: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
}

describe('notificationBlockHiddenFilter (B-197)', () => {
  it('is an empty fragment, with no further lookups, for a user with no Block on either side', async () => {
    const prisma = prismaWith([]);
    expect(await notificationBlockHiddenFilter(prisma, 'me')).toEqual({});
    expect(prisma.conversation.findMany).not.toHaveBeenCalled();
    expect(prisma.fixture.findMany).not.toHaveBeenCalled();
  });

  it('reads the Block rows in both directions', async () => {
    const prisma = prismaWith([]);
    await notificationBlockHiddenFilter(prisma, 'me');
    expect((prisma.block.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      OR: [{ blockerId: 'me' }, { blockedId: 'me' }],
    });
  });

  it('de-duplicates a user who is blocked in both directions', async () => {
    const prisma = prismaWith([
      { blockerId: 'me', blockedId: 'x' },
      { blockerId: 'x', blockedId: 'me' },
    ]);
    const filter = await notificationBlockHiddenFilter(prisma, 'me');
    expect(filter).toEqual({ NOT: { OR: [{ type: 'follow', payloadRefId: { in: ['x'] } }] } });
  });

  it('adds the message and fixture clauses only when a matching thread / fixture exists', async () => {
    const prisma = prismaWith([{ blockerId: 'me', blockedId: 'x' }]);
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);
    const filter = await notificationBlockHiddenFilter(prisma, 'me');
    expect(filter).toEqual({
      NOT: {
        OR: [
          { type: 'follow', payloadRefId: { in: ['x'] } },
          { type: 'message', payloadRefId: { in: ['c1', 'c2'] } },
        ],
      },
    });
    // fixtures: both ways round (the viewer's team is A or B)
    expect((prisma.fixture.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
      OR: [
        { teamA: { createdById: 'me' }, teamB: { createdById: { in: ['x'] } } },
        { teamB: { createdById: 'me' }, teamA: { createdById: { in: ['x'] } } },
      ],
    });
  });

  it('never excludes like or comment rows (no actor is stored: OPEN)', async () => {
    const prisma = prismaWith([{ blockerId: 'me', blockedId: 'x' }]);
    (prisma.conversation.findMany as jest.Mock).mockResolvedValue([{ id: 'c1' }]);
    (prisma.fixture.findMany as jest.Mock).mockResolvedValue([{ id: 'f1' }]);
    const text = JSON.stringify(await notificationBlockHiddenFilter(prisma, 'me'));
    expect(text).not.toMatch(/"(like|comment)"/);
  });
});

describe('hasBlockBetween (B-197)', () => {
  it('asks for a Block in either direction between the two users', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await hasBlockBetween({ block: { findFirst } }, 'a', 'b');
    expect(findFirst.mock.calls[0][0].where).toEqual({
      OR: [
        { blockerId: 'a', blockedId: 'b' },
        { blockerId: 'b', blockedId: 'a' },
      ],
    });
  });

  it('is true only when a row exists', async () => {
    expect(await hasBlockBetween({ block: { findFirst: jest.fn().mockResolvedValue({ id: '1' }) } }, 'a', 'b')).toBe(true);
    expect(await hasBlockBetween({ block: { findFirst: jest.fn().mockResolvedValue(null) } }, 'a', 'b')).toBe(false);
  });
});
