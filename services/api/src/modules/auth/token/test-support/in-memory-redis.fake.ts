import { RefreshTokenRedisClient } from '../refresh-token.store';

// Minimal in-memory stand-in for the narrow RefreshTokenRedisClient
// interface, so RefreshTokenStore's unit tests exercise real logic
// (hashing, family revocation, reuse detection) without requiring a real
// Redis instance in CI. TTLs are tracked and enforced (best-effort, via
// Date.now() checks) so tests can assert on expiry behavior too.
export class InMemoryRedisFake implements RefreshTokenRedisClient {
  private readonly store = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly sets = new Map<string, Set<string>>();

  private isExpired(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return true;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
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
      if (this.sets.delete(key)) count += 1;
    }
    return count;
  }

  async sadd(key: string, member: string): Promise<number> {
    const existing = this.sets.get(key) ?? new Set<string>();
    const before = existing.size;
    existing.add(member);
    this.sets.set(key, existing);
    return existing.size - before;
  }

  async smembers(key: string): Promise<string[]> {
    return Array.from(this.sets.get(key) ?? []);
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    // Sets in this fake don't need TTL enforcement for the store's tests
    // (family/user index membership, not expiry, is what's under test) —
    // accepted as a no-op that still satisfies the interface.
    return 1;
  }
}
