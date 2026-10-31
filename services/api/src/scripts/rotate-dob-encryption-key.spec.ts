import { randomBytes } from 'crypto';
import { DobKeyRing, decryptDobString, dobCiphertextVersion, encryptDobString } from '../crypto/dob-crypto';
import { RotationColumn, RotationRow, formatReport, rotateDobKey } from './rotate-dob-encryption-key';

const oldKey = randomBytes(32);
const newKey = randomBytes(32);
const V1: DobKeyRing = { current: { version: 1, key: oldKey } };
const ring: DobKeyRing = { current: { version: 2, key: newKey }, previous: { version: 1, key: oldKey } };
const noPrevious: DobKeyRing = { current: { version: 2, key: newKey } };
const wrongPrevious: DobKeyRing = { current: { version: 2, key: newKey }, previous: { version: 1, key: randomBytes(32) } };

// An in-memory column with hooks for "the application writes while the script runs".
class MemColumn implements RotationColumn {
  readonly rows = new Map<string, string>();
  writes = 0;
  fetchCalls = 0;
  afterFetch?: (call: number) => void;
  beforeReplace?: (id: string) => void;
  constructor(readonly label: string) {}

  put(id: string, plaintext: string, keyRing: DobKeyRing): this {
    this.rows.set(id, encryptDobString(plaintext, keyRing));
    return this;
  }
  async fetch(afterId: string | undefined, take: number): Promise<RotationRow[]> {
    const ids = [...this.rows.keys()].sort().filter((id) => afterId === undefined || id > afterId);
    const out = ids.slice(0, take).map((id) => ({ id, value: this.rows.get(id) as string }));
    this.fetchCalls++;
    this.afterFetch?.(this.fetchCalls);
    return out;
  }
  async replace(id: string, expected: string, next: string): Promise<number> {
    this.beforeReplace?.(id);
    if (this.rows.get(id) !== expected) return 0;
    this.rows.set(id, next);
    this.writes++;
    return 1;
  }
  plain(id: string, keyRing: DobKeyRing = ring): string {
    return decryptDobString(this.rows.get(id) as string, keyRing);
  }
  versions(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const v of this.rows.values()) {
      const n = dobCiphertextVersion(v) as number;
      out[n] = (out[n] ?? 0) + 1;
    }
    return out;
  }
}

const DOB = '2010-03-14T00:00:00.000Z';
const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';

function threeColumns() {
  const dob = new MemColumn('User.dateOfBirth').put('u1', DOB, V1).put('u2', '1999-01-02T00:00:00.000Z', V1).put('u3', '2004-07-08T00:00:00.000Z', ring);
  const userTotp = new MemColumn('User.totpSecretEncrypted').put('u1', SECRET, V1).put('u9', 'KRSXG5CTMVRXEZLUKRSXG5CTMVRXEZLU', V1);
  const adminTotp = new MemColumn('AdminUser.totpSecretEncrypted').put('a1', SECRET, V1);
  return { dob, userTotp, adminTotp, all: [dob, userTotp, adminTotp] };
}

describe('rotateDobKey', () => {
  it('re-encrypts every v1 value in all three columns to v2 and every value still decrypts to the same plaintext', async () => {
    const { dob, userTotp, adminTotp, all } = threeColumns();
    const report = await rotateDobKey(all, ring);

    expect(report.ok).toBe(true);
    expect(report.blocked).toBe(false);
    expect(report.rewritten).toBe(2 + 2 + 1);
    expect(report.skippedConcurrent).toBe(0);
    expect(dob.versions()).toEqual({ 2: 3 });
    expect(userTotp.versions()).toEqual({ 2: 2 });
    expect(adminTotp.versions()).toEqual({ 2: 1 });
    expect(dob.plain('u1')).toBe(DOB);
    expect(dob.plain('u2')).toBe('1999-01-02T00:00:00.000Z');
    expect(userTotp.plain('u1')).toBe(SECRET);
    expect(adminTotp.plain('a1')).toBe(SECRET);
    // The result is readable with the NEW key alone: the previous key can now be removed.
    expect(dob.plain('u1', noPrevious)).toBe(DOB);
    expect(report.after?.every((c) => Object.keys(c.byVersion).every((v) => v === '2'))).toBe(true);
  });

  it('is idempotent: a second run writes nothing', async () => {
    const { all } = threeColumns();
    await rotateDobKey(all, ring);
    const snapshot = all.map((c) => JSON.stringify([...c.rows.entries()]));
    const writesBefore = all.map((c) => c.writes);

    const again = await rotateDobKey(all, ring);

    expect(again.ok).toBe(true);
    expect(again.rewritten).toBe(0);
    expect(all.map((c) => JSON.stringify([...c.rows.entries()]))).toEqual(snapshot);
    expect(all.map((c) => c.writes)).toEqual(writesBefore);
  });

  it('a value already at the current version is never rewritten, even mid-rotation (mixed v1 and v2)', async () => {
    const { dob, all } = threeColumns();
    const alreadyNew = dob.rows.get('u3');
    await rotateDobKey(all, ring);
    expect(dob.rows.get('u3')).toBe(alreadyNew);
  });

  describe('--dry-run', () => {
    it('counts per column per version and writes nothing', async () => {
      const { dob, userTotp, adminTotp, all } = threeColumns();
      const before = all.map((c) => JSON.stringify([...c.rows.entries()]));

      const report = await rotateDobKey(all, ring, { dryRun: true });

      expect(report.mode).toBe('dry-run');
      expect(report.ok).toBe(true);
      expect(report.rewritten).toBe(0);
      expect(report.after).toBeNull();
      expect(all.every((c) => c.writes === 0)).toBe(true);
      expect(all.map((c) => JSON.stringify([...c.rows.entries()]))).toEqual(before);
      const byLabel = Object.fromEntries(report.before.map((c) => [c.label, c.byVersion]));
      expect(byLabel[dob.label]).toEqual({ 1: 2, 2: 1 });
      expect(byLabel[userTotp.label]).toEqual({ 1: 2 });
      expect(byLabel[adminTotp.label]).toEqual({ 1: 1 });
      expect(formatReport(report).join('\n')).toContain('Dry run: 5 value(s) would be re-encrypted. Nothing was written.');
    });

    it('reports a blocking problem as not ok, still with no writes', async () => {
      const { all } = threeColumns();
      const report = await rotateDobKey(all, noPrevious, { dryRun: true });
      expect(report.blocked).toBe(true);
      expect(report.ok).toBe(false);
      expect(all.every((c) => c.writes === 0)).toBe(true);
    });
  });

  describe('preflight: nothing is written when any value cannot be read', () => {
    it('previous key missing: v1 values exist, so it refuses and writes NOTHING (not even the readable v2 rows)', async () => {
      const { all } = threeColumns();
      const before = all.map((c) => JSON.stringify([...c.rows.entries()]));

      const report = await rotateDobKey(all, noPrevious);

      expect(report.blocked).toBe(true);
      expect(report.ok).toBe(false);
      expect(report.rewritten).toBe(0);
      expect(report.before[0].noKey).toBe(2);
      expect(all.every((c) => c.writes === 0)).toBe(true);
      expect(all.map((c) => JSON.stringify([...c.rows.entries()]))).toEqual(before);
      expect(formatReport(report).join('\n')).toContain('BLOCKED');
    });

    it('a previous key that is the wrong one (right shape, wrong bytes) refuses with zero writes', async () => {
      const { all } = threeColumns();
      const report = await rotateDobKey(all, wrongPrevious);
      expect(report.blocked).toBe(true);
      expect(report.before[0].undecryptable).toBe(2);
      expect(all.every((c) => c.writes === 0)).toBe(true);
    });

    it('a value with no version prefix (leftover plaintext) refuses with zero writes', async () => {
      const { dob, all } = threeColumns();
      dob.rows.set('u4', DOB);
      const report = await rotateDobKey(all, ring);
      expect(report.blocked).toBe(true);
      expect(report.before[0].unrecognised).toBe(1);
      expect(all.every((c) => c.writes === 0)).toBe(true);
    });

    it('a value at a version nobody holds a key for refuses with zero writes', async () => {
      const { dob, all } = threeColumns();
      dob.put('u4', DOB, { current: { version: 9, key: randomBytes(32) } });
      const report = await rotateDobKey(all, ring);
      expect(report.blocked).toBe(true);
      expect(report.before[0].noKey).toBe(1);
      expect(all.every((c) => c.writes === 0)).toBe(true);
    });
  });

  describe('batching and writes that happen while the script runs', () => {
    it('works across several batches', async () => {
      const col = new MemColumn('User.dateOfBirth');
      for (let i = 0; i < 7; i++) col.put(`u${i}`, DOB, V1);
      const report = await rotateDobKey([col], ring, { batchSize: 2 });
      expect(report.ok).toBe(true);
      expect(col.versions()).toEqual({ 2: 7 });
    });

    it('a row written between two batches AHEAD of the cursor (by an old instance, at v1) is picked up in a later batch', async () => {
      const col = new MemColumn('User.dateOfBirth');
      for (const id of ['u1', 'u2', 'u3', 'u4']) col.put(id, DOB, V1);
      let injected = false;
      col.afterFetch = () => {
        // First call of the REWRITE pass is call 4+ (preflight used 3 fetches); inject during the rewrite.
        if (col.writes > 0 && !injected) {
          injected = true;
          col.put('u9', '2002-02-02T00:00:00.000Z', V1);
        }
      };
      const report = await rotateDobKey([col], ring, { batchSize: 2 });
      expect(injected).toBe(true);
      expect(report.ok).toBe(true);
      expect(col.plain('u9')).toBe('2002-02-02T00:00:00.000Z');
      expect(col.versions()).toEqual({ 2: 5 });
    });

    it('a v1 row appearing BEHIND the cursor is caught by verification: not ok, and a re-run finishes the job', async () => {
      const col = new MemColumn('User.dateOfBirth');
      for (const id of ['u5', 'u6', 'u7']) col.put(id, DOB, V1);
      let injected = false;
      col.afterFetch = () => {
        if (col.writes >= 2 && !injected) {
          injected = true;
          col.put('u1', '2003-03-03T00:00:00.000Z', V1); // sorts before the cursor
        }
      };
      const first = await rotateDobKey([col], ring, { batchSize: 2 });
      expect(first.ok).toBe(false);
      expect(first.after?.[0].byVersion).toEqual({ 1: 1, 2: 3 });
      expect(formatReport(first).join('\n')).toContain('NOT DONE');

      col.afterFetch = undefined;
      const second = await rotateDobKey([col], ring, { batchSize: 2 });
      expect(second.ok).toBe(true);
      expect(second.rewritten).toBe(1);
      expect(col.plain('u1')).toBe('2003-03-03T00:00:00.000Z');
    });

    it('a value changed by the application between the read and the write is SKIPPED, never overwritten', async () => {
      const col = new MemColumn('User.dateOfBirth').put('u1', DOB, V1).put('u2', '1999-01-02T00:00:00.000Z', V1);
      const appWrote = encryptDobString('2020-12-12T00:00:00.000Z', ring); // the app writes with the CURRENT key
      col.beforeReplace = (id) => {
        if (id === 'u1') col.rows.set('u1', appWrote);
      };

      const report = await rotateDobKey([col], ring);

      expect(report.skippedConcurrent).toBe(1);
      expect(report.rewritten).toBe(1);
      expect(col.rows.get('u1')).toBe(appWrote); // untouched by the script
      expect(col.plain('u1')).toBe('2020-12-12T00:00:00.000Z');
      expect(report.ok).toBe(true); // the app's write is already at the current version
    });

    it('a skipped row that the app rewrote at the OLD version leaves verification not ok, and a re-run fixes it', async () => {
      const col = new MemColumn('User.dateOfBirth').put('u1', DOB, V1);
      const staleInstance = encryptDobString('2015-05-05T00:00:00.000Z', V1);
      let armed = true;
      col.beforeReplace = (id) => {
        if (armed && id === 'u1') {
          armed = false;
          col.rows.set('u1', staleInstance);
        }
      };
      const first = await rotateDobKey([col], ring);
      expect(first.skippedConcurrent).toBe(1);
      expect(first.ok).toBe(false);
      const second = await rotateDobKey([col], ring);
      expect(second.ok).toBe(true);
      expect(col.plain('u1')).toBe('2015-05-05T00:00:00.000Z');
    });
  });

  describe('output', () => {
    it('is counts only: no plaintext, ciphertext, key or id appears in the report text', async () => {
      const { all } = threeColumns();
      const lines: string[] = [];
      lines.push(...formatReport(await rotateDobKey(all, ring, { dryRun: true })));
      lines.push(...formatReport(await rotateDobKey(all, ring)));
      lines.push(...formatReport(await rotateDobKey(all, noPrevious)));
      const text = lines.join('\n');
      for (const secret of [DOB.slice(0, 10), '1999-01-02', SECRET, oldKey.toString('base64'), newKey.toString('base64'), 'u1', 'a1']) {
        expect(text).not.toContain(secret);
      }
      for (const col of all) for (const value of col.rows.values()) expect(text).not.toContain(value);
      expect(text).toContain('User.dateOfBirth');
      expect(text).toContain('AdminUser.totpSecretEncrypted');
    });
  });
});
