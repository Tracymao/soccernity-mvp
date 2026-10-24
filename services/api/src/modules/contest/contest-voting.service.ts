import { ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { ContestLifecycleService } from './contest-lifecycle.service';
import { buildContestScheduleForKey, ContestWeekWindow, isWithinVotingWindow } from './contest-schedule.util';
import { ContestVoteState } from './contest.types';

// backend/w7-contest (B-091; Decision Log #387, #393, #401, #404 item 5; docs/contest-spec.md section 8).
// Phase 2 voting.
//
//   * ONE vote per account per round (ContestVote @@unique([roundId, voterId])); self-vote allowed.
//   * Only the top 10 of Phase 1 (`qualified`) can be voted on.
//   * Votes are open from the end of Phase 1 (00:00 day 5/12/19) and LOCK at 20:00:00 on day 7/14/21:
//     a vote at 19:59:59.999 counts, one at 20:00:00.000 is refused.
//   * The control is ONE toggle (#401): vote, then vote again = un-vote. There is no "change vote":
//     changing a vote is an un-vote followed by a vote for someone else. So casting while already
//     holding a vote for a DIFFERENT entry is refused (409 already_voted) rather than silently moved.
//   * A retracted vote is a deleted row: it reduces the tally at once and no longer counts toward
//     "earliest vote reached". The history of casts and retractions is ContestVoteEvent.
//   * Restricted accounts cannot vote: the controller's GuardianConsentGuard + EmailVerifiedGuard
//     (the uniform write block, #370); the tally ALSO ignores any vote whose account has become
//     ineligible since (contest-eligibility.ts).
//
// The vote count the response carries counts only ELIGIBLE voters, the same filter the lock uses, so
// the number a voter sees while voting is the number that will decide the week.

export const CONTEST_VOTING_CLOSED_CODE = 'contest_voting_closed';
export const CONTEST_VOTING_NOT_OPEN_CODE = 'contest_voting_not_open';
export const CONTEST_ALREADY_VOTED_CODE = 'contest_already_voted';
export const CONTEST_ENTRY_NOT_VOTABLE_CODE = 'contest_entry_not_votable';

interface VotableEntry {
  id: string;
  roundId: string;
  qualified: boolean;
  round: { weekNumber: number; status: string; forfeited: boolean; cycle: { monthKey: string | null } };
}

@Injectable()
export class ContestVotingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lifecycle: ContestLifecycleService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  /** PUT /contest/entries/:entryId/vote */
  async castVote(voterId: string, entryId: string, now: Date = this.clock.now()): Promise<ContestVoteState> {
    let entry = await this.loadEntry(entryId);
    const week = this.weekFor(entry);
    this.assertVotingOpen(week, now);

    // Vote arrives in the first seconds of Phase 2, before the sweep has ranked Phase 1: rank it now.
    if (entry.round.status === 'open') {
      await this.lifecycle.ensurePhase1Closed(entry.roundId, now);
      entry = await this.loadEntry(entryId);
    }
    if (entry.round.forfeited || !entry.qualified) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CONTEST_ENTRY_NOT_VOTABLE_CODE,
        message: 'This entry cannot be voted on.',
      });
    }

    try {
      await this.withRoundLocked(entry.roundId, async (tx) => {
        const existing = await tx.contestVote.findUnique({
          where: { roundId_voterId: { roundId: entry.roundId, voterId } },
        });
        if (existing) {
          if (existing.entryId === entryId) return; // already voted for this one: idempotent
          throw this.alreadyVoted(existing.entryId);
        }
        await tx.contestVote.create({ data: { roundId: entry.roundId, voterId, entryId, createdAt: now } });
        await tx.contestVoteEvent.create({
          data: { roundId: entry.roundId, voterId, entryId, action: 'cast', occurredAt: now },
        });
      });
    } catch (err) {
      // A concurrent cast by the same account won the race. The unique violation aborted our
      // transaction, so the re-read has to happen outside it.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const winner = await this.prisma.contestVote.findUnique({
          where: { roundId_voterId: { roundId: entry.roundId, voterId } },
        });
        if (winner?.entryId !== entryId) throw this.alreadyVoted(winner?.entryId ?? null);
      } else {
        throw err;
      }
    }

    return this.stateFor(entry.roundId, entryId, voterId);
  }

  /** DELETE /contest/entries/:entryId/vote -- idempotent; a no-op if the caller's vote is not on this entry. */
  async retractVote(voterId: string, entryId: string, now: Date = this.clock.now()): Promise<ContestVoteState> {
    const entry = await this.loadEntry(entryId);
    const week = this.weekFor(entry);
    this.assertVotingOpen(week, now);

    await this.withRoundLocked(entry.roundId, async (tx) => {
      const existing = await tx.contestVote.findUnique({
        where: { roundId_voterId: { roundId: entry.roundId, voterId } },
      });
      if (!existing || existing.entryId !== entryId) return;
      await tx.contestVote.delete({ where: { id: existing.id } });
      await tx.contestVoteEvent.create({
        data: { roundId: entry.roundId, voterId, entryId, action: 'retract', occurredAt: now },
      });
    });

    return this.stateFor(entry.roundId, entryId, voterId);
  }

  // ---------------------------------------------------------------------------------------------

  private async loadEntry(entryId: string): Promise<VotableEntry> {
    const entry = await this.prisma.contestEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        roundId: true,
        qualified: true,
        round: {
          select: { weekNumber: true, status: true, forfeited: true, cycle: { select: { monthKey: true } } },
        },
      },
    });
    if (!entry) throw new NotFoundException('Contest entry not found');
    return entry;
  }

  private weekFor(entry: VotableEntry): ContestWeekWindow {
    const schedule = entry.round.cycle.monthKey ? buildContestScheduleForKey(entry.round.cycle.monthKey) : null;
    const week = entry.round.weekNumber <= 3 ? schedule?.weeks[entry.round.weekNumber - 1] : undefined;
    if (!week) {
      // The final (week 4) has no vote, and a legacy cycle has no calendar to vote against.
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: CONTEST_ENTRY_NOT_VOTABLE_CODE,
        message: 'This entry cannot be voted on.',
      });
    }
    return week;
  }

  private assertVotingOpen(week: ContestWeekWindow, now: Date): void {
    if (isWithinVotingWindow(week, now)) return;
    const early = now.getTime() < week.phase1EndsAt.getTime();
    throw new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: early ? CONTEST_VOTING_NOT_OPEN_CODE : CONTEST_VOTING_CLOSED_CODE,
      message: early ? 'Voting for this week has not opened yet.' : 'Voting for this week has closed.',
    });
  }

  private alreadyVoted(votedEntryId: string | null): ConflictException {
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: CONTEST_ALREADY_VOTED_CODE,
      message: 'You have already voted this week. Un-vote first to vote for someone else.',
      votedEntryId,
    });
  }

  // Takes a SHARE lock on the round row for the duration of the write and refuses if the round has
  // been decided meanwhile. The lock-time job claims the round with an UPDATE (an exclusive lock),
  // so it waits for every in-flight vote to commit and then sees it: a vote can never slip in after
  // the tally was read, and a vote made after the claim is refused.
  private async withRoundLocked(roundId: string, work: (tx: Prisma.TransactionClient) => Promise<void>): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "ContestRound" WHERE "id" = ${roundId} FOR SHARE`;
      const round = await tx.contestRound.findUniqueOrThrow({ where: { id: roundId }, select: { status: true } });
      if (round.status === 'judged') {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: CONTEST_VOTING_CLOSED_CODE,
          message: 'Voting for this week has closed.',
        });
      }
      await work(tx);
    });
  }

  private async stateFor(roundId: string, entryId: string, voterId: string): Promise<ContestVoteState> {
    const [count, mine] = await Promise.all([
      this.prisma.contestVote.count({ where: { entryId, voter: CONTEST_ELIGIBLE_USER } }),
      this.prisma.contestVote.findUnique({ where: { roundId_voterId: { roundId, voterId } }, select: { entryId: true } }),
    ]);
    return {
      roundId,
      entryId,
      voted: mine?.entryId === entryId,
      voteCount: count,
      callerVote: mine?.entryId ?? null,
    };
  }
}
