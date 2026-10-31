import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { DobDecryptError, DobKeyInput, decryptDobString, encryptDobString, isEncryptedDob, parseDobKeyRing } from '../crypto/dob-crypto';

// One-time backfill (security/dob-field-encryption).
//   node dist/scripts/backfill-dob-encryption.js            encrypt
//   node dist/scripts/backfill-dob-encryption.js --rollback decrypt back to
//     plaintext ISO strings (documented rollback path; see
//     docs/dob-encryption-rollback.md)
// IDEMPOTENT: encrypt mode only touches values that carry NO "v<digits>:"
// version prefix (legacy plaintext); a value of ANY version is left alone,
// so after a key rotation (v2, v3 ...) the pre-deploy run of this script
// does not encrypt rotated values a second time. New plaintext is encrypted
// with the CURRENT key. Rollback only touches versioned values it can READ
// with the configured key ring; any it cannot (a version this process holds
// no key for) is counted as `unreadable` and left alone, and the command
// line then exits non-zero, because the follow-up ALTER TABLE would fail on
// them anyway. Re-running either mode is a no-op once done. Each row is
// updated with a guard on the value it read, so a concurrent write is
// skipped, not overwritten. Prints counts only -- never a DOB value.
export async function runBackfill(
  prisma: Pick<PrismaClient, 'user'>,
  key: DobKeyInput,
  rollback = false,
): Promise<{ scanned: number; changed: number; unreadable: number }> {
  let scanned = 0;
  let changed = 0;
  let unreadable = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.user.findMany({
      where: { dateOfBirth: { not: null } },
      select: { id: true, dateOfBirth: true },
      orderBy: { id: 'asc' },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      scanned++;
      const value = row.dateOfBirth as string;
      const encrypted = isEncryptedDob(value);
      if (rollback ? !encrypted : encrypted) continue;
      let next: string;
      if (rollback) {
        try {
          next = decryptDobString(value, key);
        } catch (err) {
          if (!(err instanceof DobDecryptError)) throw err;
          unreadable++;
          continue;
        }
      } else {
        next = encryptDobString(value, key);
      }
      const res = await prisma.user.updateMany({
        where: { id: row.id, dateOfBirth: value },
        data: { dateOfBirth: next },
      });
      changed += res.count;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { scanned, changed, unreadable };
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  const key = parseDobKeyRing({
    DOB_ENCRYPTION_KEY: process.env.DOB_ENCRYPTION_KEY,
    DOB_ENCRYPTION_KEY_VERSION: process.env.DOB_ENCRYPTION_KEY_VERSION,
    DOB_ENCRYPTION_KEY_PREVIOUS: process.env.DOB_ENCRYPTION_KEY_PREVIOUS,
  });
  const rollback = process.argv.includes('--rollback');
  const prisma = new PrismaClient();
  try {
    const { scanned, changed, unreadable } = await runBackfill(prisma, key, rollback);
    console.log(
      `DOB ${rollback ? 'rollback' : 'encryption'} backfill: scanned=${scanned} changed=${changed}` +
        (rollback ? ` unreadable=${unreadable}` : ''),
    );
    if (rollback && unreadable > 0) {
      console.error(
        'Some values are at a key version this process has no key for and were left encrypted. ' +
          'Set DOB_ENCRYPTION_KEY_PREVIOUS (or fix the key settings) and run the rollback again.',
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
