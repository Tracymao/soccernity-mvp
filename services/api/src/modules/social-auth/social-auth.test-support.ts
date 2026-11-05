import { SocialRedisClient } from './social-auth.stores';

// An in-memory stand-in for the slice of ioredis these stores use. TTLs are recorded, not enforced; a test that needs
// "expired" deletes the key.
export class FakeRedis implements SocialRedisClient {
  data = new Map<string, string>();
  ttls = new Map<string, number>();
  async set(key: string, value: string, _mode: 'EX', seconds: number) {
    this.data.set(key, value);
    this.ttls.set(key, seconds);
    return 'OK';
  }
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async del(...keys: string[]) {
    let n = 0;
    for (const k of keys) if (this.data.delete(k)) n += 1;
    return n;
  }
  async incr(key: string) {
    const next = Number(this.data.get(key) ?? '0') + 1;
    this.data.set(key, String(next));
    return next;
  }
  async expire(key: string, seconds: number) {
    this.ttls.set(key, seconds);
    return 1;
  }
}
