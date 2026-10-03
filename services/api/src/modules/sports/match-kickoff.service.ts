import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SportsService } from './sports.service';

// Upper bound on subscriptions examined per sweep tick. Keeps one minute's work bounded even if a
// large backlog builds up (e.g. after the job was down); the next tick picks up the remainder.
const KICKOFF_SWEEP_BATCH_SIZE = 500;

// Statuses a kickoff alert must never fire for. A postponed or cancelled match has not kicked off,
// so its subscriptions stay pending. If the vendor later reschedules it, kickoffTime moves and the
// alert fires at the new time.
const NON_KICKOFF_STATUSES = ['postponed', 'cancelled'];

// sprint-4/match-kickoff-alerts (Decision Log #336 item 2). In-app kickoff alerts only: the founder's
// v1 delivery decision is no push and no email. The alert is a Notification row, shown on the user's
// next visit to the Notification Centre. Kickoff alerts only. Goal/half-time/full-time alerts need
// live polling and are a separate, future decision tied to Highlightly's live budget (#323).
@Injectable()
export class MatchKickoffService {
  private readonly logger = new Logger(MatchKickoffService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sportsService: SportsService,
  ) {}

  // PUT /sports/matches/:id/subscription. The match must exist: getMatchById validates it and
  // bootstraps the row if it has never been fetched, so a typo'd id 404s instead of creating a
  // subscription that can never fire. Idempotent: re-subscribing is a no-op and never resets
  // notifiedAt, so an already-notified subscription cannot fire a second time.
  async subscribe(userId: string, externalRef: string): Promise<void> {
    await this.sportsService.getMatchById(externalRef);
    try {
      await this.prisma.matchSubscription.create({ data: { userId, externalRef } });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
  }

  // DELETE /sports/matches/:id/subscription. Idempotent: unsubscribing from a match you were never
  // subscribed to is a no-op success, never a 404.
  async unsubscribe(userId: string, externalRef: string): Promise<void> {
    await this.prisma.matchSubscription.deleteMany({ where: { userId, externalRef } });
  }

  // Every minute. Lock-gated refreshes keep this cheap: the vendor is called at most once per watched
  // date per scheduled TTL, never per tick.
  @Cron(CronExpression.EVERY_MINUTE)
  async handleKickoffSweep(): Promise<void> {
    await this.runKickoffSweep();
  }

  // Exposed separately from the @Cron wrapper so the e2e and unit tests can drive a sweep at an
  // explicit `now` without waiting on the scheduler.
  //
  // Order matters:
  //  1. Read pending subscriptions, then the MatchData rows they point at.
  //  2. Refresh each distinct kickoff date (lock-gated) so a postponement is visible.
  //  3. Re-read the rows, now fresh, and fire only matches that are due and not postponed/cancelled.
  //
  // Each notification is claimed inside a transaction. The updateMany filters on notifiedAt IS NULL,
  // so a second instance or a retry cannot deliver twice. If the Notification insert fails, the
  // claim rolls back and the next tick retries.
  async runKickoffSweep(now: Date = new Date()): Promise<{ notified: number }> {
    const pending = await this.prisma.matchSubscription.findMany({
      where: { notifiedAt: null },
      select: { externalRef: true },
      take: KICKOFF_SWEEP_BATCH_SIZE,
    });
    if (pending.length === 0) return { notified: 0 };

    const pendingRefs = [...new Set(pending.map((p) => p.externalRef))];
    const initialRows = await this.prisma.matchData.findMany({
      where: { externalRef: { in: pendingRefs } },
      select: { kickoffTime: true },
    });
    const dates = new Set(initialRows.map((r) => r.kickoffTime.toISOString().slice(0, 10)));
    for (const date of dates) {
      try {
        await this.sportsService.refreshDateForKickoffWatch(date);
      } catch (err) {
        this.logger.warn(`Kickoff-watch refresh failed for ${date}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const freshRows = await this.prisma.matchData.findMany({
      where: { externalRef: { in: pendingRefs } },
      select: { externalRef: true, kickoffTime: true, status: true },
    });
    const dueRefs = freshRows
      .filter((r) => r.kickoffTime.getTime() <= now.getTime() && !NON_KICKOFF_STATUSES.includes(r.status))
      .map((r) => r.externalRef);
    if (dueRefs.length === 0) return { notified: 0 };

    const dueSubscriptions = await this.prisma.matchSubscription.findMany({
      where: { notifiedAt: null, externalRef: { in: dueRefs } },
      select: { id: true, userId: true, externalRef: true },
    });

    let notified = 0;
    for (const sub of dueSubscriptions) {
      try {
        const fired = await this.prisma.$transaction(async (tx) => {
          const claimed = await tx.matchSubscription.updateMany({
            where: { id: sub.id, notifiedAt: null },
            data: { notifiedAt: now },
          });
          if (claimed.count === 0) return false;
          await tx.notification.create({
            data: { userId: sub.userId, type: 'match_kickoff', payloadRefId: sub.externalRef },
          });
          return true;
        });
        if (fired) notified += 1;
      } catch (err) {
        this.logger.warn(`Kickoff alert failed for subscription ${sub.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { notified };
  }
}
