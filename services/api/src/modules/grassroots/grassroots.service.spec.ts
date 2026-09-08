import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { encodeFixtureCursor, encodeTeamCursor } from './cursor.util';
import { GrassrootsService } from './grassroots.service';

function buildPrismaMock() {
  const prisma = {
    grassrootsTeam: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    fixture: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    result: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;

  // Interactive-transaction mock: invoke the callback with the same mock
  // object standing in for `tx`, so normal await/throw control flow
  // behaves like a real transaction — same shape as clubs.service.spec.ts.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn(
    (fn: (tx: unknown) => unknown) => fn(prisma),
  );

  return prisma;
}

const P2002 = new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
  code: 'P2002',
  clientVersion: 'test',
});

describe('GrassrootsService', () => {
  // ---------- Teams ----------

  describe('createTeam', () => {
    it('creates a team with createdById = the caller (never the body), and passes name/city/leagueType through', async () => {
      const prisma = buildPrismaMock();
      const created = { id: 't-1', name: 'Hackney Wick FC', city: 'London', leagueType: 'informal', createdById: 'user-1', verified: false };
      (prisma.grassrootsTeam.create as jest.Mock).mockResolvedValue(created);

      const service = new GrassrootsService(prisma);
      const result = await service.createTeam('user-1', { name: 'Hackney Wick FC', city: 'London', leagueType: 'informal' });

      expect((prisma.grassrootsTeam.create as jest.Mock).mock.calls[0][0].data).toEqual({
        name: 'Hackney Wick FC',
        city: 'London',
        leagueType: 'informal',
        createdById: 'user-1',
      });
      expect(result).toEqual(created);
    });

    it('never selects the organiser\'s nested User / email on the response', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.create as jest.Mock).mockResolvedValue({});

      const service = new GrassrootsService(prisma);
      await service.createTeam('user-1', { name: 'AA', city: 'BB', leagueType: 'school' });

      const select = (prisma.grassrootsTeam.create as jest.Mock).mock.calls[0][0].select;
      expect(select).not.toHaveProperty('createdBy');
      expect(select).not.toHaveProperty('email');
      expect(select).toEqual({ id: true, name: true, city: true, leagueType: true, createdById: true, verified: true });
    });
  });

  describe('getTeamById', () => {
    it('throws NotFoundException for a non-existent id', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new GrassrootsService(prisma);
      await expect(service.getTeamById('missing')).rejects.toThrow(NotFoundException);
    });

    it('returns the lean team shape (no organiser PII)', async () => {
      const prisma = buildPrismaMock();
      const row = { id: 't-1', name: 'X', city: 'Y', leagueType: 'academy', createdById: 'user-9', verified: true };
      (prisma.grassrootsTeam.findUnique as jest.Mock).mockResolvedValue(row);

      const service = new GrassrootsService(prisma);
      expect(await service.getTeamById('t-1')).toEqual(row);
      const select = (prisma.grassrootsTeam.findUnique as jest.Mock).mock.calls[0][0].select;
      expect(select).not.toHaveProperty('createdBy');
    });
  });

  describe('listTeams', () => {
    const teamRow = (id: string, name: string) => ({ id, name, city: 'London', leagueType: 'informal', createdById: 'u', verified: false });

    it('orders by name asc, id asc and returns the lean shape', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findMany as jest.Mock).mockResolvedValue([teamRow('t-1', 'Alpha')]);

      const service = new GrassrootsService(prisma);
      const result = await service.listTeams({});

      expect((prisma.grassrootsTeam.findMany as jest.Mock).mock.calls[0][0].orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
      expect(result).toEqual({ items: [teamRow('t-1', 'Alpha')], nextCursor: null });
    });

    it('applies an optional city filter as an exact-match equality, ANDed with the cursor filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findMany as jest.Mock).mockResolvedValue([]);
      const cursor = encodeTeamCursor({ name: 'Alpha', id: 't-1' });

      const service = new GrassrootsService(prisma);
      await service.listTeams({ city: 'Bristol', cursor });

      expect((prisma.grassrootsTeam.findMany as jest.Mock).mock.calls[0][0].where).toEqual({
        AND: [
          { city: 'Bristol' },
          { OR: [{ name: { gt: 'Alpha' } }, { name: 'Alpha', id: { gt: 't-1' } }] },
        ],
      });
    });

    it('builds a nextCursor from the last kept row when a lookahead row exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findMany as jest.Mock).mockResolvedValue([teamRow('t-1', 'Alpha'), teamRow('t-2', 'Beta')]);

      const service = new GrassrootsService(prisma);
      const result = await service.listTeams({ limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBe(encodeTeamCursor({ name: 'Alpha', id: 't-1' }));
    });

    it('rejects a malformed cursor with a 400', async () => {
      const prisma = buildPrismaMock();
      const service = new GrassrootsService(prisma);
      await expect(service.listTeams({ cursor: 'not-valid' })).rejects.toThrow(BadRequestException);
    });
  });

  // ---------- Fixtures ----------

  describe('createFixture', () => {
    const dto = { teamAId: 'a', teamBId: 'b', scheduledAt: '2026-10-01T14:00:00.000Z', venue: 'Hackney Marshes' };

    function armTeamExists(prisma: PrismaService, existing: Record<string, boolean>) {
      (prisma.grassrootsTeam.findUnique as jest.Mock).mockImplementation(async (args: { where: { id: string } }) =>
        existing[args.where.id] ? { id: args.where.id } : null,
      );
    }

    it('404s when teamA does not exist, before the authz check', async () => {
      const prisma = buildPrismaMock();
      armTeamExists(prisma, { b: true });

      const service = new GrassrootsService(prisma);
      await expect(service.createFixture('user-1', dto)).rejects.toThrow(NotFoundException);
      expect(prisma.grassrootsTeam.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('404s when the provided teamB does not exist', async () => {
      const prisma = buildPrismaMock();
      armTeamExists(prisma, { a: true });

      const service = new GrassrootsService(prisma);
      await expect(service.createFixture('user-1', dto)).rejects.toThrow(NotFoundException);
    });

    it('400s when teamB === teamA', async () => {
      const prisma = buildPrismaMock();
      armTeamExists(prisma, { a: true });

      const service = new GrassrootsService(prisma);
      await expect(
        service.createFixture('user-1', { ...dto, teamBId: 'a' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('403s when the caller is not the creator of teamA', async () => {
      const prisma = buildPrismaMock();
      armTeamExists(prisma, { a: true, b: true });
      (prisma.grassrootsTeam.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdById: 'someone-else' });

      const service = new GrassrootsService(prisma);
      await expect(service.createFixture('user-1', dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.fixture.create).not.toHaveBeenCalled();
    });

    it('creates a scheduled fixture when the caller owns teamA; teamBId null when omitted (Opponent TBC)', async () => {
      const prisma = buildPrismaMock();
      armTeamExists(prisma, { a: true });
      (prisma.grassrootsTeam.findUniqueOrThrow as jest.Mock).mockResolvedValue({ createdById: 'user-1' });
      (prisma.fixture.create as jest.Mock).mockResolvedValue({ id: 'f-1', status: 'scheduled' });

      const service = new GrassrootsService(prisma);
      await service.createFixture('user-1', { teamAId: 'a', scheduledAt: '2026-10-01T14:00:00.000Z' });

      const data = (prisma.fixture.create as jest.Mock).mock.calls[0][0].data;
      expect(data.teamBId).toBeNull();
      expect(data.venue).toBeNull();
      expect(data).not.toHaveProperty('status'); // relies on the @default('scheduled')
      expect(data.scheduledAt).toEqual(new Date('2026-10-01T14:00:00.000Z'));
    });
  });

  describe('getFixtureById', () => {
    it('404s for a non-existent id', async () => {
      const prisma = buildPrismaMock();
      (prisma.fixture.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new GrassrootsService(prisma);
      await expect(service.getFixtureById('missing')).rejects.toThrow(NotFoundException);
    });

    it('includes status, both teams and the result via select', async () => {
      const prisma = buildPrismaMock();
      (prisma.fixture.findUnique as jest.Mock).mockResolvedValue({ id: 'f-1' });
      const service = new GrassrootsService(prisma);
      await service.getFixtureById('f-1');
      const select = (prisma.fixture.findUnique as jest.Mock).mock.calls[0][0].select;
      expect(select.status).toBe(true);
      expect(select.teamA).toBeDefined();
      expect(select.teamB).toBeDefined();
      expect(select.result).toBeDefined();
    });
  });

  describe('listTeamFixtures', () => {
    it('404s when the team is missing', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new GrassrootsService(prisma);
      await expect(service.listTeamFixtures('missing', {})).rejects.toThrow(NotFoundException);
    });

    it('scopes to fixtures where the team is teamA OR teamB, ordered scheduledAt desc, id desc', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findUnique as jest.Mock).mockResolvedValue({ id: 't-1' });
      (prisma.fixture.findMany as jest.Mock).mockResolvedValue([]);

      const service = new GrassrootsService(prisma);
      await service.listTeamFixtures('t-1', {});

      const args = (prisma.fixture.findMany as jest.Mock).mock.calls[0][0];
      expect(args.where.AND[0]).toEqual({ OR: [{ teamAId: 't-1' }, { teamBId: 't-1' }] });
      expect(args.orderBy).toEqual([{ scheduledAt: 'desc' }, { id: 'desc' }]);
    });

    it('applies the cursor as a strict "before this (scheduledAt, id)" descending filter', async () => {
      const prisma = buildPrismaMock();
      (prisma.grassrootsTeam.findUnique as jest.Mock).mockResolvedValue({ id: 't-1' });
      const when = new Date('2026-10-01T14:00:00.000Z');
      const cursor = encodeFixtureCursor({ scheduledAt: when, id: 'f-1' });

      const service = new GrassrootsService(prisma);
      await service.listTeamFixtures('t-1', { cursor });

      const where = (prisma.fixture.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.AND[1]).toEqual({
        OR: [
          { scheduledAt: { lt: when } },
          { scheduledAt: when, id: { lt: 'f-1' } },
        ],
      });
    });
  });

  // ---------- logResult ----------

  describe('logResult', () => {
    const dto = { scoreA: 2, scoreB: 1 };

    function armFixture(prisma: PrismaService, row: Record<string, unknown>) {
      (prisma.fixture.findUnique as jest.Mock).mockResolvedValue(row);
    }

    it('404s for a non-existent fixture', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, null as unknown as Record<string, unknown>);
      const service = new GrassrootsService(prisma);
      await expect(service.logResult('user-1', 'missing', dto)).rejects.toThrow(NotFoundException);
    });

    it('403s (before any status/result check) when the caller manages neither team', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'scheduled', teamBId: 'b',
        teamA: { createdById: 'owner-a' }, teamB: { createdById: 'owner-b' }, result: null,
      });
      const service = new GrassrootsService(prisma);
      await expect(service.logResult('stranger', 'f-1', dto)).rejects.toThrow(ForbiddenException);
      expect(prisma.result.create).not.toHaveBeenCalled();
    });

    it('allows the creator of teamB (not just teamA) to log the result', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'live', teamBId: 'b',
        teamA: { createdById: 'owner-a' }, teamB: { createdById: 'owner-b' }, result: null,
      });
      (prisma.fixture.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce({ status: 'live', result: null })
        .mockResolvedValueOnce({ id: 'f-1', status: 'full_time' });
      (prisma.result.create as jest.Mock).mockResolvedValue({});
      (prisma.fixture.update as jest.Mock).mockResolvedValue({});

      const service = new GrassrootsService(prisma);
      const out = await service.logResult('owner-b', 'f-1', dto);
      expect(out).toEqual({ id: 'f-1', status: 'full_time' });
    });

    it('409s with a "wrong status" message when the fixture is full_time with NO result (PATCH live -> full_time path)', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'full_time', teamBId: null,
        teamA: { createdById: 'owner-a' }, teamB: null, result: null,
      });
      const service = new GrassrootsService(prisma);
      await expect(service.logResult('owner-a', 'f-1', dto)).rejects.toThrow(/can only be recorded/);
    });

    it('409s with an "already recorded" message (checked BEFORE the status check) when a Result already exists', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'full_time', teamBId: null,
        teamA: { createdById: 'owner-a' }, teamB: null, result: { id: 'r-1' },
      });
      const service = new GrassrootsService(prisma);
      await expect(service.logResult('owner-a', 'f-1', dto)).rejects.toThrow(/already been recorded/);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('409s inside the transaction if a Result appears between the pre-check and the transaction', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'live', teamBId: null,
        teamA: { createdById: 'owner-a' }, teamB: null, result: null,
      });
      (prisma.fixture.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({ status: 'live', result: { id: 'r-late' } });

      const service = new GrassrootsService(prisma);
      await expect(service.logResult('owner-a', 'f-1', dto)).rejects.toThrow(ConflictException);
      expect(prisma.result.create).not.toHaveBeenCalled();
    });

    it('re-throws a genuine concurrent P2002 on result.create as the same 409, never a 500', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'scheduled', teamBId: null,
        teamA: { createdById: 'owner-a' }, teamB: null, result: null,
      });
      (prisma.fixture.findUniqueOrThrow as jest.Mock).mockResolvedValueOnce({ status: 'scheduled', result: null });
      (prisma.result.create as jest.Mock).mockRejectedValue(P2002);

      const service = new GrassrootsService(prisma);
      await expect(service.logResult('owner-a', 'f-1', dto)).rejects.toThrow(ConflictException);
    });

    it('on success creates the Result with enteredById = caller and moves the fixture to full_time', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, {
        id: 'f-1', status: 'scheduled', teamBId: 'b',
        teamA: { createdById: 'owner-a' }, teamB: { createdById: 'owner-b' }, result: null,
      });
      (prisma.fixture.findUniqueOrThrow as jest.Mock)
        .mockResolvedValueOnce({ status: 'scheduled', result: null })
        .mockResolvedValueOnce({ id: 'f-1', status: 'full_time', result: { scoreA: 2, scoreB: 1 } });
      (prisma.result.create as jest.Mock).mockResolvedValue({});
      (prisma.fixture.update as jest.Mock).mockResolvedValue({});

      const service = new GrassrootsService(prisma);
      const out = await service.logResult('owner-a', 'f-1', dto);

      expect((prisma.result.create as jest.Mock).mock.calls[0][0].data).toEqual({
        fixtureId: 'f-1', scoreA: 2, scoreB: 1, enteredById: 'owner-a',
      });
      expect(prisma.fixture.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: { status: 'full_time' } });
      expect(out).toEqual({ id: 'f-1', status: 'full_time', result: { scoreA: 2, scoreB: 1 } });
    });
  });

  // ---------- updateFixtureStatus ----------

  describe('updateFixtureStatus', () => {
    function armFixture(prisma: PrismaService, status: string, opts: { teamBId?: string | null; ownerB?: string } = {}) {
      (prisma.fixture.findUnique as jest.Mock).mockResolvedValue({
        id: 'f-1', status, teamBId: opts.teamBId ?? null,
        teamA: { createdById: 'owner-a' },
        teamB: opts.ownerB ? { createdById: opts.ownerB } : null,
        result: null,
      });
      (prisma.fixture.findUniqueOrThrow as jest.Mock).mockResolvedValue({ id: 'f-1', status: 'x' });
      (prisma.fixture.update as jest.Mock).mockResolvedValue({});
    }

    it('404s for a non-existent fixture', async () => {
      const prisma = buildPrismaMock();
      (prisma.fixture.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new GrassrootsService(prisma);
      await expect(service.updateFixtureStatus('owner-a', 'missing', { status: 'live' })).rejects.toThrow(NotFoundException);
    });

    it('403s when the caller manages neither team', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, 'scheduled');
      const service = new GrassrootsService(prisma);
      await expect(service.updateFixtureStatus('stranger', 'f-1', { status: 'live' })).rejects.toThrow(ForbiddenException);
      expect(prisma.fixture.update).not.toHaveBeenCalled();
    });

    it('allows scheduled -> live', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, 'scheduled');
      const service = new GrassrootsService(prisma);
      await service.updateFixtureStatus('owner-a', 'f-1', { status: 'live' });
      expect(prisma.fixture.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: { status: 'live' } });
    });

    it('allows live -> full_time (by either team\'s creator)', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, 'live', { teamBId: 'b', ownerB: 'owner-b' });
      const service = new GrassrootsService(prisma);
      await service.updateFixtureStatus('owner-b', 'f-1', { status: 'full_time' });
      expect(prisma.fixture.update).toHaveBeenCalledWith({ where: { id: 'f-1' }, data: { status: 'full_time' } });
    });

    it('409s on scheduled -> full_time (that path is result-only, not via PATCH)', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, 'scheduled');
      const service = new GrassrootsService(prisma);
      await expect(service.updateFixtureStatus('owner-a', 'f-1', { status: 'full_time' })).rejects.toThrow(ConflictException);
    });

    it('409s on a no-op same-status PATCH (live -> live)', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, 'live');
      const service = new GrassrootsService(prisma);
      await expect(service.updateFixtureStatus('owner-a', 'f-1', { status: 'live' })).rejects.toThrow(ConflictException);
    });

    it('409s on any move out of full_time, naming the current and requested status', async () => {
      const prisma = buildPrismaMock();
      armFixture(prisma, 'full_time');
      const service = new GrassrootsService(prisma);
      await expect(service.updateFixtureStatus('owner-a', 'f-1', { status: 'live' })).rejects.toThrow(
        /"full_time" to "live"/,
      );
    });
  });
});
