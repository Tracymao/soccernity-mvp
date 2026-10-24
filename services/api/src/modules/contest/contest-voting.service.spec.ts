import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { ContestLifecycleService } from './contest-lifecycle.service';
import { ContestVotingService } from './contest-voting.service';

// backend/w7-contest (B-091). The voting rules on a mocked database: the window, the eligibility
// filter on the count, the one-vote rule, the toggle, and the races. The behaviour against real
// Postgres (including the share lock against the lock-time job) is in test/contest.e2e-spec.ts.

// June 2026 is BST. Week 1: Phase 1 ends 2026-06-04T23:00Z, votes lock 2026-06-07T19:00Z.
const VOTING_OPEN = new Date('2026-06-05T10:00:00Z');
const PHASE_1_END = new Date('2026-06-04T23:00:00.000Z');
const LOCK = new Date('2026-06-07T19:00:00.000Z');

function entryRow(over: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    roundId: 'round-1',
    qualified: true,
    round: { weekNumber: 1, status: 'voting', forfeited: false, cycle: { monthKey: '2026-06' } },
    ...over,
  };
}

function build() {
  const prisma = {
    contestEntry: { findUnique: jest.fn().mockResolvedValue(entryRow()) },
    contestVote: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(1),
    },
    contestVoteEvent: { create: jest.fn().mockResolvedValue({}) },
    contestRound: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'voting' }) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const lifecycle = { ensurePhase1Closed: jest.fn().mockResolvedValue(undefined) };
  const service = new ContestVotingService(
    prisma as unknown as PrismaService,
    lifecycle as unknown as ContestLifecycleService,
    { now: () => VOTING_OPEN },
  );
  return { prisma, lifecycle, service };
}

describe('ContestVotingService.castVote', () => {
  it('casts a vote: one row, one event, and returns the live count and the toggle state', async () => {
    const { prisma, service } = build();
    prisma.contestVote.findUnique
      .mockResolvedValueOnce(null) // no existing vote
      .mockResolvedValueOnce({ entryId: 'entry-1' }); // stateFor
    prisma.contestVote.count.mockResolvedValue(4);

    const state = await service.castVote('voter-1', 'entry-1');

    expect(prisma.contestVote.create).toHaveBeenCalledWith({
      data: { roundId: 'round-1', voterId: 'voter-1', entryId: 'entry-1', createdAt: VOTING_OPEN },
    });
    expect(prisma.contestVoteEvent.create).toHaveBeenCalledWith({
      data: { roundId: 'round-1', voterId: 'voter-1', entryId: 'entry-1', action: 'cast', occurredAt: VOTING_OPEN },
    });
    expect(state).toEqual({ roundId: 'round-1', entryId: 'entry-1', voted: true, voteCount: 4, callerVote: 'entry-1' });
  });

  it('the count only includes ELIGIBLE voters (the same filter the lock uses)', async () => {
    const { prisma, service } = build();
    await service.castVote('voter-1', 'entry-1');
    expect(prisma.contestVote.count).toHaveBeenCalledWith({ where: { entryId: 'entry-1', voter: CONTEST_ELIGIBLE_USER } });
  });

  it('takes a share lock on the round and refuses if the round was decided meanwhile', async () => {
    const { prisma, service } = build();
    prisma.contestRound.findUniqueOrThrow.mockResolvedValue({ status: 'judged' });
    await expect(service.castVote('voter-1', 'entry-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_voting_closed' }),
    });
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.contestVote.create).not.toHaveBeenCalled();
  });

  it('voting for the SAME entry again is an idempotent no-op (no second row, no second event)', async () => {
    const { prisma, service } = build();
    prisma.contestVote.findUnique.mockResolvedValue({ id: 'v', entryId: 'entry-1' });
    const state = await service.castVote('voter-1', 'entry-1');
    expect(prisma.contestVote.create).not.toHaveBeenCalled();
    expect(prisma.contestVoteEvent.create).not.toHaveBeenCalled();
    expect(state.voted).toBe(true);
  });

  it('voting for ANOTHER entry while holding a vote is a coded 409 naming the current vote (one toggle, no "change vote")', async () => {
    const { prisma, service } = build();
    prisma.contestVote.findUnique.mockResolvedValue({ id: 'v', entryId: 'entry-OTHER' });
    await expect(service.castVote('voter-1', 'entry-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_already_voted', votedEntryId: 'entry-OTHER' }),
    });
    expect(prisma.contestVote.create).not.toHaveBeenCalled();
  });

  it('a concurrent cast by the same account (P2002) is treated as the idempotent success when it was the same entry', async () => {
    const { prisma, service } = build();
    prisma.contestVote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.contestVote.findUnique
      .mockResolvedValueOnce(null) // inside the transaction: nothing yet
      .mockResolvedValueOnce({ entryId: 'entry-1' }) // after the abort: the winner voted for the same entry
      .mockResolvedValueOnce({ entryId: 'entry-1' }); // stateFor
    await expect(service.castVote('voter-1', 'entry-1')).resolves.toMatchObject({ voted: true });
  });

  it('...and a 409 when the racing winner voted for a different entry', async () => {
    const { prisma, service } = build();
    prisma.contestVote.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    prisma.contestVote.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ entryId: 'entry-OTHER' });
    await expect(service.castVote('voter-1', 'entry-1')).rejects.toBeInstanceOf(ConflictException);
  });

  describe('the voting window, to the millisecond', () => {
    it.each([
      ['one millisecond before Phase 1 ends', new Date(PHASE_1_END.getTime() - 1), 'contest_voting_not_open'],
      ['one millisecond before the lock', new Date(LOCK.getTime() - 1), null],
      ['exactly at Phase 1 end', PHASE_1_END, null],
      ['exactly at the lock (20:00:00.000)', LOCK, 'contest_voting_closed'],
      ['between weeks', new Date('2026-06-08T03:00:00Z'), 'contest_voting_closed'],
    ])('%s', async (_name, now, code) => {
      const { service } = build();
      const attempt = service.castVote('voter-1', 'entry-1', now);
      if (code) {
        await expect(attempt).rejects.toMatchObject({ response: expect.objectContaining({ code }) });
      } else {
        await expect(attempt).resolves.toBeDefined();
      }
    });
  });

  it('in the first seconds of Phase 2, before the sweep has ranked Phase 1, it ranks first and re-reads', async () => {
    const { prisma, lifecycle, service } = build();
    prisma.contestEntry.findUnique
      .mockResolvedValueOnce(entryRow({ qualified: false, round: { weekNumber: 1, status: 'open', forfeited: false, cycle: { monthKey: '2026-06' } } }))
      .mockResolvedValueOnce(entryRow());
    await service.castVote('voter-1', 'entry-1', new Date(PHASE_1_END.getTime() + 500));
    expect(lifecycle.ensurePhase1Closed).toHaveBeenCalledWith('round-1', expect.any(Date));
    expect(prisma.contestVote.create).toHaveBeenCalled();
  });

  it('refuses an entry that did not reach the top 10, and any entry of a forfeited week', async () => {
    const a = build();
    a.prisma.contestEntry.findUnique.mockResolvedValue(entryRow({ qualified: false }));
    await expect(a.service.castVote('v', 'entry-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_entry_not_votable' }),
    });
    const b = build();
    b.prisma.contestEntry.findUnique.mockResolvedValue(
      entryRow({ round: { weekNumber: 1, status: 'judged', forfeited: true, cycle: { monthKey: '2026-06' } } }),
    );
    await expect(b.service.castVote('v', 'entry-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('there is no vote in the final (week 4), nor on a legacy cycle', async () => {
    const a = build();
    a.prisma.contestEntry.findUnique.mockResolvedValue(
      entryRow({ round: { weekNumber: 4, status: 'open', forfeited: false, cycle: { monthKey: '2026-06' } } }),
    );
    await expect(a.service.castVote('v', 'entry-1')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_entry_not_votable' }),
    });
    const b = build();
    b.prisma.contestEntry.findUnique.mockResolvedValue(
      entryRow({ round: { weekNumber: 1, status: 'open', forfeited: false, cycle: { monthKey: null } } }),
    );
    await expect(b.service.castVote('v', 'entry-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('404s an unknown entry', async () => {
    const { prisma, service } = build();
    prisma.contestEntry.findUnique.mockResolvedValue(null);
    await expect(service.castVote('v', 'nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ContestVotingService.retractVote', () => {
  it('deletes the caller\'s vote on that entry, logs a retract, and reports voted:false with the lowered count', async () => {
    const { prisma, service } = build();
    prisma.contestVote.findUnique
      .mockResolvedValueOnce({ id: 'v1', entryId: 'entry-1' }) // existing
      .mockResolvedValueOnce(null); // stateFor: no vote any more
    prisma.contestVote.count.mockResolvedValue(2);

    const state = await service.retractVote('voter-1', 'entry-1');

    expect(prisma.contestVote.delete).toHaveBeenCalledWith({ where: { id: 'v1' } });
    expect(prisma.contestVoteEvent.create).toHaveBeenCalledWith({
      data: { roundId: 'round-1', voterId: 'voter-1', entryId: 'entry-1', action: 'retract', occurredAt: VOTING_OPEN },
    });
    expect(state).toEqual({ roundId: 'round-1', entryId: 'entry-1', voted: false, voteCount: 2, callerVote: null });
  });

  it('is idempotent: no vote, or a vote on a DIFFERENT entry, changes nothing', async () => {
    const a = build();
    await a.service.retractVote('voter-1', 'entry-1');
    expect(a.prisma.contestVote.delete).not.toHaveBeenCalled();
    const b = build();
    b.prisma.contestVote.findUnique.mockResolvedValue({ id: 'v1', entryId: 'entry-OTHER' });
    const state = await b.service.retractVote('voter-1', 'entry-1');
    expect(b.prisma.contestVote.delete).not.toHaveBeenCalled();
    expect(state).toMatchObject({ voted: false, callerVote: 'entry-OTHER' });
  });

  it('cannot retract at or after the lock: the tally is frozen at 20:00:00', async () => {
    const { prisma, service } = build();
    await expect(service.retractVote('voter-1', 'entry-1', LOCK)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'contest_voting_closed' }),
    });
    expect(prisma.contestVote.delete).not.toHaveBeenCalled();
  });
});
