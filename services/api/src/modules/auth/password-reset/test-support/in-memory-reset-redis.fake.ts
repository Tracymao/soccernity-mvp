import { ResetTokenRedisClient } from '../reset-token.store';

// Minimal in-memory stand-in for ResetTokenRedisClient, mirroring
// token/test-support/in-memory-redis.fake.ts's approach for the refresh-
// token store's tests — real hashing/expiry logic under test, no real
// Redis instance required in CI.
export class InMemoryResetRedisFake implements ResetTokenRedisClient {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return true;
    }
    return false;
  }

  async set(key: string, value: string, _mode: 'PX', ttlMs: number): Promise<unknown> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    if (this.isExpired(key)) return null;
    return this.store.get(key)?.value ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count += 1;
    }
    return count;
  }
}
