import { PostMediaKind } from './view-thresholds.util';

// backend/w12-points (B-093; Decision Log #384; docs/contest-spec.md sections 9c and 13: "server-validated
// playback and dwell heartbeats for view qualification (client-reported watch time alone is spoofable)").
//
// THE IDEA. The client never says "I watched 60 seconds". It sends small heartbeats while the post is
// on screen and the tab/app is in the foreground and (for a video) playing: { active, positionSeconds }.
// The SERVER keeps the clock. Time is credited only for the gap between two beats, measured by the
// server's own clock, so a client cannot claim more watching than has really elapsed:
//
//   - credit for a gap is at most the real elapsed time between the two beats, and only if BOTH beats
//     said "active" (visible, foreground, playing). A gap with a pause or a background tab earns nothing;
//   - a gap longer than MAX_GAP_SECONDS earns nothing (the viewer was not continuously reporting);
//   - for a VIDEO the playhead must have advanced: credit is also capped by how far the position moved,
//     so a paused video that keeps reporting "active" earns nothing; a position that moved BACKWARDS
//     (a rewind or a loop) earns nothing for that gap, and a position that jumped FORWARD by more than
//     the playback speed allows (a skip-ahead) earns nothing ("skipping ahead earns no credit; a loop
//     counts once"). Muted autoplay in the feed counts: mute is not sent and not stored.
//
// WHAT THIS CANNOT PROVE, and the report says so: a determined client can lie "active: true" with a
// moving position on a muted, off-screen video, and it can claim a short video length. The server can
// bound the cost of that (real elapsed time is always required; one point per account per post; a daily
// cap of 40 given), not eliminate it.

export const HEARTBEAT_INTERVAL_SECONDS = 3; // what the client is told to send
export const MAX_GAP_SECONDS = 6; // two intervals: one missed beat is forgiven, more is not
// A video may legitimately play faster than 1x; beyond this ratio of position-moved to time-elapsed, the
// move is a seek, not playback.
export const MAX_PLAYBACK_RATIO = 2;
// Position/elapsed jitter allowance, in seconds.
export const POSITION_TOLERANCE_SECONDS = 1;
// A session untouched for this long is forgotten (the Redis key expires).
export const SESSION_TTL_SECONDS = 120;

// A video that ends cannot move the playhead past its length, and the first beat rarely lands at exactly
// 0.0, so the last fraction of a second of a "full length" requirement is forgiven. Photos and text get no
// such allowance.
export const VIDEO_COMPLETION_TOLERANCE_SECONDS = 0.5;

export function meetsRequirement(creditedSeconds: number, requiredSeconds: number, kind: PostMediaKind): boolean {
  const tolerance = kind === 'video' ? VIDEO_COMPLETION_TOLERANCE_SECONDS : 0;
  return creditedSeconds + tolerance >= requiredSeconds;
}

export interface SessionState {
  /** Epoch ms of the last beat the server received (the SERVER's clock). */
  lastAtMs: number;
  lastActive: boolean;
  /** Playhead seconds at the last beat; null for a photo / text post. */
  lastPosition: number | null;
  /** Server-credited active seconds so far. */
  creditedSeconds: number;
  /** Outcomes already fired for this session (each fires once; the writes are idempotent anyway). */
  baselineDone: boolean;
  contestDone: boolean;
}

export interface Beat {
  active: boolean;
  /** Playhead seconds; required for a video, ignored otherwise. */
  position: number | null;
}

export function newSession(nowMs: number, beat: Beat): SessionState {
  return {
    lastAtMs: nowMs,
    lastActive: beat.active,
    lastPosition: beat.position,
    creditedSeconds: 0,
    baselineDone: false,
    contestDone: false,
  };
}

/** Seconds to credit for the gap between the previous beat and this one. Pure. */
export function creditForGap(prev: SessionState, beat: Beat, nowMs: number, kind: PostMediaKind): number {
  const elapsed = (nowMs - prev.lastAtMs) / 1000;
  if (!(elapsed > 0) || elapsed > MAX_GAP_SECONDS) return 0;
  if (!prev.lastActive || !beat.active) return 0;
  if (kind !== 'video') return elapsed;
  if (prev.lastPosition === null || beat.position === null) return 0;
  const moved = beat.position - prev.lastPosition;
  if (moved < 0) return 0; // a rewind or a loop restart
  if (moved > elapsed * MAX_PLAYBACK_RATIO + POSITION_TOLERANCE_SECONDS) return 0; // a skip ahead
  // The playhead cannot have given more watching than it moved; nor more than the real time elapsed.
  return Math.min(elapsed, moved);
}

/** Applies one beat to a session. Pure: returns the next state. */
export function applyBeat(prev: SessionState, beat: Beat, nowMs: number, kind: PostMediaKind): SessionState {
  const credit = creditForGap(prev, beat, nowMs, kind);
  return {
    ...prev,
    lastAtMs: nowMs,
    lastActive: beat.active,
    lastPosition: beat.position,
    creditedSeconds: prev.creditedSeconds + credit,
  };
}
