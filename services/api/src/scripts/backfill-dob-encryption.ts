import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { decryptDobString, encryptDobString, isEncryptedDob, parseDobKey } from '../crypto/dob-crypto';

// One-time backfill (security/dob-field-encryption).
//   node dist/scripts/backfill-dob-encryption.js            encrypt
//   node dist/scripts/backfill-dob-encryption.js --rollback decrypt back to
//     plaintext ISO strings (documented rollback path; see
//     docs/dob-encryption-rollback.md)
// IDEMPOTENT: encrypt mode only touches values NOT starting with "v1:";
// rollback only touches values that DO. Re-running either is a no-op once
// done. Each row is updated with a guard on the value it read, so a
// concurrent write is skipped, not overwritten. Prints counts only --
// never a DOB value.
export async function runBackfill(
  prisma: Pick<PrismaClient, 'user'>,
  key: Buffer,
  rollback = false,
): Promise<{ scanned: number; changed: number }> {
  let scanned = 0;
  let changed = 0;
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
      const next = rollback ? decryptDobString(value, key) : encryptDobString(value, key);
      const res = await prisma.user.updateMany({
        where: { id: row.id, dateOfBirth: value },
        data: { dateOfBirth: next },
      });
      changed += res.count;
    }
    cursor = rows[rows.length - 1].id;
  }
  return { scanned, changed };
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  const key = parseDobKey(process.env.DOB_ENCRYPTION_KEY);
  const rollback = process.argv.includes('--rollback');
  const prisma = new PrismaClient();
  try {
    const { scanned, changed } = await runBackfill(prisma, key, rollback);
    console.log(`DOB ${rollback ? 'rollback' : 'encryption'} backfill: scanned=${scanned} changed=${changed}`);
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
