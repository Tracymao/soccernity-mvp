import { randomBytes } from 'crypto';
import { DobKeyRing, decryptDobString, encryptDobString } from '../crypto/dob-crypto';
import { runBackfill } from './backfill-dob-encryption';

// The pre-deploy hook in render.yaml runs this script on EVERY deploy. After a key rotation the stored values are v2;
// the script must leave them alone (a "v1:"-only test would have treated them as plaintext and encrypted them twice).
const oldKey = randomBytes(32);
const newKey = randomBytes(32);
const rotating: DobKeyRing = { current: { version: 2, key: newKey }, previous: { version: 1, key: oldKey } };
const noPrevious: DobKeyRing = { current: { version: 2, key: newKey } };
const PLAIN = '1985-02-03T00:00:00.000Z';

function fakePrisma(initial: Record<string, string | null>) {
  const rows = new Map(Object.entries(initial));
  const writes: string[] = [];
  const prisma = {
    user: {
      findMany: async (args: { cursor?: { id: string }; skip?: number; take: number }) => {
        const ids = [...rows.keys()].filter((id) => rows.get(id) !== null).sort();
        const start = args.cursor ? ids.indexOf(args.cursor.id) + (args.skip ?? 0) : 0;
        return ids.slice(start, start + args.take).map((id) => ({ id, dateOfBirth: rows.get(id) }));
      },
      updateMany: async (args: { where: { id: string; dateOfBirth: string }; data: { dateOfBirth: string } }) => {
        if (rows.get(args.where.id) !== args.where.dateOfBirth) return { count: 0 };
        rows.set(args.where.id, args.data.dateOfBirth);
        writes.push(args.where.id);
        return { count: 1 };
      },
    },
  };
  return { prisma: prisma as never, rows, writes };
}

describe('runBackfill with versioned values', () => {
  it('leaves a v2 value completely untouched (no second encryption) and a v1 value too', async () => {
    const v1 = encryptDobString(PLAIN, { current: { version: 1, key: oldKey } });
    const v2 = encryptDobString(PLAIN, rotating);
    const { prisma, rows, writes } = fakePrisma({ a: v1, b: v2 });

    const result = await runBackfill(prisma, rotating);

    expect(result).toEqual({ scanned: 2, changed: 0, unreadable: 0 });
    expect(writes).toEqual([]);
    expect(rows.get('a')).toBe(v1);
    expect(rows.get('b')).toBe(v2);
    expect(decryptDobString(rows.get('b') as string, rotating)).toBe(PLAIN);
  });

  it('encrypts legacy plaintext with the CURRENT key (v2 after a rotation), once', async () => {
    const v2 = encryptDobString('2001-01-01T00:00:00.000Z', rotating);
    const { prisma, rows } = fakePrisma({ a: PLAIN, b: v2, c: null });

    const first = await runBackfill(prisma, rotating);
    expect(first).toMatchObject({ scanned: 2, changed: 1 });
    expect((rows.get('a') as string).startsWith('v2:')).toBe(true);
    expect(decryptDobString(rows.get('a') as string, rotating)).toBe(PLAIN);
    expect(rows.get('b')).toBe(v2);

    const stored = rows.get('a');
    expect(await runBackfill(prisma, rotating)).toMatchObject({ changed: 0 });
    expect(rows.get('a')).toBe(stored); // idempotent
  });

  it('a bare Buffer key still means version 1 (the pre-rotation call shape)', async () => {
    const { prisma, rows } = fakePrisma({ a: PLAIN });
    await runBackfill(prisma, oldKey);
    expect((rows.get('a') as string).startsWith('v1:')).toBe(true);
  });

  describe('rollback', () => {
    it('decrypts the values it can read, across versions, and counts the ones it cannot', async () => {
      const v1 = encryptDobString(PLAIN, { current: { version: 1, key: oldKey } });
      const v2 = encryptDobString(PLAIN, rotating);
      const unknown = encryptDobString(PLAIN, { current: { version: 7, key: randomBytes(32) } });
      const { prisma, rows } = fakePrisma({ a: v1, b: v2, c: unknown, d: PLAIN });

      const result = await runBackfill(prisma, rotating, true);

      expect(result).toEqual({ scanned: 4, changed: 2, unreadable: 1 });
      expect(rows.get('a')).toBe(PLAIN);
      expect(rows.get('b')).toBe(PLAIN);
      expect(rows.get('c')).toBe(unknown); // left encrypted
      expect(rows.get('d')).toBe(PLAIN);
    });

    it('a v1 value with no previous key configured is unreadable: left alone, counted', async () => {
      const v1 = encryptDobString(PLAIN, { current: { version: 1, key: oldKey } });
      const { prisma, rows } = fakePrisma({ a: v1 });
      expect(await runBackfill(prisma, noPrevious, true)).toEqual({ scanned: 1, changed: 0, unreadable: 1 });
      expect(rows.get('a')).toBe(v1);
    });
  });

  it('a value changed by the application between the read and the write is skipped, not overwritten', async () => {
    const { prisma, rows } = fakePrisma({ a: PLAIN });
    const original = (prisma as unknown as { user: { updateMany: (a: never) => Promise<{ count: number }> } }).user.updateMany;
    (prisma as unknown as { user: { updateMany: unknown } }).user.updateMany = async (args: never) => {
      rows.set('a', encryptDobString('2020-02-02T00:00:00.000Z', rotating)); // the app wrote first
      return original(args);
    };
    const result = await runBackfill(prisma, rotating);
    expect(result.changed).toBe(0);
    expect(decryptDobString(rows.get('a') as string, rotating)).toBe('2020-02-02T00:00:00.000Z');
  });
});
