import { QUARTER_UNITS_PER_POINT } from './points.constants';

// backend/w12-points (B-093, Decision Log #383). Quarter-point arithmetic. All pure and integer.

/** Whole points (a placement prize, a configured cap) to stored quarter units. */
export function pointsToQuarters(points: number): number {
  return Math.round(points * QUARTER_UNITS_PER_POINT);
}

/**
 * Stored quarter units to the whole-number points a user is shown: the nearest whole point, a half
 * rounding UP (spec 9b). 2 units (0.5) -> 1, 1 unit (0.25) -> 0, 6 units (1.5) -> 2.
 * Integer arithmetic only, so there is no floating-point half to get wrong.
 */
export function quartersToDisplayPoints(quarters: number): number {
  return Math.floor((quarters + QUARTER_UNITS_PER_POINT / 2) / QUARTER_UNITS_PER_POINT);
}
