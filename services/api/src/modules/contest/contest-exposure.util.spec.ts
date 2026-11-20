import {
  computeExposureSpread,
  londonDayKey,
  orderByBalancedRotation,
  seededShuffle,
  toleranceWidth,
} from './contest-exposure.util';

// B-092. Every expected value below is derived by hand from docs/contest-spec.md section 10b, not
// by running the implementation and copying its output.

describe('londonDayKey', () => {
  it('is the Europe/London calendar day, not the UTC day (BST: 23:30 UTC is already the next day)', () => {
    expect(londonDayKey(new Date('2026-07-01T23:30:00Z'))).toBe('2026-07-02');
    expect(londonDayKey(new Date('2026-07-01T22:59:59Z'))).toBe('2026-07-01');
  });

  it('equals the UTC day in GMT', () => {
    expect(londonDayKey(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-01');
    expect(londonDayKey(new Date('2026-12-02T00:00:00Z'))).toBe('2026-12-02');
  });
});

describe('toleranceWidth', () => {
  it('is tolerancePercent of the mean', () => {
    expect(toleranceWidth(30, 10)).toBe(3);
    expect(toleranceWidth(0, 10)).toBe(0);
    expect(toleranceWidth(8, 50)).toBe(4);
  });
});

describe('seededShuffle', () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'];

  it('is a permutation and does not mutate its input', () => {
    const copy = items.slice();
    const out = seededShuffle(items, 'viewer-1:cycle:2026-11-26');
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual(copy);
  });

  it('is deterministic: the same seed always gives the same order (stable within a session)', () => {
    expect(seededShuffle(items, 'seed-x')).toEqual(seededShuffle(items, 'seed-x'));
  });

  it('differs between seeds (between viewers and between days)', () => {
    const orders = new Set<string>();
    for (let i = 0; i < 25; i++) orders.add(seededShuffle(items, `viewer-${i}:c:2026-11-26`).join(''));
    expect(orders.size).toBeGreaterThan(15);
    const days = new Set<string>();
    for (let d = 1; d <= 6; d++) days.add(seededShuffle(items, `viewer-1:c:2026-11-2${d}`).join(''));
    expect(days.size).toBeGreaterThan(1);
  });

  it('handles empty and single-item lists', () => {
    expect(seededShuffle([], 's')).toEqual([]);
    expect(seededShuffle(['x'], 's')).toEqual(['x']);
  });
});

describe('orderByBalancedRotation', () => {
  const opts = (mean: number, tolerancePercent = 10, seed = 's') => ({ meanImpressions: mean, tolerancePercent, seed });

  it('serves the video with the fewest impressions first and the one furthest ahead last', () => {
    // counts a:0 b:0 c:5 d:10 -> mean 3.75, width 0.375 -> bands [a,b] [c] [d]
    const order = orderByBalancedRotation(
      [
        { entryId: 'd', impressions: 10 },
        { entryId: 'c', impressions: 5 },
        { entryId: 'b', impressions: 0 },
        { entryId: 'a', impressions: 0 },
      ],
      opts(3.75),
    );
    expect(order.slice(0, 2).sort()).toEqual(['a', 'b']);
    expect(order[2]).toBe('c');
    expect(order[3]).toBe('d');
  });

  it('treats videos within the tolerance of the lowest count as equally due (one shuffled band)', () => {
    // counts 10, 11, 12 -> mean 11, width 1.1 -> floor 10 reaches 11.1: [10, 11] then [12]
    const order = orderByBalancedRotation(
      [
        { entryId: 'x', impressions: 10 },
        { entryId: 'y', impressions: 11 },
        { entryId: 'z', impressions: 12 },
      ],
      opts(11),
    );
    expect(order.slice(0, 2).sort()).toEqual(['x', 'y']);
    expect(order[2]).toBe('z');
  });

  it('an exact edge of the tolerance is still in the band (both orders occur across viewers)', () => {
    // counts 10 and 13 with mean 10 -> width 1 would split them; with mean 30 -> width 3, 13 <= 10 + 3 keeps them together
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) {
      firsts.add(
        orderByBalancedRotation(
          [
            { entryId: 'p', impressions: 10 },
            { entryId: 'q', impressions: 13 },
          ],
          opts(30, 10, `seed-${i}`),
        )[0],
      );
    }
    expect(firsts).toEqual(new Set(['p', 'q']));
  });

  it('just outside the edge splits into two bands (the lower count always first)', () => {
    for (let i = 0; i < 20; i++) {
      const order = orderByBalancedRotation(
        [
          { entryId: 'q', impressions: 14 },
          { entryId: 'p', impressions: 10 },
        ],
        opts(30, 10, `seed-${i}`),
      );
      expect(order).toEqual(['p', 'q']);
    }
  });

  it('does not depend on the order of the input list', () => {
    const a = [
      { entryId: '1', impressions: 3 },
      { entryId: '2', impressions: 1 },
      { entryId: '3', impressions: 2 },
      { entryId: '4', impressions: 1 },
    ];
    expect(orderByBalancedRotation(a, opts(1.75, 10, 'k'))).toEqual(
      orderByBalancedRotation(a.slice().reverse(), opts(1.75, 10, 'k')),
    );
  });

  it('shuffles within a band per viewer: different seeds start on different videos', () => {
    const cands = ['a', 'b', 'c', 'd'].map((entryId) => ({ entryId, impressions: 0 }));
    const firsts = new Set<string>();
    for (let i = 0; i < 40; i++) firsts.add(orderByBalancedRotation(cands, opts(0, 10, `v${i}`))[0]);
    expect(firsts.size).toBe(4);
  });

  it('never uses anything but impressions and the seed: no other field can change the order', () => {
    const same = [
      { entryId: 'a', impressions: 4 },
      { entryId: 'b', impressions: 4 },
    ];
    const withExtras = same.map((c) => ({ ...c, likes: c.entryId === 'a' ? 9999 : 0, followers: 1_000_000 }));
    expect(orderByBalancedRotation(withExtras, opts(4, 10, 's'))).toEqual(orderByBalancedRotation(same, opts(4, 10, 's')));
  });

  it('returns an empty order for no candidates', () => {
    expect(orderByBalancedRotation([], opts(0))).toEqual([]);
  });
});

describe('computeExposureSpread', () => {
  const rows = (counts: number[]) => counts.map((impressions, i) => ({ item: `e${i}`, impressions }));

  it('flags nothing when no impressions have been served yet', () => {
    const s = computeExposureSpread(rows([0, 0, 0]), 10);
    expect(s.mean).toBe(0);
    expect(s.outsideTolerance).toBe(0);
    expect(s.rows.every((r) => r.status === 'within' && r.deviationPercent === null)).toBe(true);
  });

  it('a video exactly on the edge of the tolerance is within', () => {
    // mean 10, width 1 -> 9 and 11 are on the edge
    const s = computeExposureSpread(rows([9, 10, 11]), 10);
    expect(s.rows.map((r) => r.status)).toEqual(['within', 'within', 'within']);
    expect(s.lower).toBe(9);
    expect(s.upper).toBe(11);
  });

  it('flags a video above and a video below the tolerance, with the signed deviation', () => {
    const s = computeExposureSpread(rows([8, 10, 12]), 10);
    expect(s.rows.map((r) => r.status)).toEqual(['below', 'within', 'above']);
    expect(s.rows.map((r) => r.deviationPercent)).toEqual([-20, 0, 20]);
    expect(s.outsideTolerance).toBe(2);
    expect(s.min).toBe(8);
    expect(s.max).toBe(12);
  });

  it('does not misflag an edge because of floating point (27, 30, 33 at 10%)', () => {
    expect(computeExposureSpread(rows([27, 30, 33]), 10).outsideTolerance).toBe(0);
  });

  it('handles an empty field', () => {
    expect(computeExposureSpread([], 10)).toMatchObject({ mean: 0, min: 0, max: 0, outsideTolerance: 0, rows: [] });
  });
});
