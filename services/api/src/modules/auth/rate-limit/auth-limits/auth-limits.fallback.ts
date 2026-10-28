import { HitResult } from './auth-limits.store';

// Per-process stand-in for Redis, used by AuthLimitsStore ONLY while Redis is unreachable, so the brute-force
// limits keep applying per API instance during an outage instead of vanishing. Same semantics as the Redis
// commands the store uses: a counter that starts a window on its first hit, a release that gives a slot back,
// a remaining-time lookup, and a set-if-absent claim.
//
// Bounded on purpose: entries expire, and the map is capped; at the cap the oldest entry (insertion order) is
// evicted. Under a flood of distinct keys during an outage an attacker can therefore push out an old counter;
// that is the cost of bounded memory, and it is no worse than the previous behaviour (no limit at all).
export const FALLBACK_MAX_ENTRIES = 10_000;

interface Entry {
  count: number;
  expiresAt: number;
}

export class InMemoryCounters {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly maxEntries: number = FALLBACK_MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  hit(key: string, windowSeconds: number): HitResult {
    const live = this.live(key);
    if (live) {
      live.count += 1;
      return { count: live.count, windowSeconds };
    }
    this.insert(key, { count: 1, expiresAt: this.now() + windowSeconds * 1000 });
    return { count: 1, windowSeconds };
  }

  // A key that is not here (it lives in Redis, or already expired) is left alone, never driven negative.
  release(key: string): void {
    const live = this.live(key);
    if (!live) return;
    live.count -= 1;
    if (live.count <= 0) this.entries.delete(key);
  }

  // Whole seconds until the entry expires; -1 if there is none.
  ttlSeconds(key: string): number {
    const live = this.live(key);
    return live ? Math.max(1, Math.ceil((live.expiresAt - this.now()) / 1000)) : -1;
  }

  // SET key NX EX: true only for the caller that created the entry.
  claim(key: string, ttlSeconds: number): boolean {
    if (this.live(key)) return false;
    this.insert(key, { count: 1, expiresAt: this.now() + ttlSeconds * 1000 });
    return true;
  }

  clear(key: string): void {
    this.entries.delete(key);
  }

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }

  private insert(key: string, entry: Entry): void {
    if (this.entries.size >= this.maxEntries) {
      const now = this.now();
      for (const [k, e] of this.entries) if (e.expiresAt <= now) this.entries.delete(k);
      while (this.entries.size >= this.maxEntries) {
        const oldest = this.entries.keys().next();
        if (oldest.done) break;
        this.entries.delete(oldest.value);
      }
    }
    this.entries.set(key, entry);
  }
}
