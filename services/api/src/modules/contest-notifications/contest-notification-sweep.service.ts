import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { ContestNotificationFacts } from './contest-notification-facts.service';
import {
  contestDedupeKey,
  NotificationAudience,
  planContestNotifications,
  PlannedNotification,
  PlannerCycle,
} from './contest-notification-plan';

// backend/w3c-contest-notifications (B-122, Decision Log #404 item 16; docs/contest-spec.md
// section 14e). The scheduled fan-out of the Contest notification events. IN-APP ONLY: it writes
// Notification rows (the existing model and read-state); no push, no email (deferred to B-090).
//
// Recipients are every account the Contest treats as eligible: an active account, a verified
// email (an unverified account cannot vote or enter, so an "enter / vote now" prompt would be a
// dead end -- the spec does not say; flagged in the report), and not restricted: a minor needs
// confirmed guardian consent (the same test GuardianConsentGuard applies).

// Postgres bind-parameter ceiling is 32,767; 1,000 rows x 5 columns stays far under it.
const FAN_OUT_BATCH_SIZE = 1000;

// A cycle's calendar month is taken from startsAt; any cycle that started within this window can
// still have a due event (a month is at most 31 days plus the catch-up windows).
const CYCLE_LOOKBACK_MS = 70 * 24 * 60 * 60 * 1000;

const ELIGIBLE_RECIPIENT: Prisma.UserWhereInput = {
  accountStatus: 'active',
  verificationStatus: 'verified',
  OR: [{ isMinor: false }, { guardian: { is: { consentStatus: 'confirmed' } } }],
};

export interface ContestNotificationSweepResult {
  /** Planned events that were due this run. */
  eventsDue: number;
  /** Notification rows actually created, by Notification.type (skipped duplicates are not counted). */
  created: Record<string, number>;
}

@Injectable()
export class ContestNotificationSweepService {
  private readonly logger = new Logger(ContestNotificationSweepService.name);
  // A tick that overruns must not overlap the next one in this process. Across processes the
  // dedupeKey unique index is the guard.
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly facts: ContestNotificationFacts,
    // backend/test-clock-qa: the app clock, so the QA test clock also drives these events.
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    if (this.running) {
      this.logger.warn('Contest notification sweep still running; skipping this tick');
      return;
    }
    this.running = true;
    try {
      const result = await this.runOnce(this.clock.now());
      if (result.eventsDue > 0) {
        this.logger.log(`Contest notification sweep: ${JSON.stringify(result.created)}`);
      }
    } catch (err) {
      this.logger.error(`Contest notification sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** One sweep at a given instant. Public and clock-injected so tests need no fake timers. */
  async runOnce(now: Date): Promise<ContestNotificationSweepResult> {
    const cycles = await this.loadCycles(now);
    const due = planContestNotifications(cycles, now);
    const created: Record<string, number> = {};

    for (const planned of due) {
      // One failing event must not starve the others; the next tick retries it (idempotent).
      try {
        const count = await this.fanOut(planned);
        created[planned.type] = (created[planned.type] ?? 0) + count;
      } catch (err) {
        this.logger.error(
          `Contest notification ${planned.type} for cycle ${planned.cycleId} failed: ${(err as Error).message}`,
        );
      }
    }
    return { eventsDue: due.length, created };
  }

  private async loadCycles(now: Date): Promise<PlannerCycle[]> {
    const rows = await this.prisma.contestCycle.findMany({
      where: { startsAt: { gte: new Date(now.getTime() - CYCLE_LOOKBACK_MS) } },
      select: {
        id: true,
        startsAt: true,
        status: true,
        crownedAt: true,
        rounds: {
          select: {
            id: true,
            weekNumber: true,
            status: true,
            judgedAt: true,
            winners: { select: { userId: true } },
          },
        },
      },
    });
    return rows.map((c) => ({
      id: c.id,
      startsAt: c.startsAt,
      status: c.status,
      crownedAt: c.crownedAt,
      rounds: c.rounds.map((r) => ({
        id: r.id,
        weekNumber: r.weekNumber,
        status: r.status,
        judgedAt: r.judgedAt,
        winnerUserIds: [...new Set(r.winners.map((w) => w.userId))],
      })),
    }));
  }

  // Walks the audience in id-ordered pages and writes one batch of rows per page.
  private async fanOut(planned: PlannedNotification): Promise<number> {
    const where = await this.audienceWhere(planned.audience);
    if (where === null) return 0;

    let created = 0;
    let cursor: string | undefined;
    for (;;) {
      const page = await this.prisma.user.findMany({
        where,
        select: { id: true },
        orderBy: { id: 'asc' },
        take: FAN_OUT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (page.length === 0) break;

      const result = await this.prisma.notification.createMany({
        data: page.map((u) => ({
          userId: u.id,
          type: planned.type,
          payloadRefId: planned.payloadRefId,
          dedupeKey: contestDedupeKey(planned.type, planned.cycleId, planned.week, u.id),
        })),
        // The dedupeKey unique index turns "already sent this event to this account" into a no-op.
        skipDuplicates: true,
      });
      created += result.count;

      if (page.length < FAN_OUT_BATCH_SIZE) break;
      cursor = page[page.length - 1].id;
    }
    return created;
  }

  // null = nobody to notify (an empty explicit audience).
  private async audienceWhere(audience: NotificationAudience): Promise<Prisma.UserWhereInput | null> {
    switch (audience.kind) {
      case 'everyone':
        return ELIGIBLE_RECIPIENT;
      case 'not_voted':
        // "has not voted that week": no ContestVote row for this round.
        return { AND: [ELIGIBLE_RECIPIENT, { contestVotes: { none: { roundId: audience.roundId } } }] };
      case 'users':
        return audience.userIds.length === 0
          ? null
          : { AND: [ELIGIBLE_RECIPIENT, { id: { in: audience.userIds } }] };
      case 'users_without_final_entry': {
        const uploaded = await this.facts.getFinalEntryUserIds(audience.cycleId);
        const remaining = audience.userIds.filter((id) => !uploaded.has(id));
        return remaining.length === 0 ? null : { AND: [ELIGIBLE_RECIPIENT, { id: { in: remaining } }] };
      }
    }
  }
}
