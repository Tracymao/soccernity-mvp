import { londonParts } from '../contest-notifications/contest-calendar.util';

// backend/w11-exposure (B-092; Decision Log #388, #400, #403 item 11, #404 items 6 and 15, #405
// item 7; docs/contest-spec.md section 10b). The PURE parts of the Week-4 finalist exposure engine:
// no database, no clock read, so every rule is unit-testable on its own.

// ---- the impression threshold (Decision Log #405 item 7, #406 item 6) ---------------------------
// A carousel tile counts as an impression when at least 50% of it stays in view for one
// uninterrupted second. The CLIENT measures that and sends the qualifying event; the server
// validates that the event claims at least this much (it cannot observe the viewport itself).
export const IMPRESSION_MIN_VISIBLE_RATIO = 0.5;
export const IMPRESSION_MIN_VISIBLE_MS = 1000;

// The carousel is two pages of three finalists (Figma pass J: "Final week carousel is 6 finalists");
// a month has at most 9 finalists (the weekly winners), so 9 is the ceiling.
export const CAROUSEL_DEFAULT_LIMIT = 6;
export const CAROUSEL_MAX_LIMIT = 9;

/** The Europe/London calendar day of an instant, "YYYY-MM-DD": the window of the per-viewer daily cap. */
export function londonDayKey(instant: Date): string {
  const p = londonParts(instant);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

// ---- per-viewer, per-day seeded shuffle --------------------------------------------------------

// FNV-1a, 32 bit. Not cryptographic: it only has to spread seeds, deterministically.
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: a small seeded PRNG returning floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A deterministic Fisher-Yates shuffle: the same items in the same order and the same seed always
 * give the same result. The caller seeds it with (viewer, cycle, London day) so the order is stable
 * for one viewer within a day and different between viewers and between days (spec: "a per-viewer
 * shuffle seeded per viewer per day (stable within a session)"). Returns a new array.
 */
export function seededShuffle<T>(items: readonly T[], seed: string): T[] {
  const out = items.slice();
  const random = mulberry32(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- the balanced-impression rotation ----------------------------------------------------------

// Floating-point slack for the band edge, the same as the admin spread's (10% of 30 must be exactly 3).
const BAND_EPSILON = 1e-9;

export interface RotationCandidate {
  entryId: string;
  /** Impressions this finalist video has received so far (all viewers, the live window). */
  impressions: number;
}

/** The tolerance band's width in impressions: `tolerancePercent` of the MEAN across live finalist videos. */
export function toleranceWidth(meanImpressions: number, tolerancePercent: number): number {
  return (meanImpressions * tolerancePercent) / 100;
}

/**
 * Orders the finalist videos a viewer may be served, by the balanced-impression rotation:
 *
 *   - The video(s) with the FEWEST impressions come first. Every video whose count is within the
 *     tolerance width of the lowest remaining count is "equally due" and forms one band; the band is
 *     shuffled by the viewer's seeded shuffle, so two viewers do not all start on the same video.
 *   - The next band starts at the lowest count left over, and so on, so a video that is well ahead
 *     is only reached after the ones that are behind.
 *
 * It is NEVER ordered by engagement, live rank, follower count or recency (spec): the only inputs
 * are the impression counts (a balancing quantity, never shown to a user) and the seed.
 *
 * `meanImpressions` is the mean across ALL live finalist videos (not just this viewer's candidates),
 * because the tolerance is defined against the whole field.
 */
export function orderByBalancedRotation(
  candidates: readonly RotationCandidate[],
  options: { meanImpressions: number; tolerancePercent: number; seed: string },
): string[] {
  const width = toleranceWidth(options.meanImpressions, options.tolerancePercent);
  // Stable order first (count, then id) so the banding itself never depends on input order.
  const remaining = candidates
    .slice()
    .sort((a, b) => a.impressions - b.impressions || (a.entryId < b.entryId ? -1 : a.entryId > b.entryId ? 1 : 0));
  const ordered: string[] = [];
  let bandIndex = 0;
  while (remaining.length > 0) {
    const floor = remaining[0].impressions;
    const band: RotationCandidate[] = [];
    while (remaining.length > 0 && remaining[0].impressions <= floor + width + BAND_EPSILON) {
      band.push(remaining.shift()!);
    }
    const shuffled = seededShuffle(
      band.map((c) => c.entryId),
      `${options.seed}:${bandIndex}`,
    );
    ordered.push(...shuffled);
    bandIndex += 1;
  }
  return ordered;
}

// ---- the admin view's spread --------------------------------------------------------------------

export type ExposureStatus = 'within' | 'above' | 'below';

export interface ExposureSpreadRow<T> {
  item: T;
  impressions: number;
  status: ExposureStatus;
  /** Signed deviation from the mean, in percent of the mean; null when the mean is 0. */
  deviationPercent: number | null;
}

export interface ExposureSpread<T> {
  mean: number;
  /** The tolerance band around the mean, in impressions. */
  lower: number;
  upper: number;
  min: number;
  max: number;
  rows: ExposureSpreadRow<T>[];
  outsideTolerance: number;
}

/**
 * The impression distribution against the tolerance (spec: "flags any video outside the
 * tolerance"; tolerance = within X% of the mean). A video is OUTSIDE when its count differs from the
 * mean by MORE than X% of the mean (exactly on the edge is within). With a mean of 0 nothing has
 * been served yet, so nothing is flagged.
 */
export function computeExposureSpread<T>(
  items: readonly { item: T; impressions: number }[],
  tolerancePercent: number,
): ExposureSpread<T> {
  const counts = items.map((i) => i.impressions);
  const total = counts.reduce((sum, n) => sum + n, 0);
  const mean = items.length === 0 ? 0 : total / items.length;
  const width = toleranceWidth(mean, tolerancePercent);
  const lower = Math.max(0, mean - width);
  const upper = mean + width;
  // Compare with a tiny epsilon so 10% of 30 (3.0000000000000004) does not misflag an exact edge.
  const EPS = 1e-9;
  const rows = items.map((i): ExposureSpreadRow<T> => {
    let status: ExposureStatus = 'within';
    if (mean > 0) {
      if (i.impressions > upper + EPS) status = 'above';
      else if (i.impressions < mean - width - EPS) status = 'below';
    }
    return {
      item: i.item,
      impressions: i.impressions,
      status,
      deviationPercent: mean > 0 ? Math.round(((i.impressions - mean) / mean) * 1000) / 10 : null,
    };
  });
  return {
    mean: Math.round(mean * 100) / 100,
    lower: Math.round(lower * 100) / 100,
    upper: Math.round(upper * 100) / 100,
    min: counts.length ? Math.min(...counts) : 0,
    max: counts.length ? Math.max(...counts) : 0,
    rows,
    outsideTolerance: rows.filter((r) => r.status !== 'within').length,
  };
}
