import { ConfigService } from '@nestjs/config';
import { SportsDataBudgetExhaustedError } from './sports-data.errors';
import { BudgetRedisClient, DEFAULT_DAILY_REQUEST_BUDGET, SportsDataBudgetService } from './sports-data-budget.service';

// A tiny in-memory fake of BudgetRedisClient's narrow subset — mirrors this codebase's established
// in-memory-fake-for-a-narrow-Redis-interface convention (modules/auth/token/test-support/
// in-memory-redis.fake.ts), scoped to just INCR/EXPIREAT/GET.
function buildFakeRedis(): BudgetRedisClient & { store: Map<string, number> } {
  const store = new Map<string, number>();
  return {
    store,
    async incr(key: string) {
      const next = (store.get(key) ?? 0) + 1;
      store.set(key, next);
      return next;
    },
    async expireat() {
      return 1;
    },
    async get(key: string) {
      const value = store.get(key);
      return value === undefined ? null : String(value);
    },
  };
}

function buildConfig(overrides: Record<string, unknown> = {}): ConfigService {
  return { get: (key: string) => overrides[key] } as unknown as ConfigService;
}

describe('SportsDataBudgetService', () => {
  it('reserves requests silently while under the default budget', async () => {
    const redis = buildFakeRedis();
    const service = new SportsDataBudgetService(redis as never, buildConfig());

    await expect(service.reserveRequest(new Date('2026-09-16T10:00:00.000Z'))).resolves.toBeUndefined();
    expect(redis.store.get('sports:highlightly:request-count:2026-09-16')).toBe(1);
  });

  it('throws SportsDataBudgetExhaustedError once the configured daily budget is exceeded', async () => {
    const redis = buildFakeRedis();
    const service = new SportsDataBudgetService(redis as never, buildConfig({ HIGHLIGHTLY_DAILY_REQUEST_BUDGET: 2 }));
    const now = new Date('2026-09-16T10:00:00.000Z');

    await service.reserveRequest(now);
    await service.reserveRequest(now);
    await expect(service.reserveRequest(now)).rejects.toBeInstanceOf(SportsDataBudgetExhaustedError);
  });

  it('defaults to DEFAULT_DAILY_REQUEST_BUDGET (100 — the confirmed free tier) when unconfigured', async () => {
    const redis = buildFakeRedis();
    const service = new SportsDataBudgetService(redis as never, buildConfig());
    const now = new Date('2026-09-16T10:00:00.000Z');

    for (let i = 0; i < DEFAULT_DAILY_REQUEST_BUDGET; i += 1) {
      await service.reserveRequest(now);
    }
    await expect(service.reserveRequest(now)).rejects.toBeInstanceOf(SportsDataBudgetExhaustedError);
  });

  it('keys the counter by UTC calendar day, so a new day starts a fresh count', async () => {
    const redis = buildFakeRedis();
    const service = new SportsDataBudgetService(redis as never, buildConfig({ HIGHLIGHTLY_DAILY_REQUEST_BUDGET: 1 }));

    await service.reserveRequest(new Date('2026-09-16T23:59:00.000Z'));
    await expect(service.reserveRequest(new Date('2026-09-16T23:59:30.000Z'))).rejects.toBeInstanceOf(SportsDataBudgetExhaustedError);
    // A new UTC day is a genuinely different key — not exhausted.
    await expect(service.reserveRequest(new Date('2026-09-17T00:00:01.000Z'))).resolves.toBeUndefined();
  });

  it('getRemainingRequests is a pure read — never increments the counter', async () => {
    const redis = buildFakeRedis();
    const service = new SportsDataBudgetService(redis as never, buildConfig({ HIGHLIGHTLY_DAILY_REQUEST_BUDGET: 5 }));
    const now = new Date('2026-09-16T10:00:00.000Z');

    await service.reserveRequest(now);
    const remainingBefore = await service.getRemainingRequests(now);
    const remainingAfter = await service.getRemainingRequests(now);

    expect(remainingBefore).toBe(4);
    expect(remainingAfter).toBe(4); // reading twice never changes the count
  });
});
