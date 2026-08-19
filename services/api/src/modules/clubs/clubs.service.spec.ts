import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeClubCursor } from './cursor.util';
import { ClubsService } from './clubs.service';

function buildPrismaMock() {
  const prisma = {
    clubPage: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    // $executeRaw backs joinClub()'s raw "INSERT ... ON CONFLICT DO
    // NOTHING" against the implicit _ClubMembership join table — see
    // clubs.service.ts's own comment for why this, and not a P2002 catch
    // like FeedService.likePost, is the idempotency mechanism here.
    // Tests override the resolved value per-case (1 = genuine insert,
    // 0 = duplicate/no-op), matching $executeRaw's real return type
    // (affected row count).
    $executeRaw: jest.fn(),
  } as unknown as PrismaService;

  // Same interactive-transaction mock shape as feed.service.spec.ts:
  // invoke the callback with the same mock object standing in for `tx`,
  // so normal await/throw control flow behaves like a real transaction.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );

  return prisma;
}

function buildClubRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'club-1',
    name: 'Riverside FC',
    league: 'Sunday League',
    country: 'England',
    logoUrl: null,
    memberCount: 0,
    ...overrides,
  };
}

describe('ClubsService', () => {
  describe('listClubs', () => {
    it('orders alphabetically by name asc, id asc, and returns the lean select shape', async () => {
      const prisma = buildPrismaMock();
      const rows = [buildClubRow({ id: 'club-1', name: 'Alpha FC' })];
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValue(rows);

      const service = new ClubsService(prisma);
      const result = await service.listClubs({});

      expect(prisma.clubPage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: expect.objectContaining({ id: true, name: true, memberCount: true }),
        }),
      );
      expect(result).toEqual({ items: rows, nextCursor: null });
    });

    it('never selects `members` on the list response (low-bandwidth discipline, Section 5.5)', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValue([]);

      const service = new ClubsService(prisma);
      await service.listClubs({});

      const callArgs = (prisma.clubPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.select).not.toHaveProperty('members');
      expect(callArgs.select).not.toHaveProperty('affiliatedPlayers');
      expect(callArgs.select).not.toHaveProperty('posts');
    });

    it('builds a nextCursor from the last kept row when more rows exist than the page size', async () => {
      const prisma = buildPrismaMock();
      const limit = 1;
      const rows = [
        buildClubRow({ id: 'club-1', name: 'Alpha FC' }),
        buildClubRow({ id: 'club-2', name: 'Beta FC' }), // lookahead row
      ];
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValue(rows);

      const service = new ClubsService(prisma);
      const result = await service.listClubs({ limit });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(encodeClubCursor({ name: 'Alpha FC', id: 'club-1' }));
    });

    it('applies the cursor as a strict "after this (name, id)" filter, ANDed with any league/country filters', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValue([]);
      const cursor = encodeClubCursor({ name: 'Alpha FC', id: 'club-1' });

      const service = new ClubsService(prisma);
      await service.listClubs({ cursor, league: 'Sunday League', country: 'England' });

      const callArgs = (prisma.clubPage.findMany as jest.Mock).mock.calls[0][0];
      expect(callArgs.where).toEqual({
        AND: [
          { league: 'Sunday League' },
          { country: 'England' },
          { OR: [{ name: { gt: 'Alpha FC' } }, { name: 'Alpha FC', id: { gt: 'club-1' } }] },
        ],
      });
    });

    it('rejects a malformed cursor with a 400', async () => {
      const prisma = buildPrismaMock();
      const service = new ClubsService(prisma);

      await expect(service.listClubs({ cursor: 'not-valid-base64json' })).rejects.toThrow();
    });
  });

  describe('getClubById', () => {
    it('returns the club with the same lean select shape as the list', async () => {
      const prisma = buildPrismaMock();
      const row = buildClubRow();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(row);

      const service = new ClubsService(prisma);
      const result = await service.getClubById('club-1');

      expect(result).toEqual(row);
    });

    it('throws NotFoundException for a non-existent id', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new ClubsService(prisma);
      await expect(service.getClubById('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('joinClub', () => {
    it('throws NotFoundException when :id does not reference a real ClubPage, before ever touching the join table', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new ClubsService(prisma);
      await expect(service.joinClub('user-1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('on a genuine new join (raw insert affects 1 row), increments memberCount exactly once', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'club-1' }) // assertClubExists
        .mockResolvedValueOnce({ memberCount: 1 }); // currentMemberCount, post-join
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);
      (prisma.clubPage.update as jest.Mock).mockResolvedValue(buildClubRow({ memberCount: 1 }));

      const service = new ClubsService(prisma);
      const result = await service.joinClub('user-1', 'club-1');

      expect(prisma.clubPage.update).toHaveBeenCalledWith({
        where: { id: 'club-1' },
        data: { memberCount: { increment: 1 } },
      });
      expect(result).toEqual({ clubId: 'club-1', joined: true, memberCount: 1 });
    });

    it('idempotent: on a duplicate join (raw insert affects 0 rows), does NOT increment memberCount a second time', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'club-1' }) // assertClubExists
        .mockResolvedValueOnce({ memberCount: 1 }); // currentMemberCount, unchanged
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(0); // ON CONFLICT DO NOTHING — already a member

      const service = new ClubsService(prisma);
      const result = await service.joinClub('user-1', 'club-1');

      expect(prisma.clubPage.update).not.toHaveBeenCalled();
      expect(result).toEqual({ clubId: 'club-1', joined: true, memberCount: 1 });
    });

    it('two sequential joinClub calls for the same (userId, clubId) leave memberCount exactly 1 higher than baseline, never 2', async () => {
      const prisma = buildPrismaMock();
      let memberCount = 0;
      (prisma.clubPage.findUnique as jest.Mock).mockImplementation(async (args: { select?: Record<string, boolean> }) => {
        if (args.select?.memberCount) return { memberCount };
        return { id: 'club-1' };
      });
      (prisma.clubPage.update as jest.Mock).mockImplementation(async () => {
        memberCount += 1;
        return buildClubRow({ memberCount });
      });

      const service = new ClubsService(prisma);

      (prisma.$executeRaw as jest.Mock).mockResolvedValueOnce(1); // first join: genuine insert
      const first = await service.joinClub('user-1', 'club-1');
      expect(first.memberCount).toBe(1);

      (prisma.$executeRaw as jest.Mock).mockResolvedValueOnce(0); // second join: duplicate, ON CONFLICT DO NOTHING
      const second = await service.joinClub('user-1', 'club-1');
      expect(second.memberCount).toBe(1);

      expect(prisma.clubPage.update).toHaveBeenCalledTimes(1);
    });
  });
});
