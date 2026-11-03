import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StorageService } from '../../storage/storage.service';
import { evidenceKeysToDeleteNow } from './rejected-media-evidence.util';

// backend/w14-post-media-pipeline (B-041; Decision Log #419 item 9). When a post is deleted or an account
// is anonymised, the media rows go with them in the database, and the stored OBJECTS are removed by the
// application. The database commits first; the object deletes are best effort afterwards, so a storage
// outage never blocks a deletion the user asked for. A failed delete leaves an orphaned object whose only
// pointer is gone; it is logged with its key, and the daily stray sweep (rejected-media-sweep.service.ts)
// deletes it once it is older than the minimum object age.
//
// backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464): a REJECTED file's private object is
// now deleted on every path that removes its row (this file: post deleted, account anonymised; and in
// post-media.service.ts: upload deleted, quarantine purge, unattached purge). This SUPERSEDES the
// backend/media-privacy-vetting-followups rule (#430 item 2) that a rejected file is never deleted. The one
// exception is the protection rule in rejected-media-evidence.util.ts: the uploader under an active hold, or the
// post with a report not yet closed. Then the object is NOT deleted, a PostMediaDeferredDeletion record is
// written in the same transaction as the row delete, and the daily sweep retries it. Statutory-reporting and
// evidence handling beyond that stay OPEN under counsel (B-206).

type Db = Pick<Prisma.TransactionClient, 'postMedia'>;
type EvidenceDb = Pick<Prisma.TransactionClient, 'accountHold' | 'report' | 'postMediaDeferredDeletion'>;

export interface MediaObjectRow {
  status: string;
  publishedAt: Date | null;
  publicKey: string | null;
  privateKey: string | null;
  quarantineKey: string | null;
}

/** A media row with what the protection rule needs to know about it. */
export interface MediaCleanupRow extends MediaObjectRow {
  id: string;
  uploaderId: string;
  postId: string | null;
}

/**
 * The storage keys a cleanup path may delete for one media row WITHOUT the protection check: the public object
 * while it is published, the private object of a file that is NOT rejected, and any leftover quarantined
 * original. A rejected file's private object is deliberately not in this list: it goes through evidenceKeyOf and
 * evidenceKeysToDeleteNow so the hold / open-report rule is applied (a caller that forgets it fails safe: the
 * object is kept and the sweep catches it later).
 */
export function deletableKeys(row: MediaObjectRow): string[] {
  const keys: string[] = [];
  if (row.publishedAt && row.publicKey) keys.push(row.publicKey);
  if (row.privateKey && row.status !== 'rejected') keys.push(row.privateKey);
  if (row.quarantineKey) keys.push(row.quarantineKey);
  return keys;
}

/** The private object of a REJECTED file (the one that needs the protection check), or null. */
export function evidenceKeyOf(row: Pick<MediaObjectRow, 'status' | 'privateKey'>): string | null {
  return row.status === 'rejected' ? row.privateKey : null;
}

/**
 * Every key to delete NOW for these rows: the ordinary keys, plus the private object of each rejected row unless
 * the protection rule holds it back (then a deferral record is written through `db`, so call this inside the
 * transaction that deletes the rows).
 */
export async function keysToDeleteNow(db: EvidenceDb, rows: readonly MediaCleanupRow[], now: Date): Promise<string[]> {
  const keys = rows.flatMap(deletableKeys);
  const evidence = rows.flatMap((r) => {
    const key = evidenceKeyOf(r);
    return key ? [{ mediaId: r.id, uploaderId: r.uploaderId, postId: r.postId, key }] : [];
  });
  return [...keys, ...(await evidenceKeysToDeleteNow(db, evidence, now))];
}

const CLEANUP_SELECT = {
  id: true,
  uploaderId: true,
  postId: true,
  status: true,
  publishedAt: true,
  publicKey: true,
  privateKey: true,
  quarantineKey: true,
} as const;

/** The storage keys of every file attached to a post (read BEFORE the post, and so its rows, is deleted). */
export async function collectPostMediaKeys(db: Db & EvidenceDb, postId: string, now: Date = new Date()): Promise<string[]> {
  const rows = await db.postMedia.findMany({ where: { postId }, select: CLEANUP_SELECT });
  return keysToDeleteNow(db, rows, now);
}

/**
 * Inside the anonymisation transaction: deletes every PostMedia row the user uploaded and removes those
 * files' URLs from the Post.mediaUrls of posts that survive anonymisation (Decision Log #341 keeps the
 * post; #419 item 9 removes its files, so the post must not keep pointing at them). Returns the keys to
 * delete from storage once the transaction has committed.
 */
export async function deleteUserPostMedia(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date(),
): Promise<string[]> {
  const rows = await tx.postMedia.findMany({
    where: { uploaderId: userId },
    select: { ...CLEANUP_SELECT, publicUrl: true },
  });
  for (const r of rows) {
    if (r.postId && r.publicUrl) {
      await tx.$executeRaw`UPDATE "Post" SET "mediaUrls" = array_remove("mediaUrls", ${r.publicUrl}) WHERE "id" = ${r.postId}`;
    }
  }
  if (rows.length > 0) {
    await tx.postMedia.deleteMany({ where: { uploaderId: userId } });
  }
  return keysToDeleteNow(tx, rows, now);
}

/** Best-effort object deletion after a commit. Never throws. */
export async function deleteStoredObjects(
  storage: StorageService | undefined,
  logger: Logger,
  keys: readonly string[],
  context: string,
): Promise<void> {
  if (!storage) return;
  for (const key of keys) {
    try {
      await storage.delete(key);
    } catch (err) {
      logger.warn(`${context}: object ${key} was NOT removed from storage (${err instanceof Error ? err.message : String(err)}).`);
    }
  }
}
