import { Inject, Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

// Narrow Redis subset (same convention as BudgetRedisClient in
// sports-data-budget.service.ts / RefreshTokenRedisClient in modules/auth/token/refresh-token.store.ts).
export interface RefreshLockRedisClient {
  set(key: string, value: string, exMode: 'EX', ttlSeconds: number, nxMode: 'NX'): Promise<'OK' | null>;
}

// The core of this module's rate-limit-conscious caching strategy — see modules/sports/README.md's
// "Caching / refresh strategy" section for the full reasoning. ONE Redis key does double duty as
// BOTH the cache-freshness marker AND the cross-request stampede guard, rather than two separate
// mechanisms:
//
//   - Its mere EXISTENCE for `ttlSeconds` means "a refresh against Highlightly already happened (or
//     is in flight) recently enough — don't call upstream again, just serve whatever's currently in
//     Postgres." That's the freshness/TTL half.
//   - Because the write uses `SET key value EX ttlSeconds NX`, only the FIRST caller to race for a
//     given key within the TTL window ever gets `true` back — every concurrent caller within that
//     same window gets `false` and reads the (possibly still-being-refreshed) DB row instead of
//     also hitting Highlightly. That's the stampede-guard half.
//
// Postgres itself (MatchData/Standing's own columns) is the actual durable cache-through store —
// this lock only decides WHETHER the current request is the one responsible for refreshing it, not
// where the data itself lives. If Highlightly is unreachable or the daily budget is exhausted, the
// lock is still acquired (this request tried) but the refresh itself fails inside
// sports.service.ts, which then falls back to whatever's already in Postgres — see that file's own
// comment on graceful degradation.
@Injectable()
export class SportsRefreshLock {
  constructor(@Inject(RedisService) private readonly redis: RefreshLockRedisClient) {}

  // Returns true iff THIS call acquired the lock (i.e. is responsible for refreshing `key` from
  // Highlightly right now). Returns false if another request already holds it — the caller should
  // skip the upstream refresh and just read the current DB state.
  async tryAcquire(key: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }
}
