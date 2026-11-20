import { BackupCodeRow, TwoFactorRepository, TwoFactorSubject } from '../two-factor.repository';

// In-memory stand-ins for the two things TwoFactorService sits on, so its unit specs exercise the REAL logic (stores,
// limiter, hashing, encryption, replay guard) without Postgres or Redis. Single-threaded JS makes each method atomic,
// which is what the real updateMany / DEL calls guarantee in the database.

// A Redis subset with a controllable clock (`now`, in ms) so expiry and lock windows can be tested without waiting.
export class FakeTwoFactorRedis {
  now = 1_000_000_000_000;
  private readonly data = new Map<string, { value: string; expiresAt: number | null }>();

  private live(key: string) {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  advance(seconds: number): void {
    this.now += seconds * 1000;
  }

  async set(key: string, value: string, _mode: 'EX', seconds: number): Promise<'OK'> {
    this.data.set(key, { value, expiresAt: this.now + seconds * 1000 });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.live(key)) removed += 1;
      this.data.delete(key);
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.data.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : null });
    return next;
  }

  async decr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) - 1;
    this.data.set(key, { value: String(next), expiresAt: entry ? entry.expiresAt : null });
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.live(key);
    if (!entry) return 0;
    entry.expiresAt = this.now + seconds * 1000;
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    return Math.ceil((entry.expiresAt - this.now) / 1000);
  }

  keys(): string[] {
    return [...this.data.keys()].filter((k) => this.live(k));
  }

  rawValue(key: string): string | undefined {
    return this.live(key)?.value;
  }
}

let counter = 0;

export class FakeTwoFactorRepository implements TwoFactorRepository {
  readonly subjects = new Map<string, TwoFactorSubject>();
  readonly codes = new Map<string, Array<BackupCodeRow & { subjectId: string; usedAt: Date | null }>>();

  seed(overrides: Partial<TwoFactorSubject> & { id: string }): TwoFactorSubject {
    const subject: TwoFactorSubject = {
      email: `${overrides.id}@example.com`,
      passwordHash: 'unused',
      accountStatus: 'active',
      totpSecretEncrypted: null,
      totpEnabledAt: null,
      totpLastUsedStep: null,
      ...overrides,
    };
    this.subjects.set(subject.id, subject);
    return subject;
  }

  async find(id: string): Promise<TwoFactorSubject | null> {
    const found = this.subjects.get(id);
    return found ? { ...found } : null;
  }

  async enable(id: string, secretEncrypted: string, step: number, codeHashes: string[]): Promise<boolean> {
    const subject = this.subjects.get(id);
    if (!subject || subject.totpEnabledAt) return false;
    subject.totpSecretEncrypted = secretEncrypted;
    subject.totpEnabledAt = new Date();
    subject.totpLastUsedStep = step;
    this.codes.set(
      id,
      codeHashes.map((codeHash) => ({ id: `code-${++counter}`, codeHash, subjectId: id, usedAt: null })),
    );
    return true;
  }

  async disable(id: string, extra?: (tx: never) => Promise<void>): Promise<void> {
    const subject = this.subjects.get(id);
    if (subject) {
      subject.totpSecretEncrypted = null;
      subject.totpEnabledAt = null;
      subject.totpLastUsedStep = null;
    }
    this.codes.delete(id);
    if (extra) await extra({} as never);
  }

  async replaceBackupCodes(id: string, codeHashes: string[]): Promise<void> {
    this.codes.set(
      id,
      codeHashes.map((codeHash) => ({ id: `code-${++counter}`, codeHash, subjectId: id, usedAt: null })),
    );
  }

  async unusedBackupCodes(id: string): Promise<BackupCodeRow[]> {
    return (this.codes.get(id) ?? []).filter((c) => c.usedAt === null).map(({ id: cid, codeHash }) => ({ id: cid, codeHash }));
  }

  async countUnusedBackupCodes(id: string): Promise<number> {
    return (await this.unusedBackupCodes(id)).length;
  }

  async spendBackupCode(codeId: string): Promise<boolean> {
    for (const list of this.codes.values()) {
      const row = list.find((c) => c.id === codeId);
      if (row) {
        if (row.usedAt) return false;
        row.usedAt = new Date();
        return true;
      }
    }
    return false;
  }

  async advanceStep(id: string, step: number): Promise<boolean> {
    const subject = this.subjects.get(id);
    if (!subject) return false;
    if (subject.totpLastUsedStep !== null && subject.totpLastUsedStep >= step) return false;
    subject.totpLastUsedStep = step;
    return true;
  }
}
