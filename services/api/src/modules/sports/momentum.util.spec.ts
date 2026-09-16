import { RawMatchEvent } from '../../sports-data/sports-data-client';
import { deriveMomentum } from './momentum.util';

const HOME = 'home-team-1';
const AWAY = 'away-team-1';

function event(overrides: Partial<RawMatchEvent> & Pick<RawMatchEvent, 'time' | 'type'>): RawMatchEvent {
  return { team: { id: HOME, name: 'Home' }, ...overrides };
}

describe('deriveMomentum', () => {
  it('produces at least 90 bars for a match with no events (the MIN_BAR_COUNT floor)', () => {
    const chart = deriveMomentum([], HOME, false);
    expect(chart.bars).toHaveLength(90);
    expect(chart.bars.every((b) => b.home === 0 && b.away === 0)).toBe(true);
    expect(chart.markers).toHaveLength(0);
  });

  it('attributes a goal to the correct side by comparing event.team.id against homeTeamId', () => {
    const events = [event({ time: '23', type: 'Goal', team: { id: HOME, name: 'Home' }, player: 'Salah' })];
    const chart = deriveMomentum(events, HOME, false);

    const bar23 = chart.bars.find((b) => b.minute === 23)!;
    expect(bar23.home).toBeGreaterThan(0);
    expect(bar23.away).toBe(0);
  });

  it('spreads a goal contribution across a decaying window of minutes, not just the exact minute', () => {
    const events = [event({ time: '50', type: 'Goal', team: { id: HOME, name: 'Home' } })];
    const chart = deriveMomentum(events, HOME, false);

    const at50 = chart.bars.find((b) => b.minute === 50)!.home;
    const at48 = chart.bars.find((b) => b.minute === 48)!.home;
    const at60 = chart.bars.find((b) => b.minute === 60)!.home; // far outside the spread window

    expect(at50).toBeGreaterThan(at48);
    expect(at48).toBeGreaterThan(0);
    expect(at60).toBe(0);
  });

  it('gives an away-team goal a NEGATIVE effect on nothing else — it only ever adds to the away bar, never subtracts from home', () => {
    const events = [event({ time: '10', type: 'Goal', team: { id: AWAY, name: 'Away' } })];
    const chart = deriveMomentum(events, HOME, false);

    const bar10 = chart.bars.find((b) => b.minute === 10)!;
    expect(bar10.away).toBeGreaterThan(0);
    expect(bar10.home).toBe(0);
  });

  it('applies a negative dip for a red card to the carded team only', () => {
    const events = [event({ time: '76', type: 'Red Card', team: { id: AWAY, name: 'Away' } })];
    const chart = deriveMomentum(events, HOME, false);

    const bar76 = chart.bars.find((b) => b.minute === 76)!;
    expect(bar76.away).toBeLessThan(0);
    expect(bar76.home).toBe(0);
  });

  it('ignores an event type with no configured weight (e.g. Substitution) for intensity, but still creates no marker for it either', () => {
    const events = [event({ time: '55', type: 'Substitution', substituted: 'Player A', player: 'Player B' })];
    const chart = deriveMomentum(events, HOME, false);

    expect(chart.bars.every((b) => b.home === 0 && b.away === 0)).toBe(true);
    expect(chart.markers).toHaveLength(0);
  });

  it('creates a marker for every goal, red card, and VAR decision — not for yellow cards or substitutions', () => {
    const events: RawMatchEvent[] = [
      event({ time: '23', type: 'Goal', player: 'Salah' }),
      event({ time: '33', type: 'Yellow Card', player: 'Caicedo' }),
      event({ time: '66', type: 'VAR Decision: Goal Disallowed' }),
      event({ time: '76', type: 'Red Card', player: 'Fernández' }),
      event({ time: '55', type: 'Substitution' }),
    ];
    const chart = deriveMomentum(events, HOME, false);

    expect(chart.markers.map((m) => m.type)).toEqual(['Goal', 'VAR Decision: Goal Disallowed', 'Red Card']);
  });

  it('parses stoppage-time minute strings like "45+1" as their base minute for bucketing', () => {
    const events = [event({ time: '45+1', type: 'Goal' })];
    const chart = deriveMomentum(events, HOME, false);

    const marker = chart.markers[0];
    expect(marker.minute).toBe(45);
  });

  it('extends bar count beyond 90 when a live match minute is later than 90', () => {
    const chart = deriveMomentum([], HOME, true, 95);
    expect(chart.bars).toHaveLength(95);
  });

  it('extends bar count beyond 90 when the last event minute itself is later than 90 (a finished match with stoppage time)', () => {
    const events = [event({ time: '94', type: 'Goal' })];
    const chart = deriveMomentum(events, HOME, false);
    expect(chart.bars.length).toBeGreaterThanOrEqual(94);
  });
});
