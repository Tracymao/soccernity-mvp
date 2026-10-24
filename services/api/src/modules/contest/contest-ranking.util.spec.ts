import {
  EngagementEvent,
  EngagementKind,
  FinalInput,
  pickMonthlyPodium,
  rankFinal,
  rankPhase1,
  rankVotes,
  tallyEngagement,
} from './contest-ranking.util';

const t = (minutes: number) => new Date(Date.UTC(2026, 5, 1, 8, minutes, 0));
const ev = (
  userId: string,
  kind: EngagementKind,
  minutes: number,
  followedAtEngagement = false,
): EngagementEvent => ({ userId, kind, occurredAt: t(minutes), followedAtEngagement });

describe('tallyEngagement: the platform rule (spec 9a)', () => {
  const all = { kinds: ['like', 'comment', 'view'] as EngagementKind[] };

  it('counts one point per account per kind: a like, a comment and a view from one account are 3, not more', () => {
    const tally = tallyEngagement([ev('a', 'like', 1), ev('a', 'comment', 2), ev('a', 'view', 3)], all);
    expect(tally).toMatchObject({ total: 3, likes: 1, comments: 1, views: 1 });
  });

  it('ten comments from one account are 1', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev('a', 'comment', i + 1));
    expect(tallyEngagement(events, all).total).toBe(1);
  });

  it('there is no flat cap of 2: three accounts each doing all three kinds are 9', () => {
    const events = ['a', 'b', 'c'].flatMap((u, i) => [ev(u, 'like', i), ev(u, 'comment', i), ev(u, 'view', i)]);
    expect(tallyEngagement(events, all).total).toBe(9);
  });

  it('counts self engagement like any other (the caller passes the author in as a giver)', () => {
    expect(tallyEngagement([ev('author', 'like', 1)], all).total).toBe(1);
  });

  it('only counts the requested kinds: views are not counted in the final', () => {
    const tally = tallyEngagement([ev('a', 'like', 1), ev('b', 'view', 2)], { kinds: ['like', 'comment'] });
    expect(tally).toMatchObject({ total: 1, views: 0 });
  });

  it('keeps the EARLIEST occurrence of a repeated (account, kind), so a second comment never moves the point', () => {
    const tally = tallyEngagement([ev('a', 'comment', 9), ev('a', 'comment', 2)], all);
    expect(tally.reachedAt).toEqual(t(2));
  });

  it('reachedAt is the time of the engagement that brought the tally to its total (the latest counted one)', () => {
    expect(tallyEngagement([ev('a', 'like', 1), ev('b', 'like', 7), ev('c', 'like', 4)], all).reachedAt).toEqual(t(7));
  });

  it('a zero tally has no reachedAt', () => {
    expect(tallyEngagement([], all)).toMatchObject({ total: 0, reachedAt: null });
  });

  it('respects the window: from is inclusive, before is exclusive', () => {
    const events = [ev('a', 'like', 1), ev('b', 'like', 2), ev('c', 'like', 3)];
    expect(tallyEngagement(events, { ...all, from: t(2), before: t(3) }).total).toBe(1); // only b
    expect(tallyEngagement(events, { ...all, before: t(1) }).total).toBe(0);
  });

  it('followers-excluded mode drops engagement whose giver followed at the time, frozen per engagement', () => {
    const events = [
      ev('follower', 'like', 1, true),
      ev('stranger', 'like', 2, false),
      // Not a follower when they liked, a follower by the time they commented: the like counts, the comment does not.
      ev('late', 'like', 3, false),
      ev('late', 'comment', 4, true),
      ev('author', 'like', 5, false), // nobody follows themselves: self engagement counts in BOTH modes
    ];
    const kinds = ['like', 'comment'] as EngagementKind[];
    expect(tallyEngagement(events, { kinds }).total).toBe(5);
    expect(tallyEngagement(events, { kinds, excludeFollowers: true }).total).toBe(3);
  });
});

describe('rankPhase1: engagement decides who reaches the top 10 (spec 7)', () => {
  const cutoff = t(100);
  const entry = (entryId: string, submittedMin: number, events: EngagementEvent[]) => ({
    entryId,
    submittedAt: t(submittedMin),
    events,
  });

  it('ranks by engagement total, highest first', () => {
    const ranked = rankPhase1(
      [
        entry('low', 0, [ev('a', 'like', 1)]),
        entry('high', 0, [ev('a', 'like', 1), ev('b', 'like', 2), ev('c', 'like', 3)]),
        entry('mid', 0, [ev('a', 'like', 1), ev('b', 'like', 2)]),
      ],
      cutoff,
    );
    expect(ranked.map((r) => r.entryId)).toEqual(['high', 'mid', 'low']);
    expect(ranked.map((r) => r.tally)).toEqual([3, 2, 1]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it('breaks a tie by who reached the tied total EARLIEST', () => {
    const ranked = rankPhase1(
      [
        entry('slow', 0, [ev('a', 'like', 1), ev('b', 'like', 50)]), // reached 2 at minute 50
        entry('fast', 0, [ev('a', 'like', 2), ev('b', 'like', 10)]), // reached 2 at minute 10
      ],
      cutoff,
    );
    expect(ranked.map((r) => r.entryId)).toEqual(['fast', 'slow']);
  });

  it('a removed engagement is excluded: the caller passes only live rows, so a like removed before the cutoff does not count', () => {
    const ranked = rankPhase1(
      [entry('a', 0, [ev('x', 'like', 1)]), entry('b', 0, [])], // b had a like that was removed: its row is gone
      cutoff,
    );
    expect(ranked[0].entryId).toBe('a');
  });

  it('breaks a tie that is still identical by the earlier ENTRY SUBMISSION', () => {
    const ranked = rankPhase1(
      [
        entry('later', 30, [ev('a', 'like', 40)]),
        entry('earlier', 5, [ev('b', 'like', 40)]),
      ],
      cutoff,
    );
    expect(ranked.map((r) => r.entryId)).toEqual(['earlier', 'later']);
  });

  it('zero-engagement entries tie, then the earlier submission wins', () => {
    const ranked = rankPhase1([entry('b', 20, []), entry('a', 10, [])], cutoff);
    expect(ranked.map((r) => r.entryId)).toEqual(['a', 'b']);
  });

  it('ignores engagement at or after the cutoff (the end of day 4)', () => {
    const ranked = rankPhase1(
      [
        entry('a', 0, [ev('x', 'like', 99)]),
        entry('b', 0, [ev('x', 'like', 100), ev('y', 'like', 120)]), // at and after the cutoff
      ],
      cutoff,
    );
    expect(ranked.find((r) => r.entryId === 'b')?.tally).toBe(0);
    expect(ranked[0].entryId).toBe('a');
  });

  it('counts views as well as likes and comments in Phase 1', () => {
    const ranked = rankPhase1([entry('a', 0, [ev('x', 'view', 1), ev('y', 'view', 2)]), entry('b', 0, [ev('x', 'like', 1)])], cutoff);
    expect(ranked[0]).toMatchObject({ entryId: 'a', tally: 2 });
  });

  describe('the top 10', () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => entry(`e${String(i).padStart(2, '0')}`, i, [ev(`u${i}`, 'like', i + 1)]));

    it('qualifies exactly ten when there are more than ten', () => {
      const ranked = rankPhase1(many(14), cutoff);
      expect(ranked.filter((r) => r.qualified)).toHaveLength(10);
      expect(ranked.slice(0, 10).every((r) => r.qualified)).toBe(true);
      expect(ranked.slice(10).every((r) => !r.qualified)).toBe(true);
    });

    it('qualifies everyone when there are fewer than ten', () => {
      expect(rankPhase1(many(7), cutoff).every((r) => r.qualified)).toBe(true);
    });

    it('exactly ONE user qualifies as 10th when several are tied there (earliest reached, then earliest submission)', () => {
      // Nine clear leaders, then three entries all on 1 engagement. Only one of them is 10th.
      const leaders = Array.from({ length: 9 }, (_, i) =>
        entry(`lead${i}`, i, [ev(`l${i}a`, 'like', 1), ev(`l${i}b`, 'like', 2)]),
      );
      const tied = [
        entry('tieC', 3, [ev('c', 'like', 30)]),
        entry('tieA', 2, [ev('a', 'like', 10)]), // reached 1 first
        entry('tieB', 1, [ev('b', 'like', 20)]),
      ];
      const ranked = rankPhase1([...leaders, ...tied], cutoff);
      const qualifiedTied = ranked.filter((r) => r.qualified && r.entryId.startsWith('tie'));
      expect(qualifiedTied).toHaveLength(1);
      expect(qualifiedTied[0].entryId).toBe('tieA');
      expect(ranked[9].entryId).toBe('tieA');
      expect(ranked[9].rank).toBe(10);
    });

    it('is deterministic: the same input in any order gives the same ranking', () => {
      const input = many(12);
      const forward = rankPhase1(input, cutoff).map((r) => r.entryId);
      const backward = rankPhase1([...input].reverse(), cutoff).map((r) => r.entryId);
      expect(backward).toEqual(forward);
    });
  });
});

describe('rankVotes: votes alone decide the top 3 (spec 8)', () => {
  const vote = (voterId: string, minutes: number) => ({ voterId, createdAt: t(minutes) });
  const entry = (entryId: string, phase1Rank: number | null, votes: ReturnType<typeof vote>[], submittedMin = 0) => ({
    entryId,
    submittedAt: t(submittedMin),
    phase1Rank,
    votes,
  });

  it('ranks by vote count', () => {
    const ranked = rankVotes([
      entry('one', 1, [vote('a', 1)]),
      entry('three', 2, [vote('b', 1), vote('c', 2), vote('d', 3)]),
      entry('two', 3, [vote('e', 1), vote('f', 2)]),
    ]);
    expect(ranked.map((r) => r.entryId)).toEqual(['three', 'two', 'one']);
    expect(ranked.map((r) => r.voteCount)).toEqual([3, 2, 1]);
  });

  it('ignores Phase 1 rank when the votes differ: a better Phase 1 rank does not beat more votes', () => {
    const ranked = rankVotes([entry('rank1', 1, [vote('a', 1)]), entry('rank9', 9, [vote('b', 1), vote('c', 2)])]);
    expect(ranked[0].entryId).toBe('rank9');
  });

  it('breaks a vote tie by whose tally FIRST reached the tied number', () => {
    const ranked = rankVotes([
      entry('late', 1, [vote('a', 1), vote('b', 90)]), // reached 2 at minute 90
      entry('early', 2, [vote('c', 5), vote('d', 15)]), // reached 2 at minute 15
    ]);
    expect(ranked.map((r) => r.entryId)).toEqual(['early', 'late']);
  });

  it('uses the CURRENT vote log: a retracted vote is a deleted row, so it neither counts nor sets the time', () => {
    // 'a' had 2 votes at minutes 5 and 80, but the minute-5 one was retracted and re-cast at minute 120.
    const ranked = rankVotes([
      entry('retracted', 1, [vote('a', 120), vote('b', 80)]),
      entry('steady', 2, [vote('c', 10), vote('d', 20)]),
    ]);
    expect(ranked[0].entryId).toBe('steady');
  });

  it('falls back to the Phase 1 rank when the votes cannot separate them (including zero votes) -- OPEN default', () => {
    const ranked = rankVotes([
      entry('p3', 3, []),
      entry('p1', 1, []),
      entry('p2', 2, []),
    ]);
    expect(ranked.map((r) => r.entryId)).toEqual(['p1', 'p2', 'p3']);
  });

  it('then falls back to the earlier submission, then the entry id, so the order is always total', () => {
    const ranked = rankVotes([entry('b', null, [], 20), entry('a', null, [], 10)]);
    expect(ranked.map((r) => r.entryId)).toEqual(['a', 'b']);
    const sameTime = rankVotes([entry('z', null, [], 10), entry('y', null, [], 10)]);
    expect(sameTime.map((r) => r.entryId)).toEqual(['y', 'z']);
  });

  it('counts one vote per voter even if the log carried a duplicate row', () => {
    const ranked = rankVotes([entry('a', 1, [vote('v', 1), vote('v', 2)])]);
    expect(ranked[0].voteCount).toBe(1);
  });

  it('puts an unranked (null Phase 1 rank) entry after a ranked one when otherwise tied', () => {
    const ranked = rankVotes([entry('unranked', null, []), entry('ranked', 4, [])]);
    expect(ranked[0].entryId).toBe('ranked');
  });
});

describe('rankFinal and the monthly podium (spec 10)', () => {
  const from = t(0);
  const before = t(1000);
  const options = { minimumTally: 3, excludeFollowers: false, from, before };
  const f = (entryId: string, submittedMin: number, events: EngagementEvent[]): FinalInput => ({
    entryId,
    submittedAt: t(submittedMin),
    events,
  });
  const likes = (n: number, prefix = 'u', minute = 10) =>
    Array.from({ length: n }, (_, i) => ev(`${prefix}${i}`, 'like', minute + i));

  it('ranks by total points (likes + comments), highest first', () => {
    const ranked = rankFinal([f('two', 0, likes(2)), f('five', 0, likes(5, 'v'))], options);
    expect(ranked.map((r) => r.entryId)).toEqual(['five', 'two']);
  });

  it('breaks a tie on total by COMMENTS, then by the earliest upload', () => {
    const moreComments = f('comments', 50, [ev('a', 'like', 10), ev('b', 'comment', 11)]);
    const moreLikes = f('likes', 5, [ev('c', 'like', 10), ev('d', 'like', 11)]);
    expect(rankFinal([moreLikes, moreComments], options).map((r) => r.entryId)).toEqual(['comments', 'likes']);

    const early = f('early', 5, [ev('a', 'like', 10), ev('b', 'like', 11)]);
    const late = f('late', 60, [ev('c', 'like', 10), ev('d', 'like', 11)]);
    expect(rankFinal([late, early], options).map((r) => r.entryId)).toEqual(['early', 'late']);
  });

  it('does not count views in the final', () => {
    const ranked = rankFinal([f('v', 0, [ev('a', 'view', 5), ev('b', 'view', 6), ev('c', 'like', 7)])], options);
    expect(ranked[0].tally).toBe(1);
  });

  it('ignores engagement before the reveal and from the end of the month on', () => {
    const ranked = rankFinal(
      [f('x', 0, [{ userId: 'a', kind: 'like', occurredAt: new Date(from.getTime() - 1), followedAtEngagement: false }, ev('b', 'like', 5), ev('c', 'like', 1000)])],
      options,
    );
    expect(ranked[0].tally).toBe(1);
  });

  it('applies the followers-excluded switch', () => {
    const entry = f('x', 0, [ev('f1', 'like', 5, true), ev('f2', 'like', 6, true), ev('s', 'like', 7, false)]);
    expect(rankFinal([entry], options)[0].tally).toBe(3);
    expect(rankFinal([entry], { ...options, excludeFollowers: true })[0].tally).toBe(1);
  });

  describe('the minimum tally', () => {
    it('a finalist below it cannot place, even if they are the best of a weak field', () => {
      const ranked = rankFinal([f('a', 0, likes(2)), f('b', 0, likes(1, 'w'))], options);
      expect(ranked.map((r) => r.meetsMinimumTally)).toEqual([false, false]);
      expect(pickMonthlyPodium(ranked)).toEqual([]); // "No winner this month"
    });

    it('a finalist AT the minimum tally qualifies; one point under does not', () => {
      const ranked = rankFinal([f('at', 0, likes(3)), f('under', 0, likes(2, 'w'))], options);
      expect(pickMonthlyPodium(ranked).map((r) => r.entryId)).toEqual(['at']);
    });

    it('a finalist who never uploaded has no entry, so cannot appear (they score 0 and fall below x)', () => {
      expect(pickMonthlyPodium(rankFinal([], options))).toEqual([]);
    });

    it('the podium is at most three, in rank order, skipping those below the bar', () => {
      const ranked = rankFinal(
        [
          f('p1', 0, likes(9, 'a')),
          f('p2', 0, likes(8, 'b')),
          f('p3', 0, likes(7, 'c')),
          f('p4', 0, likes(6, 'd')),
          f('low', 0, likes(1, 'e')),
        ],
        options,
      );
      expect(pickMonthlyPodium(ranked).map((r) => r.entryId)).toEqual(['p1', 'p2', 'p3']);
      // The one below the bar still has a rank for the admin view.
      expect(ranked.find((r) => r.entryId === 'low')).toMatchObject({ rank: 5, meetsMinimumTally: false });
    });

    it('fewer than three qualifiers: the podium is just those (no padding)', () => {
      const ranked = rankFinal([f('only', 0, likes(4)), f('weak', 0, likes(1, 'w'))], options);
      expect(pickMonthlyPodium(ranked).map((r) => r.entryId)).toEqual(['only']);
    });
  });
});
