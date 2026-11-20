import { MAX_GAP_SECONDS, SessionState, applyBeat, creditForGap, meetsRequirement, newSession } from './view-session.util';

const T0 = 1_000_000;
const at = (seconds: number) => T0 + seconds * 1000;

function walk(
  kind: 'video' | 'photo',
  beats: Array<{ t: number; active: boolean; position?: number }>,
): SessionState {
  let state = newSession(at(beats[0].t), { active: beats[0].active, position: beats[0].position ?? null });
  for (const b of beats.slice(1)) {
    state = applyBeat(state, { active: b.active, position: b.position ?? null }, at(b.t), kind);
  }
  return state;
}

describe('server-validated view heartbeats (spec 9c, 13)', () => {
  describe('photo / text', () => {
    it('credits the SERVER-measured gap between two active beats', () => {
      const s = walk('photo', [
        { t: 0, active: true },
        { t: 3, active: true },
      ]);
      expect(s.creditedSeconds).toBe(3);
      expect(meetsRequirement(s.creditedSeconds, 3, 'photo')).toBe(true);
    });

    it('cannot be sped up: three beats in one second credit one second, not nine', () => {
      const s = walk('photo', [
        { t: 0, active: true },
        { t: 0.5, active: true },
        { t: 1, active: true },
      ]);
      expect(s.creditedSeconds).toBeCloseTo(1, 5);
      expect(meetsRequirement(s.creditedSeconds, 3, 'photo')).toBe(false);
    });

    it('a gap with an inactive end (backgrounded / scrolled away) earns nothing', () => {
      const s = walk('photo', [
        { t: 0, active: true },
        { t: 3, active: false },
        { t: 6, active: true },
        { t: 9, active: true },
      ]);
      // 0->3: current inactive (0). 3->6: previous inactive (0). 6->9: both active (3).
      expect(s.creditedSeconds).toBe(3);
    });

    it('a gap longer than MAX_GAP_SECONDS earns nothing: one missed beat is forgiven, a long silence is not', () => {
      const forgiven = walk('photo', [
        { t: 0, active: true },
        { t: MAX_GAP_SECONDS, active: true },
      ]);
      expect(forgiven.creditedSeconds).toBe(MAX_GAP_SECONDS);
      const silent = walk('photo', [
        { t: 0, active: true },
        { t: MAX_GAP_SECONDS + 0.1, active: true },
      ]);
      expect(silent.creditedSeconds).toBe(0);
    });

    it('a single beat credits nothing', () => {
      expect(walk('photo', [{ t: 0, active: true }]).creditedSeconds).toBe(0);
    });

    it('a clock that did not advance (or went backwards) credits nothing', () => {
      const s = newSession(at(5), { active: true, position: null });
      expect(creditForGap(s, { active: true, position: null }, at(5), 'photo')).toBe(0);
      expect(creditForGap(s, { active: true, position: null }, at(4), 'photo')).toBe(0);
    });
  });

  describe('video', () => {
    it('credits time when the playhead keeps pace with the clock', () => {
      const s = walk('video', [
        { t: 0, active: true, position: 0 },
        { t: 3, active: true, position: 3 },
        { t: 6, active: true, position: 6 },
      ]);
      expect(s.creditedSeconds).toBe(6);
    });

    it('a PAUSED video that keeps reporting active earns nothing (the playhead did not move)', () => {
      const s = walk('video', [
        { t: 0, active: true, position: 10 },
        { t: 3, active: true, position: 10 },
        { t: 6, active: true, position: 10 },
      ]);
      expect(s.creditedSeconds).toBe(0);
    });

    it('SKIPPING AHEAD earns nothing for that gap', () => {
      const s = walk('video', [
        { t: 0, active: true, position: 0 },
        { t: 3, active: true, position: 40 }, // a seek, not playback
        { t: 6, active: true, position: 43 }, // normal play resumes
      ]);
      expect(s.creditedSeconds).toBe(3);
    });

    it('a REWIND or a LOOP restart earns nothing for that gap (a loop counts once)', () => {
      const s = walk('video', [
        { t: 0, active: true, position: 8 },
        { t: 3, active: true, position: 11 },
        { t: 6, active: true, position: 0 }, // looped back to the start
        { t: 9, active: true, position: 3 },
      ]);
      // 3 (first gap) + 0 (the loop gap) + 3 (playing again)
      expect(s.creditedSeconds).toBe(6);
    });

    it('2x playback is credited at real time, not at 2x (the clock is the limit)', () => {
      const s = walk('video', [
        { t: 0, active: true, position: 0 },
        { t: 3, active: true, position: 6 },
      ]);
      expect(s.creditedSeconds).toBe(3);
    });

    it('a video beat without a playhead earns nothing', () => {
      const prev = newSession(at(0), { active: true, position: 0 });
      expect(creditForGap(prev, { active: true, position: null }, at(3), 'video')).toBe(0);
    });
  });

  describe('meetsRequirement', () => {
    it('forgives the last half second of a video (the playhead cannot pass the end), nothing for a photo', () => {
      expect(meetsRequirement(11.6, 12, 'video')).toBe(true);
      expect(meetsRequirement(11.4, 12, 'video')).toBe(false);
      expect(meetsRequirement(2.6, 3, 'photo')).toBe(false);
      expect(meetsRequirement(3, 3, 'photo')).toBe(true);
    });
  });
});
