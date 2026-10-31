import * as dotenv from 'dotenv';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  DobDecryptError,
  DobKeyRing,
  dobCiphertextVersion,
  decryptDobString,
  encryptDobString,
  parseDobKeyRing,
} from '../crypto/dob-crypto';

// Key rotation for DOB_ENCRYPTION_KEY (docs/dob-encryption-rollback.md has the full procedure).
//   node dist/scripts/rotate-dob-encryption-key.js --dry-run   count values per column per key version, write nothing
//   node dist/scripts/rotate-dob-encryption-key.js             re-encrypt everything not yet at the current version
//
// The key protects THREE columns and they are rotated TOGETHER, in one run, because rotating only some would leave
// the others unreadable once the previous key is removed:
//   User.dateOfBirth, User.totpSecretEncrypted, AdminUser.totpSecretEncrypted
//
// Needs the ring to be configured the way a rotation deploy leaves it: DOB_ENCRYPTION_KEY = the NEW key,
// DOB_ENCRYPTION_KEY_VERSION = N, DOB_ENCRYPTION_KEY_PREVIOUS = the OLD key (version N-1).
//
// Safety properties:
//  - PREFLIGHT before any write. Every value is classified, and a trial decryption is done for each. If ANY value is
//    unreadable (a version with no key, a wrong "previous" key, a value with no version prefix, a damaged value) the
//    run stops with ZERO writes and a non-zero exit. The decision to start is all-or-nothing.
//  - Resumable and idempotent: a value already at the current version is skipped, so a run that died half way is
//    simply run again. Batched by id, 500 at a time.
//  - Each row is written with a guard on the value it read (`WHERE id = ? AND column = <value read>`), so a value
//    changed in the meantime by the application is SKIPPED, never overwritten with stale data.
//  - Ends with a VERIFICATION pass over every column, which also decrypts every value: it exits non-zero if any value
//    is still at an older version or cannot be read.
//  - Prints COUNTS ONLY -- never a date of birth, a secret, a ciphertext or a key. For unexpected (non-crypto) errors
//    only the error class and code are printed, never the message, because a database error message can echo the
//    query's values.
//  - Exit code: 0 only when (dry run: nothing blocks a rotation) / (real run: every value is at the current version
//    and readable).
//
// There is no automatic undo. A rollback is another rotation.

export interface RotationRow {
  id: string;
  value: string;
}

// One encrypted column, as the script sees it. Prisma is behind this seam so the logic is testable without a database.
export interface RotationColumn {
  label: string;
  // Rows with a non-null value and id strictly after `afterId`, ascending by id.
  fetch(afterId: string | undefined, take: number): Promise<RotationRow[]>;
  // Guarded write. Returns the number of rows changed: 1, or 0 if the value was no longer `expected`.
  replace(id: string, expected: string, next: string): Promise<number>;
}

export interface ColumnReport {
  label: string;
  scanned: number;
  // Readable values per key version, e.g. { 1: 12, 2: 3 }.
  byVersion: Record<number, number>;
  // No "v<digits>:" prefix at all (plaintext or garbage). Never touched.
  unrecognised: number;
  // A key version this process holds no key for. Never touched.
  noKey: number;
  // A held version whose value does not decrypt (wrong key for that version, or a damaged value). Never touched.
  undecryptable: number;
}

export interface RotationReport {
  mode: 'dry-run' | 'rotate';
  currentVersion: number;
  previousVersion: number | null;
  // Counts found before any write.
  before: ColumnReport[];
  // Values re-encrypted, and values skipped because the application changed them while the script ran.
  rewritten: number;
  skippedConcurrent: number;
  // Counts after the run (only for a real run that got as far as writing).
  after: ColumnReport[] | null;
  // True when preflight found something that blocks a rotation: nothing was written.
  blocked: boolean;
  // True when the end state is good (dry run: nothing blocks; real run: all current and readable).
  ok: boolean;
}

export interface RotateOptions {
  dryRun?: boolean;
  batchSize?: number;
}

type Classified =
  | { kind: 'ok'; version: number; plaintext: string }
  | { kind: 'unrecognised' }
  | { kind: 'noKey'; version: number }
  | { kind: 'undecryptable'; version: number };

function classify(value: string, ring: DobKeyRing): Classified {
  const version = dobCiphertextVersion(value);
  if (version === null) return { kind: 'unrecognised' };
  const held = version === ring.current.version || (ring.previous !== undefined && version === ring.previous.version);
  if (!held) return { kind: 'noKey', version };
  try {
    return { kind: 'ok', version, plaintext: decryptDobString(value, ring) };
  } catch (err) {
    if (!(err instanceof DobDecryptError)) throw err;
    return { kind: 'undecryptable', version };
  }
}

function emptyReport(label: string): ColumnReport {
  return { label, scanned: 0, byVersion: {}, unrecognised: 0, noKey: 0, undecryptable: 0 };
}

function count(report: ColumnReport, c: Classified): void {
  report.scanned++;
  if (c.kind === 'ok') report.byVersion[c.version] = (report.byVersion[c.version] ?? 0) + 1;
  else report[c.kind]++;
}

function problems(report: ColumnReport): number {
  return report.unrecognised + report.noKey + report.undecryptable;
}

// Read-only pass over one column.
async function scanColumn(column: RotationColumn, ring: DobKeyRing, batchSize: number): Promise<ColumnReport> {
  const report = emptyReport(column.label);
  let after: string | undefined;
  for (;;) {
    const rows = await column.fetch(after, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) count(report, classify(row.value, ring));
    after = rows[rows.length - 1].id;
  }
  return report;
}

// Re-encrypt one column's values that are at the previous version. Returns [rewritten, skippedConcurrent].
async function rewriteColumn(column: RotationColumn, ring: DobKeyRing, batchSize: number): Promise<[number, number]> {
  let rewritten = 0;
  let skipped = 0;
  let after: string | undefined;
  for (;;) {
    const rows = await column.fetch(after, batchSize);
    if (rows.length === 0) break;
    for (const row of rows) {
      const c = classify(row.value, ring);
      // Only a readable value at the previous version needs work. Anything else (already current, or a problem that
      // appeared since preflight) is left alone; the verification pass reports the latter.
      if (c.kind !== 'ok' || c.version === ring.current.version) continue;
      const next = encryptDobString(c.plaintext, ring);
      const changed = await column.replace(row.id, row.value, next);
      if (changed > 0) rewritten += changed;
      else skipped++;
    }
    after = rows[rows.length - 1].id;
  }
  return [rewritten, skipped];
}

function atCurrentAndReadable(report: ColumnReport, ring: DobKeyRing): boolean {
  if (problems(report) > 0) return false;
  return Object.entries(report.byVersion).every(([v, n]) => Number(v) === ring.current.version || n === 0);
}

export async function rotateDobKey(
  columns: RotationColumn[],
  ring: DobKeyRing,
  options: RotateOptions = {},
): Promise<RotationReport> {
  const batchSize = options.batchSize ?? 500;
  const dryRun = options.dryRun === true;
  const report: RotationReport = {
    mode: dryRun ? 'dry-run' : 'rotate',
    currentVersion: ring.current.version,
    previousVersion: ring.previous?.version ?? null,
    before: [],
    rewritten: 0,
    skippedConcurrent: 0,
    after: null,
    blocked: false,
    ok: false,
  };

  // 1. Preflight: classify and trial-decrypt everything, write nothing.
  for (const column of columns) report.before.push(await scanColumn(column, ring, batchSize));
  report.blocked = report.before.some((r) => problems(r) > 0);
  if (report.blocked) return report;
  if (dryRun) {
    report.ok = true;
    return report;
  }

  // 2. Rewrite.
  for (const column of columns) {
    const [rewritten, skipped] = await rewriteColumn(column, ring, batchSize);
    report.rewritten += rewritten;
    report.skippedConcurrent += skipped;
  }

  // 3. Verify: re-read everything, decrypting it all.
  report.after = [];
  for (const column of columns) report.after.push(await scanColumn(column, ring, batchSize));
  report.ok = report.after.every((r) => atCurrentAndReadable(r, ring));
  return report;
}

// ---------------------------------------------------------------------------------------------------------------
// The three real columns.
// ---------------------------------------------------------------------------------------------------------------

export function prismaRotationColumns(prisma: PrismaClient): RotationColumn[] {
  return [
    {
      label: 'User.dateOfBirth',
      async fetch(afterId, take) {
        const rows = await prisma.user.findMany({
          where: { dateOfBirth: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
          select: { id: true, dateOfBirth: true },
          orderBy: { id: 'asc' },
          take,
        });
        return rows.map((r) => ({ id: r.id, value: r.dateOfBirth as string }));
      },
      async replace(id, expected, next) {
        return (await prisma.user.updateMany({ where: { id, dateOfBirth: expected }, data: { dateOfBirth: next } })).count;
      },
    },
    {
      label: 'User.totpSecretEncrypted',
      async fetch(afterId, take) {
        const rows = await prisma.user.findMany({
          where: { totpSecretEncrypted: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
          select: { id: true, totpSecretEncrypted: true },
          orderBy: { id: 'asc' },
          take,
        });
        return rows.map((r) => ({ id: r.id, value: r.totpSecretEncrypted as string }));
      },
      async replace(id, expected, next) {
        return (
          await prisma.user.updateMany({ where: { id, totpSecretEncrypted: expected }, data: { totpSecretEncrypted: next } })
        ).count;
      },
    },
    {
      label: 'AdminUser.totpSecretEncrypted',
      async fetch(afterId, take) {
        const rows = await prisma.adminUser.findMany({
          where: { totpSecretEncrypted: { not: null }, ...(afterId ? { id: { gt: afterId } } : {}) },
          select: { id: true, totpSecretEncrypted: true },
          orderBy: { id: 'asc' },
          take,
        });
        return rows.map((r) => ({ id: r.id, value: r.totpSecretEncrypted as string }));
      },
      async replace(id, expected, next) {
        return (
          await prisma.adminUser.updateMany({ where: { id, totpSecretEncrypted: expected }, data: { totpSecretEncrypted: next } })
        ).count;
      },
    },
  ];
}

// ---------------------------------------------------------------------------------------------------------------
// Command line.
// ---------------------------------------------------------------------------------------------------------------

function versionList(byVersion: Record<number, number>): string {
  const entries = Object.entries(byVersion).sort(([a], [b]) => Number(a) - Number(b));
  return entries.length === 0 ? 'none' : entries.map(([v, n]) => `v${v}=${n}`).join(' ');
}

function describe(report: ColumnReport): string {
  return (
    `  ${report.label}: scanned=${report.scanned} ${versionList(report.byVersion)}` +
    ` unrecognised=${report.unrecognised} no-key-for-version=${report.noKey} cannot-decrypt=${report.undecryptable}`
  );
}

export function formatReport(report: RotationReport): string[] {
  const lines = [
    `DOB key rotation (${report.mode}): current key version ${report.currentVersion}` +
      (report.previousVersion === null ? ', no previous key' : `, previous key version ${report.previousVersion}`),
    'Before:',
    ...report.before.map(describe),
  ];
  if (report.blocked) {
    lines.push(
      'BLOCKED: some values are not readable with the configured keys (unrecognised, a version with no key, or a ' +
        'key that does not decrypt them). Nothing was written. Fix DOB_ENCRYPTION_KEY / DOB_ENCRYPTION_KEY_VERSION / ' +
        'DOB_ENCRYPTION_KEY_PREVIOUS and run again.',
    );
    return lines;
  }
  if (report.mode === 'dry-run') {
    const todo = report.before.reduce(
      (sum, r) => sum + (report.previousVersion === null ? 0 : (r.byVersion[report.previousVersion] ?? 0)),
      0,
    );
    lines.push(`Dry run: ${todo} value(s) would be re-encrypted. Nothing was written.`);
    return lines;
  }
  lines.push(`Re-encrypted: ${report.rewritten}. Skipped (changed by the application meanwhile): ${report.skippedConcurrent}.`);
  lines.push('After (verification, every value decrypted):', ...(report.after ?? []).map(describe));
  lines.push(
    report.ok
      ? 'OK: every value is at the current key version and readable.'
      : 'NOT DONE: some values are still at an older version or unreadable. Run the script again, then check the counts.',
  );
  return lines;
}

async function main() {
  dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
  const ring = parseDobKeyRing({
    DOB_ENCRYPTION_KEY: process.env.DOB_ENCRYPTION_KEY,
    DOB_ENCRYPTION_KEY_VERSION: process.env.DOB_ENCRYPTION_KEY_VERSION,
    DOB_ENCRYPTION_KEY_PREVIOUS: process.env.DOB_ENCRYPTION_KEY_PREVIOUS,
  });
  const dryRun = process.argv.includes('--dry-run');
  const prisma = new PrismaClient();
  try {
    const report = await rotateDobKey(prismaRotationColumns(prisma), ring, { dryRun });
    for (const line of formatReport(report)) console.log(line);
    if (!report.ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    // Never err.message for an unexpected error: a database error can echo values. Key-configuration errors are ours
    // and safe (they carry lengths and variable names only).
    const known = err instanceof Error && (err instanceof DobDecryptError || /^DOB_ENCRYPTION_KEY/.test(err.message));
    if (known) console.error((err as Error).message);
    else {
      const e = err as { name?: string; code?: string };
      console.error(`Unexpected error (${e?.name ?? 'Error'}${e?.code ? ` ${e.code}` : ''}); details withheld. Re-run; nothing is lost.`);
    }
    process.exit(1);
  });
}
