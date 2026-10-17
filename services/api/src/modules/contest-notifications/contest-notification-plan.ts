import { buildContestMonthCalendar, londonMonthOf } from './contest-calendar.util';

// backend/w3c-contest-notifications (B-122, Decision Log #404 item 16; docs/contest-spec.md
// section 14e). The PLANNER: a pure function from "the contest cycles and the clock" to "which
// notification events are due right now, and for whom". No database, no clock read, so every
// event, every window edge and every DST case is unit-testable by passing `now`.
//
// Types are the Notification.type strings; the payloadRefId convention is:
//   week-level events   "<cycleId>:<week>"   (week opens, votes closing, week result)
//   cycle-level events  "<cycleId>"          (finalist, reveal, final result, upload reminder)
// NotificationsService resolves both into structured data (no pre-rendered English, #290).

export type ContestNotificationEvent =
  | 'week_opens' // (a)
  | 'votes_closing' // (b)
  | 'week_result' // (c)
  | 'finalist' // (d)
  | 'reveal' // (e)
  | 'final_result' // (f)
  | 'upload_reminder'; // (h)

export const CONTEST_NOTIFICATION_TYPE: Record<ContestNotificationEvent, string> = {
  week_opens: 'contest_week_opens',
  votes_closing: 'contest_votes_closing',
  week_result: 'contest_week_result',
  finalist: 'contest_finalist',
  reveal: 'contest_reveal',
  final_result: 'contest_final_result',
  upload_reminder: 'contest_upload_reminder',
};

const HOUR_MS = 60 * 60 * 1000;

// How long after its scheduled moment an event may still be sent. The sweep runs every few
// minutes; this window is what lets it catch up after downtime or a late cycle creation without
// sending a stale "week 1 is open" days later. Idempotency (dedupeKey) makes any overlap harmless.
// Events whose meaning ends at a deadline (the votes-closing reminder at the lock, the upload
// reminder at the upload deadline) expire at that deadline instead.
export const CATCH_UP_WINDOW_MS = {
  week_opens: 12 * HOUR_MS,
  week_result: 24 * HOUR_MS,
  finalist: 24 * HOUR_MS,
  reveal: 12 * HOUR_MS,
  final_result: 24 * HOUR_MS,
} as const;

export interface PlannerRound {
  id: string;
  weekNumber: number;
  status: string; // open | judged
  judgedAt: Date | null;
  /** Distinct userIds of this round's ContestRoundWinner rows. */
  winnerUserIds: string[];
}

export interface PlannerCycle {
  id: string;
  startsAt: Date;
  status: string; // active | final | completed
  crownedAt: Date | null;
  rounds: PlannerRound[];
}

export type NotificationAudience =
  /** Every eligible account. */
  | { kind: 'everyone' }
  /** Eligible accounts with no vote in this round (the votes-closing reminder). */
  | { kind: 'not_voted'; roundId: string }
  /** These accounts, if eligible (finalists, winners). */
  | { kind: 'users'; userIds: string[] }
  /** These accounts, if eligible and without a final entry yet (the upload reminder). */
  | { kind: 'users_without_final_entry'; userIds: string[]; cycleId: string };

export interface PlannedNotification {
  event: ContestNotificationEvent;
  type: string;
  cycleId: string;
  week: number | null;
  payloadRefId: string;
  fireAt: Date;
  expiresAt: Date;
  audience: NotificationAudience;
}

const later = (a: Date, b: Date) => (a.getTime() >= b.getTime() ? a : b);

/** The events that are due at `now`, across every cycle passed in. */
export function planContestNotifications(cycles: PlannerCycle[], now: Date): PlannedNotification[] {
  const due: PlannedNotification[] = [];
  for (const cycle of cycles) {
    for (const planned of planCycle(cycle)) {
      if (planned.fireAt.getTime() <= now.getTime() && now.getTime() < planned.expiresAt.getTime()) {
        due.push(planned);
      }
    }
  }
  return due;
}

function planCycle(cycle: PlannerCycle): PlannedNotification[] {
  const { year, month } = londonMonthOf(cycle.startsAt);
  const cal = buildContestMonthCalendar(year, month);
  const roundByWeek = new Map(cycle.rounds.map((r) => [r.weekNumber, r]));
  const completed = cycle.status === 'completed';

  // Finalists = the distinct weekly winners (docs/contest-spec.md section 10). They are only
  // "known" once week 3 has been judged (spec table row d: ASSUMED at the week-3 result), so
  // every final-week event keys off that, and a month with no weekly winners has no final.
  const week3 = roundByWeek.get(3);
  const finalistIds = [...new Set(cycle.rounds.flatMap((r) => r.winnerUserIds))];
  const finalistsKnown = week3?.status === 'judged' && finalistIds.length > 0;

  const out: PlannedNotification[] = [];
  const push = (p: Omit<PlannedNotification, 'type' | 'payloadRefId'>) =>
    out.push({
      ...p,
      type: CONTEST_NOTIFICATION_TYPE[p.event],
      payloadRefId: p.week === null ? p.cycleId : `${p.cycleId}:${p.week}`,
    });

  for (let week = 1; week <= 4; week++) {
    // (a) A week opens, 08:00 on days 1, 8, 15, 22. Week 4 only if there is a final to open:
    // with no finalists the spec says there is no final, so "week 4 is open" would mislead.
    if (!completed && (week < 4 || finalistsKnown)) {
      const fireAt = cal.weekOpensAt[week - 1];
      push({
        event: 'week_opens',
        cycleId: cycle.id,
        week,
        fireAt,
        expiresAt: new Date(fireAt.getTime() + CATCH_UP_WINDOW_MS.week_opens),
        audience: { kind: 'everyone' },
      });
    }
  }

  for (let week = 1; week <= 3; week++) {
    const round = roundByWeek.get(week);
    if (!round) continue;
    const lockAt = cal.votesLockAt[week - 1];

    // (b) Votes-closing reminder, 19:00 on days 7, 14, 21, only to accounts that have not voted,
    // and only while the week is still undecided: once the round is judged the reminder is moot.
    if (!completed && round.status !== 'judged') {
      push({
        event: 'votes_closing',
        cycleId: cycle.id,
        week,
        fireAt: cal.votesClosingReminderAt[week - 1],
        expiresAt: lockAt,
        audience: { kind: 'not_voted', roundId: round.id },
      });
    }

    // (c) Week result, at the 20:00 lock, announced to everyone. Sent only for a judged week with
    // winners: a judged week with none is the forfeited week, and a forfeited week sends nothing
    // (spec table row g; the Contest-page pop-up covers it). The result cannot exist before the
    // round is judged, so the send time is the later of the lock and the judging.
    if (round.status === 'judged' && round.winnerUserIds.length > 0) {
      const fireAt = round.judgedAt ? later(lockAt, round.judgedAt) : lockAt;
      push({
        event: 'week_result',
        cycleId: cycle.id,
        week,
        fireAt,
        expiresAt: new Date(fireAt.getTime() + CATCH_UP_WINDOW_MS.week_result),
        audience: { kind: 'everyone' },
      });
    }
  }

  if (finalistsKnown && week3) {
    // (d) Final qualification: each finalist, at the week-3 result (ASSUMED timing, spec row d).
    const lockAt = cal.votesLockAt[2];
    const fireAt = week3.judgedAt ? later(lockAt, week3.judgedAt) : lockAt;
    push({
      event: 'finalist',
      cycleId: cycle.id,
      week: null,
      fireAt,
      expiresAt: new Date(fireAt.getTime() + CATCH_UP_WINDOW_MS.finalist),
      audience: { kind: 'users', userIds: finalistIds },
    });

    if (!completed) {
      // (e) The reveal, 00:00 on day 25, to everyone.
      push({
        event: 'reveal',
        cycleId: cycle.id,
        week: null,
        fireAt: cal.revealAt,
        expiresAt: new Date(cal.revealAt.getTime() + CATCH_UP_WINDOW_MS.reveal),
        audience: { kind: 'everyone' },
      });

      // (h) Finalist upload reminder, 12:00 on day 24, to finalists with no final entry yet.
      // Default added by Claude in Decision Log #404, veto-able.
      push({
        event: 'upload_reminder',
        cycleId: cycle.id,
        week: null,
        fireAt: cal.uploadReminderAt,
        expiresAt: cal.uploadDeadlineAt,
        audience: { kind: 'users_without_final_entry', userIds: finalistIds, cycleId: cycle.id },
      });
    }
  }

  // (f) Final result, to everyone, once the cycle is crowned AND the contest month has ended
  // (ASSUMED timing, spec row f: the spec states no crown moment). The outcome (winners or
  // "No winner this month") is derived from the standings when the notification is read.
  if (completed && cycle.crownedAt) {
    const fireAt = later(cycle.crownedAt, cal.monthEndAt);
    push({
      event: 'final_result',
      cycleId: cycle.id,
      week: null,
      fireAt,
      expiresAt: new Date(fireAt.getTime() + CATCH_UP_WINDOW_MS.final_result),
      audience: { kind: 'everyone' },
    });
  }

  return out;
}

/** The idempotency key: one notification per account per event per cycle per week. */
export function contestDedupeKey(
  type: string,
  cycleId: string,
  week: number | null,
  userId: string,
): string {
  return `${type}|${cycleId}|${week ?? '-'}|${userId}`;
}
