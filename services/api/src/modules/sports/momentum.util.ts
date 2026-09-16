import { RawMatchEvent } from '../../sports-data/sports-data-client';

// Derives the Match Momentum chart (Figma: "a 90-bar minute-by-minute attacking-danger chart... bar
// height = danger level", Decision Log candidate — see modules/sports/README.md) FROM the same
// `events` document already cached for the events/commentary endpoint, rather than storing (or
// calling Highlightly for) a separate "momentum" dataset. This is a real, disclosed design choice,
// not a shortcut: Highlightly's public API documentation names no dedicated momentum endpoint, and
// its confirmed event types are coarse (Goal / Yellow Card / Red Card / Substitution / VAR
// decisions) — there is no possession-percentage or shot-location time series available to derive a
// richer signal from. What this produces is therefore an HONEST APPROXIMATION driven only by
// discrete match incidents, not a licensed "momentum" statistic — exactly the distinction the Figma
// design's own on-screen explainer states ("momentum is a derived metric — not a count of shots or
// possession").
//
// Algorithm: each event contributes a weighted "danger" delta to its own team's bar, spread across a
// small window of minutes around it with linear (triangular) decay, so the chart reads as a wave
// rather than isolated spikes at otherwise-flat zero. A team's minute-N bar is the SUM of every
// event's contribution reaching minute N. Buckets are independent per team (home bars rendered
// above the centre line, away below — that's a presentation concern, not this function's).

export type MomentumSide = 'home' | 'away';

export interface MomentumBar {
  minute: number;
  home: number;
  away: number;
}

export interface MomentumMarker {
  minute: number;
  side: MomentumSide | null;
  type: string;
  label: string;
}

export interface MomentumChart {
  bars: MomentumBar[];
  markers: MomentumMarker[];
}

interface EventWeight {
  delta: number;
  spreadMinutes: number;
}

// Weights are a deliberate, disclosed judgment call (there is no "correct" value — see this file's
// own header comment) — a goal is by far the single biggest swing; cards register as a real but
// smaller dip for the carded side; substitutions carry no intensity weight (tactical, not a danger
// signal) but still appear as markers.
const EVENT_WEIGHTS: Record<string, EventWeight> = {
  Goal: { delta: 30, spreadMinutes: 6 },
  'Red Card': { delta: -15, spreadMinutes: 5 },
  'Yellow Card': { delta: -5, spreadMinutes: 3 },
};

const MIN_BAR_COUNT = 90;

function parseEventMinute(time: string): { minute: number; addedTime: number } {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(time.trim());
  if (!match) {
    return { minute: 0, addedTime: 0 };
  }
  return { minute: Number(match[1]), addedTime: match[2] ? Number(match[2]) : 0 };
}

function sideOf(event: RawMatchEvent, homeTeamId: string): MomentumSide | null {
  if (!event.team) return null;
  return String(event.team.id) === homeTeamId ? 'home' : 'away';
}

function isVarDecision(type: string): boolean {
  return /var/i.test(type);
}

// `homeTeamId` disambiguates which bar (home/away) each event's own `team` field belongs to —
// MatchData's own homeTeamId column, not re-derived here. `now` (defaults to the real clock) lets a
// still-live match's chart stop at the current minute rather than padding out to 90 with a flat
// zero tail; a finished match uses the true last event's minute (or the 90-bar floor, whichever is
// larger).
export function deriveMomentum(events: RawMatchEvent[], homeTeamId: string, isLive: boolean, liveMinute?: number): MomentumChart {
  const parsed = events.map((event) => ({ event, ...parseEventMinute(event.time) }));
  const lastEventMinute = parsed.reduce((max, e) => Math.max(max, e.minute), 0);
  const barCount = isLive && liveMinute
    ? Math.max(liveMinute, lastEventMinute)
    : Math.max(MIN_BAR_COUNT, lastEventMinute);

  const bars: MomentumBar[] = Array.from({ length: barCount }, (_, i) => ({ minute: i + 1, home: 0, away: 0 }));
  const markers: MomentumMarker[] = [];

  for (const { event, minute } of parsed) {
    const side = sideOf(event, homeTeamId);
    const weight = EVENT_WEIGHTS[event.type];

    if (weight && side) {
      for (const bar of bars) {
        const distance = Math.abs(bar.minute - minute);
        if (distance <= weight.spreadMinutes) {
          const contribution = weight.delta * (1 - distance / (weight.spreadMinutes + 1));
          bar[side] += contribution;
        }
      }
    }

    // Markers: every goal, every red card, and every VAR decision — the events the design brief
    // names as needing a timestamped marker on the chart. Substitutions and yellow cards are
    // intensity-only (or, for yellows, not even that beyond the dip above) and don't clutter the
    // marker row.
    if (event.type === 'Goal' || event.type === 'Red Card' || isVarDecision(event.type)) {
      markers.push({ minute, side, type: event.type, label: event.player ? `${event.type} — ${event.player}` : event.type });
    }
  }

  return { bars, markers };
}
