import {
  AUTO_REJECTION_REASON,
  ModerationLabel,
  ModerationThresholds,
  decideModeration,
  sampleFrameTimes,
} from './media-moderation-decision.util';

const T: ModerationThresholds = {
  pass: 40,
  reject: 90,
  rejectCategories: new Set(['explicit', 'violence', 'visually disturbing', 'hate symbols']),
};
const label = (name: string, confidence: number, parentName: string | null = null): ModerationLabel => ({ name, confidence, parentName });

describe('decideModeration', () => {
  it('approves when every label on every frame is below the pass threshold', () => {
    expect(decideModeration([[label('Alcohol', 39.9)], [label('Gambling', 10)], []], T)).toEqual({ outcome: 'approved', categories: [] });
  });

  it('approves an image with no labels at all', () => {
    expect(decideModeration([[]], T).outcome).toBe('approved');
  });

  it('a label EXACTLY at the pass threshold keeps the file out of auto-approval', () => {
    expect(decideModeration([[label('Alcohol', 40)]], T)).toEqual({ outcome: 'pending', categories: ['Alcohol'] });
  });

  it('leaves a file pending when a label sits between the thresholds', () => {
    expect(decideModeration([[label('Swimwear or Underwear', 70)]], T).outcome).toBe('pending');
  });

  it('rejects a reject category at or above the reject threshold, by name or by parent', () => {
    expect(decideModeration([[label('Explicit', 90)]], T)).toEqual({ outcome: 'rejected', categories: ['Explicit'] });
    expect(decideModeration([[label('Graphic Violence', 95, 'Violence')]], T).outcome).toBe('rejected');
    expect(decideModeration([[label('EXPLICIT', 99)]], T).outcome).toBe('rejected'); // case-insensitive
  });

  it('reaches a reject category through a chain of parents, even when the ancestor was not returned as a label of its own', () => {
    // level 3 -> level 2 -> level 1 ("Explicit"); only the two lower levels are in the response
    const frame = [label('Exposed Genitalia', 95, 'Explicit Nudity'), label('Explicit Nudity', 96, 'Explicit')];
    expect(decideModeration([frame], T).outcome).toBe('rejected');
    // the same chain, but with the level-2 -> level-1 link visible only through ANOTHER label in the frame
    const split = [label('Exposed Genitalia', 95, 'Explicit Nudity'), label('Explicit Nudity', 20, 'Explicit')];
    expect(decideModeration([split], T).outcome).toBe('rejected');
    // an unrelated chain is not a reject category
    expect(decideModeration([[label('Beer', 95, 'Alcoholic Beverages'), label('Alcoholic Beverages', 95, 'Alcohol')]], T).outcome).toBe('pending');
  });

  it('survives a malformed parent cycle', () => {
    const frame = [label('A', 95, 'B'), label('B', 95, 'A')];
    expect(decideModeration([frame], T).outcome).toBe('pending');
  });

  it('a reject category just BELOW the reject threshold is pending, not rejected', () => {
    expect(decideModeration([[label('Explicit', 89.9)]], T).outcome).toBe('pending');
  });

  it('a non-reject category never rejects, however confident', () => {
    expect(decideModeration([[label('Alcohol', 100)]], T).outcome).toBe('pending');
  });

  it('judges a video by its WORST frame: one bad frame rejects, one grey frame holds it', () => {
    expect(decideModeration([[], [label('Hate Symbols', 92)], []], T).outcome).toBe('rejected');
    expect(decideModeration([[], [label('Rude Gestures', 60)], []], T).outcome).toBe('pending');
    expect(decideModeration([[], [], []], T).outcome).toBe('approved');
  });

  it('records the distinct category names at or above the pass threshold, sorted, and nothing else', () => {
    const d = decideModeration([[label('Violence', 50), label('Alcohol', 60)], [label('Alcohol', 70), label('Gambling', 10)]], T);
    expect(d.categories).toEqual(['Alcohol', 'Violence']);
    expect(JSON.stringify(d)).not.toMatch(/\d{2}\.\d|confidence/i);
  });

  it('a check that looked at NO frames can never approve', () => {
    expect(decideModeration([], T)).toEqual({ outcome: 'pending', categories: [] });
  });

  it('a minor uploader uses stricter thresholds: the same label can approve an adult and be held for a minor', () => {
    const adult = T;
    const minor: ModerationThresholds = { ...T, pass: 20, reject: 80 };
    const frames = [[label('Alcohol', 30)]];
    expect(decideModeration(frames, adult).outcome).toBe('approved');
    expect(decideModeration(frames, minor).outcome).toBe('pending');
    expect(decideModeration([[label('Explicit', 85)]], adult).outcome).toBe('pending');
    expect(decideModeration([[label('Explicit', 85)]], minor).outcome).toBe('rejected');
  });

  it('the generic rejection reason is the founder-specified sentence', () => {
    expect(AUTO_REJECTION_REASON).toBe("This file didn't meet our rules");
  });
});

describe('sampleFrameTimes', () => {
  it('samples one frame per interval, in the middle of each slice', () => {
    expect(sampleFrameTimes(20, 5, 30)).toEqual([2.5, 7.5, 12.5, 17.5]);
  });

  it('never exceeds the maximum frame count (the interval widens, spread evenly)', () => {
    const t = sampleFrameTimes(120, 1, 10);
    expect(t).toHaveLength(10);
    expect(t[0]).toBe(6);
    expect(t[9]).toBe(114);
  });

  it('always takes at least one frame, from the middle of a very short clip', () => {
    expect(sampleFrameTimes(2, 5, 30)).toEqual([1]);
    expect(sampleFrameTimes(0.4, 5, 30)).toEqual([0.2]);
  });

  it('is safe for a bad duration or interval', () => {
    expect(sampleFrameTimes(NaN, 5, 30)).toEqual([0]);
    expect(sampleFrameTimes(-3, 5, 30)).toEqual([0]);
    expect(sampleFrameTimes(10, 0, 30).length).toBeGreaterThan(0);
  });

  it('every time lies inside the clip', () => {
    for (const d of [3, 17.3, 120]) {
      for (const tm of sampleFrameTimes(d, 5, 30)) {
        expect(tm).toBeGreaterThan(0);
        expect(tm).toBeLessThan(d);
      }
    }
  });
});
