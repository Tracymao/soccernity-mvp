import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StorageService } from '../../storage/storage.service';

// backend/w14-post-media-pipeline (B-041; Decision Log #419 item 9). When a post is deleted or an account
// is anonymised, the media rows go with them in the database, and the stored OBJECTS are removed by the
// application. The database commits first; the object deletes are best effort afterwards, so a storage
// outage never blocks a deletion the user asked for. A failed delete leaves an orphaned object whose only
// pointer is gone; it is logged with its key so it can be removed by hand (OPEN: no bucket reconciliation).
//
// backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2): a REJECTED file's private object
// is NOT deleted by any cleanup path, this one included (evidence handling is OPEN under counsel, B-206). Its
// database row goes with the post or the account as before, so what stays in the bucket is an object under
// private-media/<uploaderId>/<mediaId>.<ext> with no row pointing at it; the key identifies the uploader and
// the file. This knowingly leaves #419 item 9 (delete the media of a deleted post or anonymised account)
// unmet for rejected files until counsel decides; it is flagged in README.md and the PR.

type Db = Pick<Prisma.TransactionClient, 'postMedia'>;

export interface MediaObjectRow {
  status: string;
  publishedAt: Date | null;
  publicKey: string | null;
  privateKey: string | null;
  quarantineKey: string | null;
}

/**
 * The storage keys a cleanup path MAY delete for one media row: the public object while it is published, the
 * private object UNLESS the file was rejected, and any leftover quarantined original. A rejected file's
 * private object is never in this list.
 */
export function deletableKeys(row: MediaObjectRow): string[] {
  const keys: string[] = [];
  if (row.publishedAt && row.publicKey) keys.push(row.publicKey);
  if (row.privateKey && row.status !== 'rejected') keys.push(row.privateKey);
  if (row.quarantineKey) keys.push(row.quarantineKey);
  return keys;
}

/** The storage keys of every file attached to a post (read BEFORE the post, and so its rows, is deleted). */
export async function collectPostMediaKeys(db: Db, postId: string): Promise<string[]> {
  const rows = await db.postMedia.findMany({
    where: { postId },
    select: { status: true, publishedAt: true, publicKey: true, privateKey: true, quarantineKey: true },
  });
  return rows.flatMap(deletableKeys);
}

/**
 * Inside the anonymisation transaction: deletes every PostMedia row the user uploaded and removes those
 * files' URLs from the Post.mediaUrls of posts that survive anonymisation (Decision Log #341 keeps the
 * post; #419 item 9 removes its files, so the post must not keep pointing at them). Returns the keys to
 * delete from storage once the transaction has committed.
 */
export async function deleteUserPostMedia(tx: Prisma.TransactionClient, userId: string): Promise<string[]> {
  const rows = await tx.postMedia.findMany({
    where: { uploaderId: userId },
    select: {
      id: true,
      postId: true,
      publicUrl: true,
      status: true,
      publishedAt: true,
      publicKey: true,
      privateKey: true,
      quarantineKey: true,
    },
  });
  for (const r of rows) {
    if (r.postId && r.publicUrl) {
      await tx.$executeRaw`UPDATE "Post" SET "mediaUrls" = array_remove("mediaUrls", ${r.publicUrl}) WHERE "id" = ${r.postId}`;
    }
  }
  if (rows.length > 0) {
    await tx.postMedia.deleteMany({ where: { uploaderId: userId } });
  }
  return rows.flatMap(deletableKeys);
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
