import {
  entriesToQualify,
  planPlacementPoints,
  planPodium,
  releaseOccurredAt,
  resolveFinalistUserIds,
  votesToRestore,
  VoteEventRow,
  weekHasTooFewEntries,
} from './contest-removal.rules';

// backend/b300-contest-entry-removal (Decision Log #488): the pure rules, one describe per rule.

const t = (s: number) => new Date(Date.UTC(2026, 10, 2, 9, 0, s));

describe('entriesToQualify (the Phase 1 backfill; qualified is monotone)', () => {
  const rank = (n: number, qualified: boolean) => ({ entryId: `e${n}`, tally: 100 - n, rank: n, qualified });

  it('adds only the ranking’s top 10 that are not already qualified', () => {
    // e1..e10 were the slate; e4 is removed, so the ranking over the rest is e1,e2,e3,e5..e11 and its top 10 is e1..e3,e5..e11.
    const ranked = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12].map((n, i) => ({
      entryId: `e${n}`,
      tally: 100 - i,
      rank: i + 1,
      qualified: i < 10,
    }));
    const already = new Set(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10']);
    expect(entriesToQualify(ranked, already)).toEqual(['e11']);
  });

  it('never clears anyone: nothing new to qualify when the slate is already full of ranked entries', () => {
    const ranked = [rank(1, true), rank(2, true), rank(3, true)];
    expect(entriesToQualify(ranked, new Set(['e1', 'e2', 'e3']))).toEqual([]);
  });

  it('a restore can leave the slate with 11 or more: the restored entry is already in the set and the backfill is not undone', () => {
    // 10 on the slate, e4 removed and e11 backfilled (11 qualified in total); e4 comes back: the top 10 of the
    // ranking over all 12 does not add anyone that is not already qualified.
    const ranked = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n, i) => ({
      entryId: `e${n}`,
      tally: 100 - i,
      rank: i + 1,
      qualified: i < 10,
    }));
    const already = new Set(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'e9', 'e10', 'e11']);
    expect(entriesToQualify(ranked, already)).toEqual([]);
    expect(already.size).toBe(11);
  });
});

describe('weekHasTooFewEntries (fewer than 3 eligible, non-removed entries forfeits the week)', () => {
  it.each([
    [0, true],
    [1, true],
    [2, true],
    [3, false],
    [10, false],
  ])('%i entries -> forfeited=%s', (n, expected) => {
    expect(weekHasTooFewEntries(n)).toBe(expected);
  });
});

describe('releaseOccurredAt (a release is never stamped before the cast it frees)', () => {
  it('uses the removal clock when it is later than the cast', () => {
    expect(releaseOccurredAt(t(5), t(1))).toEqual(t(5));
  });

  it('uses the cast time when the removal clock was read EARLIER (it started first but waited longer for the lock)', () => {
    expect(releaseOccurredAt(t(1), t(5))).toEqual(t(5));
  });

  it('is the same instant when they are equal (a cast sorts before a release at the same millisecond)', () => {
    expect(releaseOccurredAt(t(3), t(3))).toEqual(t(3));
  });

  it('returns a value that never sorts before the cast, for any pair', () => {
    for (const [now, created] of [[0, 9], [9, 0], [4, 4], [1, 2], [2, 1]]) {
      expect(releaseOccurredAt(t(now), t(created)).getTime()).toBeGreaterThanOrEqual(t(created).getTime());
    }
  });

  it('does not change either input', () => {
    const now = t(1);
    const created = t(5);
    releaseOccurredAt(now, created);
    expect(now).toEqual(t(1));
    expect(created).toEqual(t(5));
  });
});

describe('votesToRestore (only an unbroken chain, only a voter holding no vote)', () => {
  const ev = (voterId: string, entryId: string, action: string, s: number): VoteEventRow => ({
    voterId,
    entryId,
    action,
    occurredAt: t(s),
  });

  it('returns a freed vote with its ORIGINAL cast time', () => {
    const events = [ev('v1', 'E', 'cast', 1), ev('v1', 'E', 'release', 5)];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([{ voterId: 'v1', createdAt: t(1) }]);
  });

  it('skips a voter who cast elsewhere after the release', () => {
    const events = [ev('v1', 'E', 'cast', 1), ev('v1', 'E', 'release', 5), ev('v1', 'F', 'cast', 6)];
    expect(votesToRestore(events, new Set(['v1']), 'E')).toEqual([]);
    // ...and even if that other vote was retracted again the chain is broken
    expect(votesToRestore([...events, ev('v1', 'F', 'retract', 7)], new Set(), 'E')).toEqual([]);
  });

  it('skips a voter who holds a vote right now, whatever the events say', () => {
    const events = [ev('v1', 'E', 'cast', 1), ev('v1', 'E', 'release', 5)];
    expect(votesToRestore(events, new Set(['v1']), 'E')).toEqual([]);
  });

  it('skips a voter whose latest event is a release on a DIFFERENT entry', () => {
    const events = [ev('v1', 'F', 'cast', 1), ev('v1', 'F', 'release', 5)];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([]);
  });

  it('brings a vote back when the release was CLAMPED to the cast time (the removal clock was read earlier)', () => {
    // cast at 5; the removal read its clock at 1, so releaseOccurredAt stamped the release at 5 (the cast time)
    const events = [ev('v1', 'E', 'cast', 5), { ...ev('v1', 'E', 'release', 5), occurredAt: releaseOccurredAt(t(1), t(5)) }];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([{ voterId: 'v1', createdAt: t(5) }]);
  });

  it('(the bug this fixes) a release stamped BEFORE its cast reads as an intact vote and is not restored', () => {
    const events = [ev('v1', 'E', 'cast', 5), ev('v1', 'E', 'release', 1)];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([]);
  });

  it('control: a clamped release followed by a cast elsewhere is still not restored (the chain is broken)', () => {
    const events = [
      ev('v1', 'E', 'cast', 5),
      { ...ev('v1', 'E', 'release', 5), occurredAt: releaseOccurredAt(t(1), t(5)) },
      ev('v1', 'F', 'cast', 6),
    ];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([]);
    expect(votesToRestore(events, new Set(['v1']), 'E')).toEqual([]);
  });

  it('uses the LAST cast on this entry (a vote cast, retracted and cast again keeps the later time)', () => {
    const events = [
      ev('v1', 'E', 'cast', 1),
      ev('v1', 'E', 'retract', 2),
      ev('v1', 'E', 'cast', 3),
      ev('v1', 'E', 'release', 5),
    ];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([{ voterId: 'v1', createdAt: t(3) }]);
  });

  it('a second removal and restore round: release, restore, release again still comes back', () => {
    const events = [
      ev('v1', 'E', 'cast', 1),
      ev('v1', 'E', 'release', 5),
      ev('v1', 'E', 'restore', 6),
      ev('v1', 'E', 'release', 7),
    ];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([{ voterId: 'v1', createdAt: t(1) }]);
  });

  it('events in the same millisecond are ordered cast < retract < release < restore', () => {
    const events = [ev('v1', 'E', 'release', 1), ev('v1', 'E', 'cast', 1)];
    expect(votesToRestore(events, new Set(), 'E')).toEqual([{ voterId: 'v1', createdAt: t(1) }]);
  });

  it('is sorted by voter id so a restore is deterministic', () => {
    const events = [ev('b', 'E', 'cast', 2), ev('b', 'E', 'release', 5), ev('a', 'E', 'cast', 1), ev('a', 'E', 'release', 5)];
    expect(votesToRestore(events, new Set(), 'E').map((v) => v.voterId)).toEqual(['a', 'b']);
  });
});

describe('planPodium (diff of ContestRoundWinner rows)', () => {
  const row = (entryId: string, userId: string, position: number) => ({ entryId, userId, position });

  it('is empty when nothing changed (idempotent)', () => {
    const podium = [row('e1', 'u1', 1), row('e2', 'u2', 2), row('e3', 'u3', 3)];
    expect(planPodium(podium, podium)).toEqual({ insert: [], update: [], remove: [] });
  });

  it('a removed winner leaves, the others move up, the 4th place enters', () => {
    const current = [row('e1', 'u1', 1), row('e2', 'u2', 2), row('e3', 'u3', 3)];
    const desired = [row('e2', 'u2', 1), row('e3', 'u3', 2), row('e4', 'u4', 3)];
    const plan = planPodium(current, desired);
    expect(plan.remove).toEqual(['e1']);
    expect(plan.update).toEqual([row('e2', 'u2', 1), row('e3', 'u3', 2)]);
    expect(plan.insert).toEqual([row('e4', 'u4', 3)]);
  });

  it('leaves a place EMPTY when there is nobody to take it', () => {
    const plan = planPodium([row('e1', 'u1', 1), row('e2', 'u2', 2), row('e3', 'u3', 3)], [row('e2', 'u2', 1), row('e3', 'u3', 2)]);
    expect(plan.remove).toEqual(['e1']);
    expect(plan.insert).toEqual([]);
  });

  it('a restore puts the entry back and moves the others down', () => {
    const current = [row('e2', 'u2', 1), row('e3', 'u3', 2), row('e4', 'u4', 3)];
    const desired = [row('e1', 'u1', 1), row('e2', 'u2', 2), row('e3', 'u3', 3)];
    const plan = planPodium(current, desired);
    expect(plan.remove).toEqual(['e4']);
    expect(plan.insert).toEqual([row('e1', 'u1', 1)]);
    expect(plan.update.map((u) => [u.entryId, u.position])).toEqual([['e2', 2], ['e3', 3]]);
  });
});

describe('planPlacementPoints (everyone is paid for the place they end up in; a row is never deleted)', () => {
  const ledger = (id: string, userId: string, quarterPoints: number, revokedAt: Date | null = null) => ({
    id,
    userId,
    quarterPoints,
    revokedAt,
  });
  // weekly prizes 500/300/150 points = 2000/1200/600 quarter-points
  const want = (...pairs: [string, number][]) => new Map(pairs);

  it('does nothing when the ledger already matches', () => {
    const rows = [ledger('l1', 'u1', 2000), ledger('l2', 'u2', 1200)];
    const plan = planPlacementPoints(rows, want(['u1', 2000], ['u2', 1200]));
    expect(plan).toEqual({ revoke: [], set: [], insert: [], firstTime: [] });
  });

  it('revokes the person who no longer places, moves up the one behind, pays the newcomer', () => {
    const rows = [ledger('l1', 'u1', 2000), ledger('l2', 'u2', 1200), ledger('l3', 'u3', 600)];
    // u1 removed: u2 -> 1st, u3 -> 2nd, u4 (never paid) -> 3rd
    const plan = planPlacementPoints(rows, want(['u2', 2000], ['u3', 1200], ['u4', 600]));
    expect(plan.revoke).toEqual(['l1']);
    expect(plan.set).toEqual([
      { id: 'l2', quarterPoints: 2000 },
      { id: 'l3', quarterPoints: 1200 },
    ]);
    expect(plan.insert).toEqual([{ userId: 'u4', quarterPoints: 600 }]);
    expect(plan.firstTime).toEqual(['u4']);
  });

  it('a restore un-revokes the person and moves the others back down; nobody new gets a notice', () => {
    const rows = [
      ledger('l1', 'u1', 2000, new Date()),
      ledger('l2', 'u2', 2000),
      ledger('l3', 'u3', 1200),
      ledger('l4', 'u4', 600),
    ];
    const plan = planPlacementPoints(rows, want(['u1', 2000], ['u2', 1200], ['u3', 600]));
    expect(plan.set).toEqual([
      { id: 'l1', quarterPoints: 2000 },
      { id: 'l2', quarterPoints: 1200 },
      { id: 'l3', quarterPoints: 600 },
    ]);
    expect(plan.revoke).toEqual(['l4']);
    expect(plan.insert).toEqual([]);
    expect(plan.firstTime).toEqual([]);
  });

  it('a person with an EXISTING (even revoked) row is not "first time"', () => {
    const plan = planPlacementPoints([ledger('l1', 'u1', 2000, new Date())], want(['u1', 1200]));
    expect(plan.firstTime).toEqual([]);
    expect(plan.set).toEqual([{ id: 'l1', quarterPoints: 1200 }]);
  });

  it('an already revoked row for someone who still does not place stays as it is', () => {
    const plan = planPlacementPoints([ledger('l1', 'u1', 2000, new Date())], want());
    expect(plan.revoke).toEqual([]);
  });

  it('quarter-point amounts are compared exactly', () => {
    const plan = planPlacementPoints([ledger('l1', 'u1', 2000)], want(['u1', 2001]));
    expect(plan.set).toEqual([{ id: 'l1', quarterPoints: 2001 }]);
  });
});

describe('resolveFinalistUserIds (the freeze)', () => {
  const round = (weekNumber: number, status: string, winners: { userId: string; position: number }[] = []) => ({
    weekNumber,
    status,
    winners,
  });

  it('before the freeze: the distinct weekly winners in podium order, only once all three weeks are decided', () => {
    const rounds = [
      round(1, 'judged', [{ userId: 'b', position: 2 }, { userId: 'a', position: 1 }]),
      round(2, 'judged', [{ userId: 'a', position: 1 }]),
      round(3, 'judged'),
    ];
    expect(resolveFinalistUserIds({ finalistsFrozenAt: null, finalists: [], rounds })).toEqual(['a', 'b']);
    expect(resolveFinalistUserIds({ finalistsFrozenAt: null, finalists: [], rounds: [rounds[0], rounds[1], round(3, 'voting')] })).toEqual([]);
    expect(resolveFinalistUserIds({ finalistsFrozenAt: null, finalists: [], rounds: rounds.slice(0, 2) })).toEqual([]);
  });

  it('after the freeze: the stored set and nothing else, whatever the podiums became', () => {
    const rounds = [round(1, 'judged', [{ userId: 'z', position: 1 }]), round(2, 'judged'), round(3, 'judged')];
    expect(
      resolveFinalistUserIds({
        finalistsFrozenAt: new Date(),
        finalists: [{ userId: 'a' }, { userId: 'b' }, { userId: 'a' }],
        rounds,
      }),
    ).toEqual(['a', 'b']);
  });
});
