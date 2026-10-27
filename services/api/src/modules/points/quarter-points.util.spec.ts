import { pointsToQuarters, quartersToDisplayPoints } from './quarter-points.util';

describe('quarter-point units (Decision Log #383)', () => {
  it('converts whole points to units and back', () => {
    expect(pointsToQuarters(1)).toBe(4);
    expect(pointsToQuarters(500)).toBe(2000);
    expect(pointsToQuarters(0.25)).toBe(1);
    expect(quartersToDisplayPoints(4)).toBe(1);
    expect(quartersToDisplayPoints(2000)).toBe(500);
  });

  it('displays the nearest whole point, a half rounding UP', () => {
    expect(quartersToDisplayPoints(0)).toBe(0);
    expect(quartersToDisplayPoints(1)).toBe(0); // 0.25
    expect(quartersToDisplayPoints(2)).toBe(1); // 0.5 -> up
    expect(quartersToDisplayPoints(3)).toBe(1); // 0.75
    expect(quartersToDisplayPoints(5)).toBe(1); // 1.25
    expect(quartersToDisplayPoints(6)).toBe(2); // 1.5 -> up
    expect(quartersToDisplayPoints(7)).toBe(2); // 1.75
    expect(quartersToDisplayPoints(1002)).toBe(251); // 250.5 -> up
    expect(quartersToDisplayPoints(1001)).toBe(250); // 250.25
  });

  it('two different exact totals can display the same points, which is why ranking uses the exact value', () => {
    expect(quartersToDisplayPoints(5)).toBe(quartersToDisplayPoints(4));
    expect(5).not.toBe(4);
  });
});
