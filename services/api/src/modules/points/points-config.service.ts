import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DAILY_CAP_GIVEN_POINTS,
  DEFAULT_DAILY_CAP_RECEIVED_POINTS,
} from './points.constants';
import { pointsToQuarters } from './quarter-points.util';

// backend/w12-points (B-093, spec 9b: "admin-configurable settings, not hardcoded"). The two daily caps
// are held in configuration -- POINTS_DAILY_CAP_GIVEN and POINTS_DAILY_CAP_RECEIVED, both in whole
// points -- and read on every use, so a change needs a restart of the environment, never a deploy of
// code. An unset, blank, non-numeric, non-integer or non-positive value falls back to the spec's
// default (40 / 20) rather than disabling the cap: a typo must never switch the anti-spam cap off.

/** The daily caps, in QUARTER units, ready to compare with ledger sums. */
export interface PointsCaps {
  givenQuarters: number;
  receivedQuarters: number;
}

export const DEFAULT_POINTS_CAPS: PointsCaps = {
  givenQuarters: pointsToQuarters(DEFAULT_DAILY_CAP_GIVEN_POINTS),
  receivedQuarters: pointsToQuarters(DEFAULT_DAILY_CAP_RECEIVED_POINTS),
};

function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const trimmed = String(raw).trim();
  if (!/^\d+$/.test(trimmed)) return fallback;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

@Injectable()
export class PointsConfig {
  constructor(private readonly config: ConfigService) {}

  get caps(): PointsCaps {
    return {
      givenQuarters: pointsToQuarters(
        readPositiveInt(this.config.get<string>('POINTS_DAILY_CAP_GIVEN'), DEFAULT_DAILY_CAP_GIVEN_POINTS),
      ),
      receivedQuarters: pointsToQuarters(
        readPositiveInt(this.config.get<string>('POINTS_DAILY_CAP_RECEIVED'), DEFAULT_DAILY_CAP_RECEIVED_POINTS),
      ),
    };
  }
}
