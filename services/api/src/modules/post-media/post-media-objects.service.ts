import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';

// backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2). WHERE a processed media file
// lives, and the moves between the two prefixes. The rule:
//
//     a file is in the PUBLIC prefix (post-media/) only while it is approved and not held by reports;
//     anything awaiting a decision, held, or rejected lives in the PRIVATE prefix (private-media/).
//
// Two moves, with deliberately opposite failure behaviour:
//
//   PUBLISH  private -> public. FAILS CLOSED: copy, verify the copy, and only then (the caller) writes
//            'approved'. If anything fails the item stays pending and nothing is public.
//   WITHDRAW public -> private. Fails SAFE the other way round: the database gate (the post-media
//            visibility fragment) already hides the item the moment its status changes, so a failed move
//            only leaves an object lingering; publishedAt stays set and reconcile() retries it.
//
// A REJECTED file's private object is NEVER deleted by anything in here or in any purge or cleanup job
// (evidence handling is OPEN under counsel, B-206). reconcile() selects only approved rows for deletion.
//
// KNOWN NARROW RACE (documented in README.md): a moderator "keep" landing in the same instant as an
// automatic withdraw of that same item can leave an approved row whose public object was just removed.
// reconcile() heals it from the retained private copy. Every other transition is serialised by the guarded
// updateMany (status in the WHERE) on every write.

export const PRIVATE_PREFIX = 'private-media';
export const PUBLIC_PREFIX = 'post-media';

/** The private key for a media row: same shape as the public key, different prefix. */
export function privateKeyFor(uploaderId: string, id: string, ext: string): string {
  return `${PRIVATE_PREFIX}/${uploaderId}/${id}.${ext}`;
}

export function publicKeyFor(uploaderId: string, id: string, ext: string): string {
  return `${PUBLIC_PREFIX}/${uploaderId}/${id}.${ext}`;
}

interface ObjectRow {
  id: string;
  status: string;
  hiddenPendingReview: boolean;
  contentType: string | null;
  privateKey: string | null;
  publicKey: string | null;
  publishedAt: Date | null;
}

const OBJECT_SELECT = {
  id: true,
  status: true,
  hiddenPendingReview: true,
  contentType: true,
  privateKey: true,
  publicKey: true,
  publishedAt: true,
} as const;

/** True when the item should have an object in the public prefix. */
export function shouldBePublic(row: { status: string; hiddenPendingReview: boolean }): boolean {
  return row.status === 'approved' && !row.hiddenPendingReview;
}

@Injectable()
export class PostMediaObjectsService {
  private readonly logger = new Logger(PostMediaObjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // ---- PUBLISH ------------------------------------------------------------------------------------

  /**
   * Copies the file from the private prefix to the public one and VERIFIES the copy (size matches the
   * private original). Does not touch the database and does not delete the private object: the caller
   * writes 'approved' + publishedAt (guarded) afterwards, then calls finishPublish. Throws on any failure
   * (nothing is left public: a bad copy is deleted), so the caller keeps the item pending.
   * A file that is already published is left alone.
   */
  async copyToPublic(row: Pick<ObjectRow, 'id' | 'contentType' | 'privateKey' | 'publicKey' | 'publishedAt'>): Promise<void> {
    if (row.publishedAt) return;
    if (!row.privateKey || !row.publicKey || !row.contentType) {
      throw new Error(`Media ${row.id} has no private file to publish`);
    }
    const original = await this.storage.head(row.privateKey);
    if (!original) throw new Error(`Media ${row.id}: private file ${row.privateKey} is missing`);
    await this.storage.copyObject(row.privateKey, row.publicKey, row.contentType);
    const copy = await this.storage.head(row.publicKey);
    if (!copy || copy.size !== original.size) {
      await this.deleteQuietly(row.publicKey, `Bad copy of media ${row.id}`);
      throw new Error(`Media ${row.id}: the public copy does not match the original`);
    }
  }

  /**
   * Removes a public copy that was made but never recorded because the approval lost a race. Called only
   * after a guarded 'approved' write found nothing to update, so somebody else's write has already
   * committed: if that write approved the item, the copy IS the live file and is kept.
   */
  async discardUnrecordedCopy(id: string, publicKey: string): Promise<void> {
    const now = await this.prisma.postMedia.findUnique({ where: { id }, select: OBJECT_SELECT });
    if (now && shouldBePublic(now)) return;
    await this.deleteQuietly(publicKey, `Unrecorded public copy of media ${id}`);
  }

  /** After 'approved' + publishedAt are written: the private original is no longer needed. Best effort. */
  async finishPublish(id: string): Promise<void> {
    const row = await this.prisma.postMedia.findUnique({ where: { id }, select: OBJECT_SELECT });
    if (!row || !row.privateKey || !row.publishedAt || !shouldBePublic(row)) return;
    try {
      await this.storage.delete(row.privateKey);
      await this.prisma.postMedia.updateMany({
        where: { id, status: 'approved', hiddenPendingReview: false, publishedAt: { not: null } },
        data: { privateKey: null },
      });
    } catch (err) {
      this.logger.warn(`Private original of ${id} not deleted yet (${msg(err)}); reconcile will retry.`);
    }
  }

  // ---- WITHDRAW -----------------------------------------------------------------------------------

  /**
   * Takes a file back out of the public prefix: makes sure a private copy exists (copy + verify), clears
   * publishedAt, and deletes the public object. A no-op unless the item is published AND should not be
   * (not approved, or held by reports). If the object delete fails the marker is put back so reconcile()
   * retries; meanwhile the database gate already hides the item.
   */
  async withdraw(id: string): Promise<'withdrawn' | 'noop' | 'failed'> {
    const row = await this.prisma.postMedia.findUnique({ where: { id }, select: OBJECT_SELECT });
    if (!row || !row.publishedAt || !row.publicKey || shouldBePublic(row)) return 'noop';

    const contentType = row.contentType ?? 'application/octet-stream';
    let privateKey = row.privateKey;
    try {
      if (!privateKey) {
        const ext = row.publicKey.split('.').pop() ?? 'bin';
        const owner = row.publicKey.split('/')[1];
        privateKey = privateKeyFor(owner, row.id, ext);
        const original = await this.storage.head(row.publicKey);
        if (!original) throw new Error(`public file ${row.publicKey} is missing`);
        await this.storage.copyObject(row.publicKey, privateKey, contentType);
        const copy = await this.storage.head(privateKey);
        if (!copy || copy.size !== original.size) {
          await this.deleteQuietly(privateKey, `Bad private copy of media ${id}`);
          throw new Error('the private copy does not match the public original');
        }
      }
    } catch (err) {
      this.logger.warn(`Withdraw of media ${id} deferred: ${msg(err)}. The item is already hidden; reconcile will retry.`);
      return 'failed';
    }

    // Claim the withdrawal, recording where the file now lives, only while it still should not be public.
    const claimed = await this.prisma.postMedia.updateMany({
      where: { id, publishedAt: { not: null }, OR: [{ status: { not: 'approved' } }, { hiddenPendingReview: true }] },
      data: { privateKey, publishedAt: null },
    });
    if (claimed.count === 0) return 'noop'; // approved again in the meantime: leave the public file alone

    try {
      await this.storage.delete(row.publicKey);
    } catch (err) {
      // Put the marker back so the next reconcile retries; the item is hidden by the database gate meanwhile.
      this.logger.warn(`Public object ${row.publicKey} of media ${id} not removed (${msg(err)}); will retry.`);
      await this.prisma.postMedia.updateMany({ where: { id, publishedAt: null }, data: { publishedAt: this.clock.now() } });
      return 'failed';
    }
    return 'withdrawn';
  }

  // ---- RECONCILE ----------------------------------------------------------------------------------

  /**
   * The safety net, run by the media sweep. Restores the invariant "a public object exists iff the item is
   * approved and not held" after any failed or interrupted move:
   *   1. published but should not be -> withdraw
   *   2. approved, not held, not published, still has a private file -> publish
   *   3. approved, not held, published, private original still there -> delete the private original
   * It NEVER deletes the private object of a rejected, pending or held item.
   */
  async reconcile(): Promise<{ withdrawn: number; published: number; cleaned: number }> {
    let withdrawn = 0;
    let published = 0;
    let cleaned = 0;

    const toWithdraw = await this.prisma.postMedia.findMany({
      where: { publishedAt: { not: null }, OR: [{ status: { not: 'approved' } }, { hiddenPendingReview: true }] },
      select: { id: true },
      take: 100,
      orderBy: { sequence: 'asc' },
    });
    for (const { id } of toWithdraw) {
      if ((await this.withdraw(id)) === 'withdrawn') withdrawn += 1;
    }

    const toPublish = await this.prisma.postMedia.findMany({
      where: { status: 'approved', hiddenPendingReview: false, publishedAt: null, privateKey: { not: null }, uploadState: 'ready' },
      select: OBJECT_SELECT,
      take: 100,
      orderBy: { sequence: 'asc' },
    });
    for (const row of toPublish) {
      try {
        await this.copyToPublic(row);
        const r = await this.prisma.postMedia.updateMany({
          where: { id: row.id, status: 'approved', hiddenPendingReview: false, publishedAt: null },
          data: { publishedAt: this.clock.now() },
        });
        if (r.count === 1) {
          published += 1;
          await this.finishPublish(row.id);
        }
      } catch (err) {
        this.logger.warn(`Reconcile: publish of media ${row.id} failed (${msg(err)}); will retry.`);
      }
    }

    const toClean = await this.prisma.postMedia.findMany({
      where: { status: 'approved', hiddenPendingReview: false, publishedAt: { not: null }, privateKey: { not: null } },
      select: { id: true },
      take: 100,
      orderBy: { sequence: 'asc' },
    });
    for (const { id } of toClean) {
      await this.finishPublish(id);
      cleaned += 1;
    }
    return { withdrawn, published, cleaned };
  }

  private async deleteQuietly(key: string, context: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(`${context}: ${key} not deleted (${msg(err)}).`);
    }
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
