import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { SportsDataBudgetExhaustedError } from './sports-data.errors';

// Highlightly's free tier is a CONFIRMED 100 requests/day (per the task brief and this project's
// own vendor-selection research). The real paid-tier budget is NOT known — this default matches
// only the confirmed free tier, and running this in production against a genuinely higher (or
// lower) paid-plan quota needs a founder decision on which plan to buy, then an env override here.
// Stated plainly rather than silently assumed unlimited, per this PR's own task brief.
export const DEFAULT_DAILY_REQUEST_BUDGET = 100;

// Narrow Redis subset (mirrors RefreshTokenRedisClient's own convention in
// modules/auth/token/refresh-token.store.ts) — just enough for an atomic daily counter, so a unit
// test can substitute an in-memory fake with no real Redis instance.
export interface BudgetRedisClient {
  incr(key: string): Promise<number>;
  expireat(key: string, unixTimeSeconds: number): Promise<number>;
  get(key: string): Promise<string | null>;
}

function todayUtcKey(now: Date): string {
  return `sports:highlightly:request-count:${now.toISOString().slice(0, 10)}`;
}

function nextUtcMidnightUnixSeconds(now: Date): number {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0));
  return Math.floor(next.getTime() / 1000);
}

// Guards HighlightlyClient's own outbound calls against the daily request budget above. A single
// Redis INCR per real upstream call, keyed by the current UTC calendar day, with its expiry set (on
// the FIRST increment of the day only — see `reserveRequest` below) to the next UTC midnight so the
// counter resets itself with no separate cleanup job. `reserveRequest()` is called BEFORE the actual
// HTTP request fires (not after) — the cost of ever slightly under-counting due to a request that
// then fails is far smaller than the cost of over-spending a 100/day budget by racing several
// concurrent calls against a check-then-increment pattern.
@Injectable()
export class SportsDataBudgetService {
  private readonly dailyBudget: number;

  constructor(
    @Inject(RedisService) private readonly redis: BudgetRedisClient,
    config: ConfigService,
  ) {
    this.dailyBudget = config.get<number>('HIGHLIGHTLY_DAILY_REQUEST_BUDGET') ?? DEFAULT_DAILY_REQUEST_BUDGET;
  }

  // Throws SportsDataBudgetExhaustedError instead of ever letting the count exceed the configured
  // budget — INCR always runs (so a request racing right at the boundary is still accounted for),
  // but the caller is told to abort BEFORE spending an HTTP call once the budget's already gone.
  async reserveRequest(now: Date = new Date()): Promise<void> {
    const key = todayUtcKey(now);
    const count = await this.redis.incr(key);
    if (count === 1) {
      // First increment for this UTC day — set this key's own expiry to roll it over at the next
      // UTC midnight, so no separate scheduled job is needed to reset the counter.
      await this.redis.expireat(key, nextUtcMidnightUnixSeconds(now));
    }
    if (count > this.dailyBudget) {
      throw new SportsDataBudgetExhaustedError(
        `Daily Highlightly request budget (${this.dailyBudget}) exhausted for ${now.toISOString().slice(0, 10)} UTC`,
      );
    }
  }

  // Pure read (never increments) — used only for diagnostics/health, never on the hot path of an
  // actual sports-data fetch (reserveRequest above is what gates real calls).
  async getRemainingRequests(now: Date = new Date()): Promise<number> {
    const raw = await this.redis.get(todayUtcKey(now));
    const used = raw ? Number(raw) : 0;
    return Math.max(this.dailyBudget - used, 0);
  }
}
