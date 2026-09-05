import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeClubCursor } from './cursor.util';
import { ClubsService } from './clubs.service';

function buildPrismaMock() {
  const prisma = {
    clubPage: {
      // findMany is called TWICE by listClubs as of Decision Log #154:
      // once for the club page, then once for the per-caller membership
      // subset. Tests that reach the second call use
      // .mockResolvedValueOnce(...) per call in sequence (same technique
      // feed.service.spec.ts uses for post.findUnique's multiple call
      // sites). findFirst is new — getClubById's single membership check.
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    },
    // getClubMembers (sprint-2/club-fan-page-backend) reads the roster
    // via user.findMany, filtered to ClubPage.members minus
    // restricted-pending minors.
    user: {
      findMany: jest.fn().mockResolvedValue([]),
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
      (prisma.clubPage.findMany as jest.Mock)
        .mockResolvedValueOnce(rows) // the club page
        .mockResolvedValueOnce([]); // membership subset — caller is in none

      const service = new ClubsService(prisma);
      const result = await service.listClubs({}, 'user-1');

      expect((prisma.clubPage.findMany as jest.Mock).mock.calls[0][0]).toEqual(
        expect.objectContaining({
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
          select: expect.objectContaining({ id: true, name: true, memberCount: true }),
        }),
      );
      expect(result).toEqual({
        items: rows.map((r) => ({ ...r, joined: false })),
        nextCursor: null,
      });
    });

    it('never selects `members` on the list response (low-bandwidth discipline, Section 5.5)', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValueOnce([]);

      const service = new ClubsService(prisma);
      await service.listClubs({}, 'user-1');

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
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValueOnce(rows).mockResolvedValueOnce([]);

      const service = new ClubsService(prisma);
      const result = await service.listClubs({ limit }, 'user-1');

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(encodeClubCursor({ name: 'Alpha FC', id: 'club-1' }));
    });

    it('applies the cursor as a strict "after this (name, id)" filter, ANDed with any league/country filters', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValueOnce([]);
      const cursor = encodeClubCursor({ name: 'Alpha FC', id: 'club-1' });

      const service = new ClubsService(prisma);
      await service.listClubs({ cursor, league: 'Sunday League', country: 'England' }, 'user-1');

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

      await expect(service.listClubs({ cursor: 'not-valid-base64json' }, 'user-1')).rejects.toThrow();
    });

    // --- Decision Log #154: per-caller `joined` on GET /clubs ---

    it('attaches `joined` per club from the caller\'s membership rows on a mixed page', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildClubRow({ id: 'club-a', name: 'Alpha FC' }),
        buildClubRow({ id: 'club-b', name: 'Beta FC' }),
        buildClubRow({ id: 'club-c', name: 'Gamma FC' }),
      ];
      (prisma.clubPage.findMany as jest.Mock)
        .mockResolvedValueOnce(rows)
        .mockResolvedValueOnce([{ id: 'club-a' }, { id: 'club-c' }]); // caller is a member of a and c

      const service = new ClubsService(prisma);
      const result = await service.listClubs({}, 'user-1');

      const byId = Object.fromEntries(result.items.map((c) => [c.id, c.joined]));
      expect(byId).toEqual({ 'club-a': true, 'club-b': false, 'club-c': true });
    });

    it('resolves `joined` for the whole page in exactly ONE membership query, keyed on the page\'s ids (no N+1)', async () => {
      const prisma = buildPrismaMock();
      const rows = [
        buildClubRow({ id: 'club-a', name: 'Alpha FC' }),
        buildClubRow({ id: 'club-b', name: 'Beta FC' }),
        buildClubRow({ id: 'club-c', name: 'Gamma FC' }),
      ];
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValueOnce(rows).mockResolvedValueOnce([]);

      const service = new ClubsService(prisma);
      await service.listClubs({}, 'user-1');

      // Call 0 = the club page, call 1 = the single batched membership subset.
      expect(prisma.clubPage.findMany).toHaveBeenCalledTimes(2);
      expect((prisma.clubPage.findMany as jest.Mock).mock.calls[1][0]).toEqual({
        where: { id: { in: ['club-a', 'club-b', 'club-c'] }, members: { some: { id: 'user-1' } } },
        select: { id: true },
      });
    });

    it('issues NO membership query when the page has zero clubs', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findMany as jest.Mock).mockResolvedValueOnce([]);

      const service = new ClubsService(prisma);
      const result = await service.listClubs({}, 'user-1');

      expect(result.items).toEqual([]);
      expect(prisma.clubPage.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getClubById', () => {
    it('returns the club (lean select shape) with joined: false when the caller is not a member', async () => {
      const prisma = buildPrismaMock();
      const row = buildClubRow();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(row);
      (prisma.clubPage.findFirst as jest.Mock).mockResolvedValue(null);

      const service = new ClubsService(prisma);
      const result = await service.getClubById('club-1', 'user-1');

      expect(result).toEqual({ ...row, joined: false });
    });

    it('returns joined: true when a membership row exists for the caller', async () => {
      const prisma = buildPrismaMock();
      const row = buildClubRow();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(row);
      (prisma.clubPage.findFirst as jest.Mock).mockResolvedValue({ id: 'club-1' });

      const service = new ClubsService(prisma);
      const result = await service.getClubById('club-1', 'user-1');

      expect(result.joined).toBe(true);
      expect((prisma.clubPage.findFirst as jest.Mock).mock.calls[0][0]).toEqual({
        where: { id: 'club-1', members: { some: { id: 'user-1' } } },
        select: { id: true },
      });
    });

    it('throws NotFoundException for a non-existent id, before any membership lookup', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new ClubsService(prisma);
      await expect(service.getClubById('missing', 'user-1')).rejects.toThrow(NotFoundException);
      expect(prisma.clubPage.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('getClubMembers', () => {
    const memberRow = (id: string, displayName: string) => ({ id, displayName });

    it('throws NotFoundException for a non-existent club, before querying users', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new ClubsService(prisma);
      await expect(service.getClubMembers('missing', {})).rejects.toThrow(NotFoundException);
      expect((prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany).not.toHaveBeenCalled();
    });

    it('queries ClubPage.members for this club, excludes restricted-pending minors, and orders by displayName asc, id asc', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue({ id: 'club-1' });
      (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany.mockResolvedValue([
        memberRow('u-1', 'Ada Lovelace'),
      ]);

      const service = new ClubsService(prisma);
      const result = await service.getClubMembers('club-1', {});

      const callArgs = (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany.mock.calls[0][0];
      expect(callArgs.where.AND).toEqual([
        { clubMemberships: { some: { id: 'club-1' } } },
        { OR: [{ isMinor: false }, { guardian: { consentStatus: 'confirmed' } }] },
      ]);
      expect(callArgs.orderBy).toEqual([{ displayName: 'asc' }, { id: 'asc' }]);
      expect(callArgs.select).toEqual({ id: true, displayName: true });
      expect(result).toEqual({ items: [memberRow('u-1', 'Ada Lovelace')], nextCursor: null });
    });

    it('never selects email / isMinor / passwordHash on a roster entry', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue({ id: 'club-1' });

      const service = new ClubsService(prisma);
      await service.getClubMembers('club-1', {});

      const select = (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany.mock.calls[0][0].select;
      expect(select).not.toHaveProperty('email');
      expect(select).not.toHaveProperty('isMinor');
      expect(select).not.toHaveProperty('passwordHash');
    });

    it('builds a nextCursor (displayName, id) from the last kept row when a lookahead row exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue({ id: 'club-1' });
      (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany.mockResolvedValue([
        memberRow('u-1', 'Ada'),
        memberRow('u-2', 'Bo'), // lookahead
      ]);

      const service = new ClubsService(prisma);
      const result = await service.getClubMembers('club-1', { limit: 1 });

      expect(result.items).toEqual([memberRow('u-1', 'Ada')]);
      expect(result.nextCursor).toBe(encodeClubCursor({ name: 'Ada', id: 'u-1' }));
    });

    it('applies the cursor as a strict "after this (displayName, id)" filter ANDed with the club + visibility filters', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue({ id: 'club-1' });
      const cursor = encodeClubCursor({ name: 'Ada', id: 'u-1' });

      const service = new ClubsService(prisma);
      await service.getClubMembers('club-1', { cursor });

      const where = (prisma as unknown as { user: { findMany: jest.Mock } }).user.findMany.mock.calls[0][0].where;
      expect(where.AND[2]).toEqual({
        OR: [{ displayName: { gt: 'Ada' } }, { displayName: 'Ada', id: { gt: 'u-1' } }],
      });
    });

    it('rejects a malformed cursor with a 400', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue({ id: 'club-1' });

      const service = new ClubsService(prisma);
      await expect(service.getClubMembers('club-1', { cursor: 'not-valid' })).rejects.toThrow();
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

  describe('leaveClub', () => {
    it('throws NotFoundException when :id does not reference a real ClubPage, before ever touching the join table', async () => {
      const prisma = buildPrismaMock();
      (prisma.clubPage.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma as unknown as { clubPage: { updateMany: jest.Mock } }).clubPage.updateMany = jest.fn();

      const service = new ClubsService(prisma);
      await expect(service.leaveClub('user-1', 'missing')).rejects.toThrow(NotFoundException);
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('on a genuine leave (raw delete affects 1 row), decrements memberCount exactly once', async () => {
      const prisma = buildPrismaMock();
      (prisma as unknown as { clubPage: { updateMany: jest.Mock } }).clubPage.updateMany = jest.fn().mockResolvedValue({ count: 1 });
      (prisma.clubPage.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'club-1' }) // assertClubExists
        .mockResolvedValueOnce({ memberCount: 0 }); // currentMemberCount, post-leave
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      const service = new ClubsService(prisma);
      const result = await service.leaveClub('user-1', 'club-1');

      expect((prisma as unknown as { clubPage: { updateMany: jest.Mock } }).clubPage.updateMany).toHaveBeenCalledWith({
        where: { id: 'club-1', memberCount: { gt: 0 } },
        data: { memberCount: { decrement: 1 } },
      });
      expect(result).toEqual({ clubId: 'club-1', joined: false, memberCount: 0 });
    });

    it('idempotent: leaving a club you are not a member of (raw delete affects 0 rows) does NOT decrement memberCount, and is not a 404', async () => {
      const prisma = buildPrismaMock();
      const updateMany = jest.fn();
      (prisma as unknown as { clubPage: { updateMany: jest.Mock } }).clubPage.updateMany = updateMany;
      (prisma.clubPage.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'club-1' }) // assertClubExists
        .mockResolvedValueOnce({ memberCount: 0 }); // currentMemberCount, unchanged
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(0); // DELETE affected nothing — never a member

      const service = new ClubsService(prisma);
      const result = await service.leaveClub('user-1', 'club-1');

      expect(updateMany).not.toHaveBeenCalled();
      expect(result).toEqual({ clubId: 'club-1', joined: false, memberCount: 0 });
    });

    it('never lets memberCount go negative, even if leaveClub is called repeatedly on a club already at 0', async () => {
      const prisma = buildPrismaMock();
      let memberCount = 0;
      // Simulates the `memberCount: { gt: 0 }` guard actually enforced by
      // Postgres's real WHERE clause: updateMany is a no-op once
      // memberCount is already 0, exactly mirroring FeedService.unlikePost's
      // own likeCount floor-guard test precedent.
      const updateMany = jest.fn().mockImplementation(async () => {
        if (memberCount > 0) {
          memberCount -= 1;
          return { count: 1 };
        }
        return { count: 0 };
      });
      (prisma as unknown as { clubPage: { updateMany: jest.Mock } }).clubPage.updateMany = updateMany;
      (prisma.clubPage.findUnique as jest.Mock).mockImplementation(
        async (args: { select?: Record<string, boolean> }) => {
          if (args.select?.memberCount) return { memberCount };
          return { id: 'club-1' };
        },
      );
      // A stale membership row exists (raw DELETE affects 1 row) even
      // though memberCount is already 0 — the exact hypothetical drift
      // scenario the updateMany floor-guard exists to protect against.
      (prisma.$executeRaw as jest.Mock).mockResolvedValue(1);

      const service = new ClubsService(prisma);
      const first = await service.leaveClub('user-1', 'club-1');
      expect(first.memberCount).toBe(0);

      const second = await service.leaveClub('user-1', 'club-1');
      expect(second.memberCount).toBe(0);

      expect(memberCount).toBeGreaterThanOrEqual(0);
    });
  });
});
