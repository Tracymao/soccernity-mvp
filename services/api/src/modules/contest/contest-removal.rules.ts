import { MINIMUM_ENTRIES_FOR_A_WEEK, Phase1Ranked } from './contest-ranking.util';

// backend/b300-contest-entry-removal (Decision Log #488). The PURE half of what happens to a contest when a
// moderator removes (or an overturned appeal restores) an entry's post: no database, no clock. The I/O half
// (contest-entry-removal.util.ts) loads rows, calls these, and writes only the difference.
//
// A REMOVED entry is one whose post has `removedByModerationAt` set. The reconcile is "derive the desired
// state from the data, diff it against what is stored, write the difference", so a repeat is a no-op and the
// lifecycle (which derives the same way, with removed entries filtered out) agrees with it.

/** A short, factual reason, shown with the forfeit pop-up (spec section 7). [COPY PENDING LEGAL REVIEW: reaches minors.] */
export const FORFEIT_REASON_TOO_FEW_ENTRIES = 'Fewer than 3 entries were submitted for this week.';

// ---- Phase 1 slate -------------------------------------------------------------------------------

/**
 * The Phase 1 ranking has been re-run over the eligible, NON-removed entries. The slate is "qualified AND not
 * removed", and `qualified` is MONOTONE: removal never clears it, a restore never clears another entry's.
 * Returns the entries to qualify now: the ranking's top 10 that are not already qualified (the backfill). A
 * restore before the lock can therefore leave the slate with 11 or more entries.
 */
export function entriesToQualify(ranked: readonly Phase1Ranked[], alreadyQualified: ReadonlySet<string>): string[] {
  return ranked.filter((r) => r.qualified && !alreadyQualified.has(r.entryId)).map((r) => r.entryId);
}

/** Fewer than 3 eligible, non-removed entries: the week is forfeited (same rule as the end of Phase 1). */
export function weekHasTooFewEntries(eligibleNonRemovedCount: number): boolean {
  return eligibleNonRemovedCount < MINIMUM_ENTRIES_FOR_A_WEEK;
}

// ---- votes ---------------------------------------------------------------------------------------

export type VoteEventAction = 'cast' | 'retract' | 'release' | 'restore';

export interface VoteEventRow {
  voterId: string;
  entryId: string;
  action: string;
  occurredAt: Date;
}

// Events at the same millisecond are ordered by what can follow what: a vote is cast before it is
// retracted or released, and released before it is restored.
const ACTION_ORDER: Record<string, number> = { cast: 0, retract: 1, release: 2, restore: 3 };

function compareEvents(a: VoteEventRow, b: VoteEventRow): number {
  return a.occurredAt.getTime() - b.occurredAt.getTime() || (ACTION_ORDER[a.action] ?? 9) - (ACTION_ORDER[b.action] ?? 9);
}

export interface VoteToRestore {
  voterId: string;
  /** The vote's ORIGINAL createdAt: the time of the voter's last `cast` event for the entry. The vote tie-break uses it. */
  createdAt: Date;
}

/**
 * Which freed votes come back when `entryId` is restored while voting is still open. Only an UNBROKEN chain
 * qualifies: the voter's latest event in the round is the `release` on this entry (so a voter who has since
 * cast elsewhere, or retracted that, does not qualify), AND the voter holds no vote in the round right now.
 * `eventsInRound` is every event of the round (any order); `currentVoterIds` is who holds a vote in the round.
 */
export function votesToRestore(
  eventsInRound: readonly VoteEventRow[],
  currentVoterIds: ReadonlySet<string>,
  entryId: string,
): VoteToRestore[] {
  const byVoter = new Map<string, VoteEventRow[]>();
  for (const e of eventsInRound) {
    const list = byVoter.get(e.voterId) ?? [];
    list.push(e);
    byVoter.set(e.voterId, list);
  }
  const out: VoteToRestore[] = [];
  for (const [voterId, events] of byVoter) {
    if (currentVoterIds.has(voterId)) continue;
    events.sort(compareEvents);
    const latest = events[events.length - 1];
    if (latest.action !== 'release' || latest.entryId !== entryId) continue;
    const lastCast = [...events].reverse().find((e) => e.action === 'cast' && e.entryId === entryId);
    if (!lastCast) continue;
    out.push({ voterId, createdAt: lastCast.occurredAt });
  }
  return out.sort((a, b) => a.voterId.localeCompare(b.voterId));
}

// ---- podiums -------------------------------------------------------------------------------------

export interface PodiumRow {
  entryId: string;
  userId: string;
  position: number;
}

export interface PodiumPlan {
  insert: PodiumRow[];
  update: PodiumRow[];
  /** entryIds whose row is deleted: they no longer place. */
  remove: string[];
}

/** Diff of the stored podium (ContestRoundWinner rows) against the derived one, keyed by entry. */
export function planPodium(current: readonly PodiumRow[], desired: readonly PodiumRow[]): PodiumPlan {
  const have = new Map(current.map((r) => [r.entryId, r]));
  const want = new Map(desired.map((r) => [r.entryId, r]));
  return {
    insert: desired.filter((d) => !have.has(d.entryId)),
    update: desired.filter((d) => {
      const c = have.get(d.entryId);
      return !!c && (c.position !== d.position || c.userId !== d.userId);
    }),
    remove: current.filter((c) => !want.has(c.entryId)).map((c) => c.entryId),
  };
}

export interface PlacementLedgerRow {
  id: string;
  userId: string;
  quarterPoints: number;
  revokedAt: Date | null;
}

export interface PlacementPointsPlan {
  /** Set revokedAt: the person no longer places. */
  revoke: string[];
  /** Clear revokedAt and set the amount: the person places again, or in a different place. */
  set: { id: string; quarterPoints: number }[];
  /** No ledger row exists yet for this person and this source/ref: write one. */
  insert: { userId: string; quarterPoints: number }[];
  /** People with a desired place who had NO ledger row at all (revoked or not): the only ones who get a notice. */
  firstTime: string[];
}

/**
 * Placement prizes follow the podium: every person on it is paid for the place they end up in (a person who
 * moves up gets the higher place's points, one who moves down on a restore goes back), and a person who no
 * longer places has the row revoked. A ledger row is never deleted. `desired` maps user -> quarter-points.
 */
export function planPlacementPoints(
  rows: readonly PlacementLedgerRow[],
  desired: ReadonlyMap<string, number>,
): PlacementPointsPlan {
  const plan: PlacementPointsPlan = { revoke: [], set: [], insert: [], firstTime: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.userId);
    const want = desired.get(row.userId);
    if (want === undefined) {
      if (row.revokedAt === null) plan.revoke.push(row.id);
    } else if (row.revokedAt !== null || row.quarterPoints !== want) {
      plan.set.push({ id: row.id, quarterPoints: want });
    }
  }
  for (const [userId, quarterPoints] of desired) {
    if (!seen.has(userId)) {
      plan.insert.push({ userId, quarterPoints });
      plan.firstTime.push(userId);
    }
  }
  plan.insert.sort((a, b) => a.userId.localeCompare(b.userId));
  plan.firstTime.sort();
  return plan;
}

// ---- finalists -----------------------------------------------------------------------------------

export interface FinalistSource {
  finalistsFrozenAt: Date | null;
  finalists: readonly { userId: string }[];
  rounds: readonly {
    weekNumber: number;
    status: string;
    winners: readonly { userId: string; position: number }[];
  }[];
}

/**
 * The cycle's finalists. Once the set is FROZEN (Week 4 opened) it is the stored set and nothing else; before
 * that it is the distinct current weekly winners, in podium order, and only once all three weekly rounds are
 * decided (a forfeited week counts as decided).
 */
export function resolveFinalistUserIds(cycle: FinalistSource): string[] {
  if (cycle.finalistsFrozenAt) return [...new Set(cycle.finalists.map((f) => f.userId))];
  const weekly = cycle.rounds.filter((r) => r.weekNumber <= 3);
  if (weekly.length !== 3 || weekly.some((r) => r.status !== 'judged')) return [];
  return [
    ...new Set(
      weekly.flatMap((r) => [...r.winners].sort((a, b) => a.position - b.position).map((w) => w.userId)),
    ),
  ];
}
