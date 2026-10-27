// backend/w14-post-media-pipeline (B-036; Decision Log #419 item 4). The PURE decision rule of the
// automatic image check: labels in, one of three outcomes out. No I/O, no clock and no configuration
// read here, so the whole rule is unit-testable and cannot drift from what the sweep applies.

/** One moderation label as the check service sees it (Rekognition's name, parent and confidence). */
export interface ModerationLabel {
  name: string;
  parentName: string | null;
  /** 0-100. */
  confidence: number;
}

export interface ModerationThresholds {
  /** A label at or above this keeps a file out of auto-approval (it goes to a moderator). */
  pass: number;
  /** A label of a reject category at or above this auto-rejects the file. */
  reject: number;
  /** Top-level moderation categories that can auto-reject, lower-cased. */
  rejectCategories: ReadonlySet<string>;
}

export type ModerationOutcome = 'approved' | 'rejected' | 'pending';

export interface ModerationDecision {
  outcome: ModerationOutcome;
  /**
   * Category names only (never a confidence, never an image): the distinct labels at or above the pass
   * threshold across every checked frame. Stored in PostMedia.checkLabels; never shown to the uploader.
   */
  categories: string[];
}

/** The generic reason shown to an uploader whose file was auto-rejected. */
export const AUTO_REJECTION_REASON = "This file didn't meet our rules";

// A label counts as a reject category if it, its parent, or any ancestor up the taxonomy is one. Rekognition
// normally returns each ancestor as a label of its own, but that is not relied on: the chain is also walked
// through the `parentName` links seen in the same frame (a level-3 label whose level-1 ancestor was not
// returned still reaches it through its level-2 parent). The walk is bounded, so a malformed cycle ends.
function isRejectCategory(
  label: ModerationLabel,
  parentOf: ReadonlyMap<string, string | null>,
  rejectCategories: ReadonlySet<string>,
): boolean {
  let name: string | null = label.name;
  for (let depth = 0; name !== null && depth < 6; depth += 1) {
    if (rejectCategories.has(name.toLowerCase())) return true;
    name = depth === 0 ? label.parentName : (parentOf.get(name) ?? null);
  }
  return false;
}

/**
 * Decides from the labels of EVERY checked frame (an image is one frame).
 *
 *  - rejected: any label of a reject category at or above the reject threshold, on any frame;
 *  - approved: every label on every frame is below the pass threshold (and at least one frame was
 *    checked: a check that looked at nothing proves nothing, so it can never approve);
 *  - pending: anything between, left for a moderator.
 */
export function decideModeration(
  frames: readonly (readonly ModerationLabel[])[],
  t: ModerationThresholds,
): ModerationDecision {
  const categories = new Set<string>();
  let reject = false;
  let anyAtOrAbovePass = false;
  for (const labels of frames) {
    const parentOf = new Map<string, string | null>(labels.map((l) => [l.name, l.parentName]));
    for (const label of labels) {
      if (label.confidence >= t.pass) {
        anyAtOrAbovePass = true;
        categories.add(label.name);
      }
      if (label.confidence >= t.reject && isRejectCategory(label, parentOf, t.rejectCategories)) reject = true;
    }
  }
  const list = [...categories].sort();
  if (reject) return { outcome: 'rejected', categories: list };
  if (frames.length === 0) return { outcome: 'pending', categories: [] };
  return { outcome: anyAtOrAbovePass ? 'pending' : 'approved', categories: list };
}

/**
 * The frame times (seconds) to sample from a video: one every `intervalSeconds`, but never more than
 * `maxFrames` (the interval widens to spread them evenly), never fewer than one. Samples sit in the
 * middle of each slice, so a one-frame check looks at the middle of the clip, not its first frame.
 */
export function sampleFrameTimes(durationSeconds: number, intervalSeconds: number, maxFrames: number): number[] {
  const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : 0;
  const interval = intervalSeconds > 0 ? intervalSeconds : 1;
  const wanted = Math.max(1, Math.ceil(duration / interval));
  const n = Math.min(Math.max(1, Math.floor(maxFrames)), wanted);
  const times: number[] = [];
  for (let i = 0; i < n; i += 1) {
    times.push(Math.round(((i + 0.5) * duration * 1000) / n) / 1000);
  }
  return times;
}
