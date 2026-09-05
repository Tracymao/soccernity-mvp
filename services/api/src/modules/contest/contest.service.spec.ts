import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ContestService } from './contest.service';

function p2002(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.0.0',
    meta: { target },
  });
}

function buildMock() {
  const prisma = {
    contestCycle: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    contestRound: { findFirst: jest.fn(), update: jest.fn() },
    contestEntry: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    contestRoundWinner: { create: jest.fn() },
    contestStanding: { create: jest.fn() },
    pointsLedgerEntry: { create: jest.fn() },
    post: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

// A minimal cycle graph shape for getCycleById()'s findUnique (called at
// the end of every admin mutation to build the response). Rounds/standings
// default empty; individual tests override as needed.
function graphCycle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'cyc-1',
    title: 'Sept Contest',
    status: 'active',
    startsAt: new Date('2026-09-01T00:00:00.000Z'),
    endsAt: new Date('2026-09-28T00:00:00.000Z'),
    finalOpenedAt: null,
    crownedAt: null,
    rounds: [],
    standings: [],
    ...overrides,
  };
}

function round(week: number, over: Partial<Record<string, unknown>> = {}) {
  return {
    id: `rd-${week}`,
    cycleId: 'cyc-1',
    weekNumber: week,
    status: 'open',
    opensAt: new Date('2026-09-01T00:00:00.000Z'),
    closesAt: new Date('2026-12-01T00:00:00.000Z'),
    judgedAt: null,
    winners: [],
    ...over,
  };
}

describe('ContestService', () => {
  // ------------------------------------------------------------------
  // derivePhase — every phase of the weekly-progression state machine
  // ------------------------------------------------------------------
  describe('derivePhase', () => {
    it.each([
      ['active', 0, 'vacant'],
      ['active', 1, 'week_1'],
      ['active', 2, 'weeks_1_2'],
      ['active', 3, 'weeks_1_3'],
      ['final', 3, 'final_live'],
      ['final', 0, 'final_live'], // status wins over round count
      ['completed', 3, 'crowned'],
      ['completed', 0, 'crowned'],
    ])('status=%s judged=%d -> %s', (status, judged, expected) => {
      expect(ContestService.derivePhase(status as string, judged as number)).toBe(expected);
    });
  });

  // ------------------------------------------------------------------
  // getCurrentContest
  // ------------------------------------------------------------------
  describe('getCurrentContest', () => {
    it('returns an all-null / not-accepting response when no cycle has ever existed', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(null);

      const res = await new ContestService(prisma).getCurrentContest('u-1');

      expect(res).toEqual({
        cycle: null,
        phase: null,
        isAcceptingEntries: false,
        activeRound: null,
        rounds: [],
        weeklyWinners: [],
        monthlyStandings: [],
        callerEntry: null,
      });
    });

    it('isAcceptingEntries is true only when the cycle is active AND a round is open within its window', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(
        graphCycle({ status: 'active', rounds: [round(1)] }),
      );

      const res = await new ContestService(prisma).getCurrentContest('u-1');

      expect(res.phase).toBe('vacant');
      expect(res.isAcceptingEntries).toBe(true);
      expect(res.activeRound?.weekNumber).toBe(1);
    });

    it('isAcceptingEntries is false when the only round has closed (window in the past)', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(
        graphCycle({
          status: 'active',
          rounds: [round(1, { opensAt: new Date('2020-01-01'), closesAt: new Date('2020-01-08') })],
        }),
      );

      const res = await new ContestService(prisma).getCurrentContest('u-1');
      expect(res.isAcceptingEntries).toBe(false);
      expect(res.activeRound).toBeNull();
    });

    it('isAcceptingEntries is false during the final phase even with a nominally-open round row', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(
        graphCycle({ status: 'final', rounds: [round(1, { status: 'judged' }), round(2, { status: 'judged' }), round(3, { status: 'judged' })] }),
      );

      const res = await new ContestService(prisma).getCurrentContest('u-1');
      expect(res.phase).toBe('final_live');
      expect(res.isAcceptingEntries).toBe(false);
    });

    it('surfaces weeklyWinners progressively and only fills monthlyStandings once crowned', async () => {
      const prisma = buildMock();
      const winner = {
        entryId: 'e-1',
        position: 1,
        userId: 'u-9',
        user: { displayName: 'Nina' },
        entry: { postId: 'post-9' },
      };
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(
        graphCycle({
          status: 'active',
          rounds: [round(1, { status: 'judged', winners: [winner] }), round(2), round(3)],
        }),
      );

      const res = await new ContestService(prisma).getCurrentContest('u-1');
      expect(res.phase).toBe('week_1');
      expect(res.weeklyWinners).toEqual([
        { weekNumber: 1, position: 1, userId: 'u-9', displayName: 'Nina', entryId: 'e-1', postId: 'post-9' },
      ]);
      expect(res.monthlyStandings).toEqual([]);
    });

    it('falls back to the most recent completed cycle (phase crowned) when none is running', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock)
        .mockResolvedValueOnce(null) // no active/final
        .mockResolvedValueOnce(
          graphCycle({
            status: 'completed',
            crownedAt: new Date('2026-09-28T00:00:00.000Z'),
            standings: [{ position: 1, userId: 'u-9', user: { displayName: 'Nina' } }],
          }),
        );

      const res = await new ContestService(prisma).getCurrentContest('u-1');
      expect(res.phase).toBe('crowned');
      expect(res.monthlyStandings).toEqual([{ position: 1, userId: 'u-9', displayName: 'Nina' }]);
      expect(res.isAcceptingEntries).toBe(false);
    });

    it('reports callerEntry when the caller already has an entry in the open round', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(graphCycle({ rounds: [round(1)] }));
      (prisma.contestEntry.findUnique as jest.Mock).mockResolvedValue({ roundId: 'rd-1', postId: 'post-7' });

      const res = await new ContestService(prisma).getCurrentContest('u-1');
      expect(res.callerEntry).toEqual({ roundId: 'rd-1', weekNumber: 1, postId: 'post-7' });
      expect((prisma.contestEntry.findUnique as jest.Mock).mock.calls[0][0].where).toEqual({
        roundId_userId: { roundId: 'rd-1', userId: 'u-1' },
      });
    });
  });

  // ------------------------------------------------------------------
  // submitEntry
  // ------------------------------------------------------------------
  describe('submitEntry', () => {
    it('409 when no active cycle exists', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(new ContestService(prisma).submitEntry('u-1', 'post-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('409 when the active cycle has no open round right now', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue({ id: 'cyc-1' });
      (prisma.contestRound.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(new ContestService(prisma).submitEntry('u-1', 'post-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 when the post does not exist', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue({ id: 'cyc-1' });
      (prisma.contestRound.findFirst as jest.Mock).mockResolvedValue({ id: 'rd-1', weekNumber: 1 });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(new ContestService(prisma).submitEntry('u-1', 'post-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('403 when the post belongs to another user', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue({ id: 'cyc-1' });
      (prisma.contestRound.findFirst as jest.Mock).mockResolvedValue({ id: 'rd-1', weekNumber: 1 });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'someone-else' });
      await expect(new ContestService(prisma).submitEntry('u-1', 'post-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('creates the entry with the current cycle + open round, echoing the week number', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue({ id: 'cyc-1' });
      (prisma.contestRound.findFirst as jest.Mock).mockResolvedValue({ id: 'rd-2', weekNumber: 2 });
      (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'u-1' });
      (prisma.contestEntry.create as jest.Mock).mockResolvedValue({
        id: 'e-1',
        cycleId: 'cyc-1',
        roundId: 'rd-2',
        postId: 'post-1',
        submittedAt: new Date('2026-09-10T00:00:00.000Z'),
      });

      const res = await new ContestService(prisma).submitEntry('u-1', 'post-1');
      expect(prisma.contestEntry.create).toHaveBeenCalledWith({
        data: { cycleId: 'cyc-1', roundId: 'rd-2', postId: 'post-1', userId: 'u-1' },
        select: expect.any(Object),
      });
      expect(res).toMatchObject({ id: 'e-1', roundId: 'rd-2', weekNumber: 2 });
    });

    it('maps P2002 on postId to "post already entered", and P2002 on (roundId,userId) to "already entered this round"', async () => {
      const base = () => {
        const prisma = buildMock();
        (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue({ id: 'cyc-1' });
        (prisma.contestRound.findFirst as jest.Mock).mockResolvedValue({ id: 'rd-1', weekNumber: 1 });
        (prisma.post.findUnique as jest.Mock).mockResolvedValue({ id: 'post-1', authorId: 'u-1' });
        return prisma;
      };

      const a = base();
      (a.contestEntry.create as jest.Mock).mockRejectedValue(p2002(['postId']));
      await expect(new ContestService(a).submitEntry('u-1', 'post-1')).rejects.toThrow(/already been submitted/);

      const b = base();
      (b.contestEntry.create as jest.Mock).mockRejectedValue(p2002(['roundId', 'userId']));
      await expect(new ContestService(b).submitEntry('u-1', 'post-1')).rejects.toThrow(/already submitted an entry for this contest round/);
    });
  });

  // ------------------------------------------------------------------
  // recordRoundResults
  // ------------------------------------------------------------------
  describe('recordRoundResults', () => {
    function cycleWithRounds(rounds: { weekNumber: number; status: string }[], status = 'active') {
      return { id: 'cyc-1', status, rounds: rounds.map((r) => ({ id: `rd-${r.weekNumber}`, ...r })) };
    }

    it('404 when the cycle is missing', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        new ContestService(prisma).recordRoundResults('cyc-1', 1, { winners: [] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 when the cycle is not active', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(cycleWithRounds([{ weekNumber: 1, status: 'open' }], 'final'));
      await expect(
        new ContestService(prisma).recordRoundResults('cyc-1', 1, { winners: [] }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('409 when the round is already judged', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(cycleWithRounds([{ weekNumber: 1, status: 'judged' }]));
      await expect(
        new ContestService(prisma).recordRoundResults('cyc-1', 1, { winners: [] }),
      ).rejects.toThrow(/already been judged/);
    });

    it('409 when an earlier week is still open (sequential judging)', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(
        cycleWithRounds([
          { weekNumber: 1, status: 'open' },
          { weekNumber: 2, status: 'open' },
        ]),
      );
      await expect(
        new ContestService(prisma).recordRoundResults('cyc-1', 2, { winners: [] }),
      ).rejects.toThrow(/Week 1 must be judged before week 2/);
    });

    it('400 when a winner entry does not belong to this round', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(cycleWithRounds([{ weekNumber: 1, status: 'open' }]));
      (prisma.contestEntry.findMany as jest.Mock).mockResolvedValue([{ id: 'e-1', roundId: 'rd-OTHER', userId: 'u-1' }]);
      await expect(
        new ContestService(prisma).recordRoundResults('cyc-1', 1, { winners: [{ entryId: 'e-1', position: 1 }] }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('400 on a duplicate entryId in the payload', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(cycleWithRounds([{ weekNumber: 1, status: 'open' }]));
      await expect(
        new ContestService(prisma).recordRoundResults('cyc-1', 1, {
          winners: [{ entryId: 'e-1', position: 1 }, { entryId: 'e-1', position: 2 }],
        }),
      ).rejects.toThrow(/cannot appear twice/);
    });

    it('judges the round and awards each winner CONTEST_WEEKLY_WIN_POINTS[position] on the ledger', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock)
        .mockResolvedValueOnce(cycleWithRounds([{ weekNumber: 1, status: 'open' }])) // recordRoundResults' own read
        .mockResolvedValue(graphCycle({ status: 'active', rounds: [round(1, { status: 'judged' })] })); // getCycleById at the end
      (prisma.contestEntry.findMany as jest.Mock).mockResolvedValue([
        { id: 'e-1', roundId: 'rd-1', userId: 'winner-1' },
        { id: 'e-2', roundId: 'rd-1', userId: 'winner-2' },
      ]);

      await new ContestService(prisma).recordRoundResults('cyc-1', 1, {
        winners: [
          { entryId: 'e-1', position: 1 },
          { entryId: 'e-2', position: 2 },
        ],
      });

      expect(prisma.contestRound.update).toHaveBeenCalledWith({
        where: { id: 'rd-1' },
        data: { status: 'judged', judgedAt: expect.any(Date) },
      });
      expect(prisma.contestRoundWinner.create).toHaveBeenCalledWith({
        data: { roundId: 'rd-1', entryId: 'e-1', userId: 'winner-1', position: 1 },
      });
      const ledgerCalls = (prisma.pointsLedgerEntry.create as jest.Mock).mock.calls.map((c) => c[0].data);
      expect(ledgerCalls).toEqual([
        expect.objectContaining({ userId: 'winner-1', source: 'contest_weekly_win', refId: 'rd-1', points: 50 }),
        expect.objectContaining({ userId: 'winner-2', source: 'contest_weekly_win', refId: 'rd-1', points: 30 }),
      ]);
    });
  });

  // ------------------------------------------------------------------
  // openFinal
  // ------------------------------------------------------------------
  describe('openFinal', () => {
    it('409 when not all three rounds are judged', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue({
        id: 'cyc-1',
        status: 'active',
        rounds: [{ status: 'judged' }, { status: 'judged' }, { status: 'open' }],
      });
      await expect(new ContestService(prisma).openFinal('cyc-1')).rejects.toThrow(/three weekly rounds must be judged/);
    });

    it('409 when the cycle is not active', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue({ id: 'cyc-1', status: 'completed', rounds: [] });
      await expect(new ContestService(prisma).openFinal('cyc-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('flips status to final and stamps finalOpenedAt', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'cyc-1', status: 'active', rounds: [{ status: 'judged' }, { status: 'judged' }, { status: 'judged' }] })
        .mockResolvedValue(graphCycle({ status: 'final' }));

      await new ContestService(prisma).openFinal('cyc-1');

      expect(prisma.contestCycle.update).toHaveBeenCalledWith({
        where: { id: 'cyc-1' },
        data: { status: 'final', finalOpenedAt: expect.any(Date) },
      });
    });
  });

  // ------------------------------------------------------------------
  // crownCycle
  // ------------------------------------------------------------------
  describe('crownCycle', () => {
    it('409 when the cycle is not in the final phase', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue({ id: 'cyc-1', status: 'active', rounds: [] });
      await expect(
        new ContestService(prisma).crownCycle('cyc-1', { standings: [{ userId: 'u-1', position: 1 }] }),
      ).rejects.toThrow(/final must be open/);
    });

    it('400 when a crowned user was not a weekly winner of this cycle', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue({
        id: 'cyc-1',
        status: 'final',
        rounds: [{ winners: [{ userId: 'winner-1' }] }],
      });
      await expect(
        new ContestService(prisma).crownCycle('cyc-1', { standings: [{ userId: 'stranger', position: 1 }] }),
      ).rejects.toThrow(/not a weekly winner/);
    });

    it('completes the cycle and awards CONTEST_MONTHLY_CROWN_POINTS[position]', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock)
        .mockResolvedValueOnce({
          id: 'cyc-1',
          status: 'final',
          rounds: [{ winners: [{ userId: 'w-1' }, { userId: 'w-2' }] }],
        })
        .mockResolvedValue(graphCycle({ status: 'completed', crownedAt: new Date() }));

      await new ContestService(prisma).crownCycle('cyc-1', {
        standings: [
          { userId: 'w-1', position: 1 },
          { userId: 'w-2', position: 2 },
        ],
      });

      expect(prisma.contestCycle.update).toHaveBeenCalledWith({
        where: { id: 'cyc-1' },
        data: { status: 'completed', crownedAt: expect.any(Date) },
      });
      expect(prisma.contestStanding.create).toHaveBeenCalledWith({
        data: { cycleId: 'cyc-1', userId: 'w-1', position: 1 },
      });
      const ledgerCalls = (prisma.pointsLedgerEntry.create as jest.Mock).mock.calls.map((c) => c[0].data);
      expect(ledgerCalls).toEqual([
        expect.objectContaining({ userId: 'w-1', source: 'contest_monthly_crown', refId: 'cyc-1', points: 250 }),
        expect.objectContaining({ userId: 'w-2', source: 'contest_monthly_crown', refId: 'cyc-1', points: 150 }),
      ]);
    });
  });

  // ------------------------------------------------------------------
  // createCycle
  // ------------------------------------------------------------------
  describe('createCycle', () => {
    it('409 when a cycle is already running (active or final)', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue({ id: 'existing' });
      await expect(
        new ContestService(prisma).createCycle({
          title: 'X',
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-09-28T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('400 when startsAt is not before endsAt', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        new ContestService(prisma).createCycle({
          title: 'X',
          startsAt: '2026-09-28T00:00:00.000Z',
          endsAt: '2026-09-01T00:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('auto-generates three consecutive 7-day rounds from startsAt when rounds are omitted', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.contestCycle.create as jest.Mock).mockResolvedValue({ id: 'cyc-1' });
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(graphCycle());

      await new ContestService(prisma).createCycle({
        title: 'Sept',
        startsAt: '2026-09-01T00:00:00.000Z',
        endsAt: '2026-09-28T00:00:00.000Z',
      });

      const created = (prisma.contestCycle.create as jest.Mock).mock.calls[0][0].data.rounds.create;
      expect(created).toHaveLength(3);
      expect(created.map((r: { weekNumber: number }) => r.weekNumber)).toEqual([1, 2, 3]);
      expect(created[0].opensAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
      expect(created[0].closesAt).toEqual(new Date('2026-09-08T00:00:00.000Z'));
      expect(created[2].closesAt).toEqual(new Date('2026-09-22T00:00:00.000Z'));
    });

    it('400 when explicit rounds do not cover exactly weeks 1,2,3', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        new ContestService(prisma).createCycle({
          title: 'Sept',
          startsAt: '2026-09-01T00:00:00.000Z',
          endsAt: '2026-09-28T00:00:00.000Z',
          rounds: [
            { weekNumber: 1, opensAt: '2026-09-01T00:00:00.000Z', closesAt: '2026-09-08T00:00:00.000Z' },
            { weekNumber: 1, opensAt: '2026-09-08T00:00:00.000Z', closesAt: '2026-09-15T00:00:00.000Z' },
            { weekNumber: 3, opensAt: '2026-09-15T00:00:00.000Z', closesAt: '2026-09-22T00:00:00.000Z' },
          ],
        }),
      ).rejects.toThrow(/exactly weeks 1, 2 and 3/);
    });
  });

  // ------------------------------------------------------------------
  // getCycleById
  // ------------------------------------------------------------------
  describe('getCycleById', () => {
    it('404 for a missing cycle', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(new ContestService(prisma).getCycleById('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the cycle, its derived phase, rounds, weekly winners and standings', async () => {
      const prisma = buildMock();
      (prisma.contestCycle.findUnique as jest.Mock).mockResolvedValue(
        graphCycle({
          status: 'completed',
          crownedAt: new Date('2026-09-28T00:00:00.000Z'),
          rounds: [round(1, { status: 'judged', winners: [{ entryId: 'e-1', position: 1, userId: 'u-9', user: { displayName: 'Nina' }, entry: { postId: 'p-9' } }] }), round(2, { status: 'judged' }), round(3, { status: 'judged' })],
          standings: [{ position: 1, userId: 'u-9', user: { displayName: 'Nina' } }],
        }),
      );

      const res = await new ContestService(prisma).getCycleById('cyc-1');
      expect(res.phase).toBe('crowned');
      expect(res.rounds).toHaveLength(3);
      expect(res.weeklyWinners[0]).toMatchObject({ weekNumber: 1, position: 1, displayName: 'Nina', postId: 'p-9' });
      expect(res.monthlyStandings).toEqual([{ position: 1, userId: 'u-9', displayName: 'Nina' }]);
    });
  });
});
