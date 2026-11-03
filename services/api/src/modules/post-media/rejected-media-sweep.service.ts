import { Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService, StorageListNotPermittedError } from '../../storage/direct-upload-storage.service';
import { PostMediaConfig } from './post-media.config';
import { PRIVATE_PREFIX, PUBLIC_PREFIX } from './post-media-objects.service';
import { partitionEvidence, uploadersUnderHold } from './rejected-media-evidence.util';

// backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464). The second half of rejected-file
// deletion. The lifecycle paths (post deleted, upload deleted, purges, account anonymised) delete a rejected
// file's private object when they remove its row (post-media-cleanup.util.ts). This service handles what they
// cannot:
//
//   1. processDeferred  -- a deletion a path SKIPPED because the uploader was under an active hold or the post
//                          had a report not yet closed (a PostMediaDeferredDeletion record). Retried every run;
//                          the object (and the record) go once neither protection applies.
//   2. sweepStrays      -- LIST the media prefixes and delete every object that has NO database row. Catches the
//                          objects a failed best-effort delete left behind, and rejected objects of rows removed
//                          before this rule existed. It deletes:
//                            * nothing younger than POST_MEDIA_STRAY_MIN_AGE_DAYS (7), measured on the object's
//                              own last-modified time -- the ONLY protection a stray has against an open report,
//                              because a stray cannot be tied to a report (the key names only the uploader and
//                              the media id);
//                            * nothing whose uploader is under an active hold (the key names the uploader);
//                            * nothing that has a PostMedia row (rows follow the lifecycle rules above);
//                            * nothing with a deferral record (processDeferred owns it);
//                            * nothing it cannot attribute to an uploader (an unrecognised key shape is counted
//                              and reported, never deleted).
//                          At most POST_MEDIA_STRAY_SWEEP_MAX_DELETES per run (the cap convention of
//                          ANONYMIZED_PURGE_MAX_PER_RUN), and POST_MEDIA_STRAY_SWEEP_DRY_RUN=true only counts.
//   3. deleteUploaderObjects -- called by the account purge (AnonymizedRowPurgeService) right after it deletes a
//                          User row: removes whatever is still under that user's prefixes.
//
// NEEDS A LIST PERMISSION on the storage key (the B-207 launch-gate step). Without it sweepStrays and
// deleteUploaderObjects log ONE clear error and do nothing; nothing crashes and processDeferred still works.
// Logs carry counts and media ids, never an uploader id, a key or any content.

// The three prefixes the media pipeline writes (quarantine = QUARANTINE_PREFIX in post-media.service.ts, repeated
// here as a literal so this file does not import that service). Avatars, covers and admin media are NOT scanned.
export const STRAY_SCAN_PREFIXES = [`${PRIVATE_PREFIX}/`, `${PUBLIC_PREFIX}/`, 'quarantine/'] as const;

export type ListOutcome = 'ok' | 'list_not_permitted' | 'storage_unavailable' | 'failed' | 'no_storage';

export interface ProcessDeferredResult {
  deleted: number;
  stillProtected: number;
  failed: number;
  capped: boolean;
}

export interface StraySweepResult {
  outcome: ListOutcome;
  scanned: number;
  deleted: number;
  /** Dry run: how many it WOULD have deleted (deleted is then 0). */
  wouldDelete: number;
  skippedTooYoung: number;
  skippedHasRow: number;
  skippedDeferred: number;
  skippedUploaderHeld: number;
  /** Keys whose shape does not name an uploader and a media id: never deleted. */
  unrecognised: number;
  failed: number;
  capped: boolean;
  dryRun: boolean;
}

export interface UploaderObjectsResult {
  outcome: ListOutcome;
  deleted: number;
  failed: number;
}

interface ParsedKey {
  uploaderId: string;
  mediaId: string;
}

/** `<prefix>/<uploaderId>/<mediaId>[.ext]` -> its uploader and media id, or null for any other shape. */
export function parseMediaKey(key: string): ParsedKey | null {
  const parts = key.split('/');
  if (parts.length !== 3) return null;
  const [, uploaderId, file] = parts;
  if (!uploaderId || !file) return null;
  const dot = file.indexOf('.');
  const mediaId = dot === -1 ? file : file.slice(0, dot);
  if (!mediaId) return null;
  return { uploaderId, mediaId };
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

@Injectable()
export class RejectedMediaSweepService {
  private readonly logger = new Logger(RejectedMediaSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PostMediaConfig,
    // Optional so the cron still loads where no object store is wired; it then reports 'no_storage'.
    @Optional() private readonly storage?: DirectUploadStorageService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // 04:00 daily: after the 03:00 account sweep and 03:30 purge, so the objects those left behind are found the
  // same night. 6-field cron (seconds first), the format @nestjs/schedule uses.
  @Cron('0 0 4 * * *')
  async runDaily(): Promise<void> {
    try {
      const d = await this.processDeferred(this.clock.now());
      if (d.deleted + d.stillProtected + d.failed > 0) {
        this.logger.log(`Deferred media deletions: deleted=${d.deleted} stillProtected=${d.stillProtected} failed=${d.failed} capped=${d.capped}`);
      }
    } catch (err) {
      this.logger.error(`Deferred media deletions failed: ${msg(err)}`);
    }
    try {
      const r = await this.sweepStrays(this.clock.now());
      this.logger.log(
        `Stray media sweep: outcome=${r.outcome} dryRun=${r.dryRun} scanned=${r.scanned} deleted=${r.deleted} wouldDelete=${r.wouldDelete} ` +
          `tooYoung=${r.skippedTooYoung} hasRow=${r.skippedHasRow} deferred=${r.skippedDeferred} uploaderHeld=${r.skippedUploaderHeld} ` +
          `unrecognised=${r.unrecognised} failed=${r.failed} capped=${r.capped}`,
      );
    } catch (err) {
      this.logger.error(`Stray media sweep failed: ${msg(err)}`);
    }
  }

  // ---- 1. deferred deletions ----------------------------------------------------------------------------

  async processDeferred(now: Date = this.clock.now()): Promise<ProcessDeferredResult> {
    const result: ProcessDeferredResult = { deleted: 0, stillProtected: 0, failed: 0, capped: false };
    if (!this.storage) return result;
    const cap = this.config.straySweepMaxDeletes;
    const due = await this.prisma.postMediaDeferredDeletion.findMany({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: cap + 1,
    });
    result.capped = due.length > cap;
    const batch = due.slice(0, cap);
    const { free, protectedItems } = await partitionEvidence(
      this.prisma,
      batch.map((d) => ({ mediaId: d.mediaId, uploaderId: d.uploaderId, postId: d.postId, key: d.objectKey })),
      now,
    );
    result.stillProtected = protectedItems.length;
    const freeKeys = new Set(free.map((i) => i.key));
    for (const d of batch) {
      if (!freeKeys.has(d.objectKey)) continue;
      try {
        await this.storage.delete(d.objectKey); // deleting a missing object is a success
        await this.prisma.postMediaDeferredDeletion.deleteMany({ where: { id: d.id } });
        result.deleted += 1;
      } catch (err) {
        result.failed += 1;
        this.logger.warn(`Deferred deletion of media ${d.mediaId} failed (${msg(err)}); it stays recorded and is retried.`);
      }
    }
    return result;
  }

  // ---- 2. stray sweep -----------------------------------------------------------------------------------

  async sweepStrays(now: Date = this.clock.now()): Promise<StraySweepResult> {
    const dryRun = this.config.straySweepDryRun;
    const result: StraySweepResult = {
      outcome: 'ok',
      scanned: 0,
      deleted: 0,
      wouldDelete: 0,
      skippedTooYoung: 0,
      skippedHasRow: 0,
      skippedDeferred: 0,
      skippedUploaderHeld: 0,
      unrecognised: 0,
      failed: 0,
      capped: false,
      dryRun,
    };
    if (!this.storage) {
      result.outcome = 'no_storage';
      return result;
    }
    const cap = this.config.straySweepMaxDeletes;
    const cutoff = new Date(now.getTime() - this.config.strayMinAgeDays * 24 * 3600 * 1000);
    const heldCache = new Map<string, boolean>();

    try {
      for (const prefix of STRAY_SCAN_PREFIXES) {
        let token: string | null = null;
        do {
          const page: Awaited<ReturnType<DirectUploadStorageService['listObjects']>> = await this.storage.listObjects(prefix, {
            continuationToken: token,
          });
          token = page.nextToken;
          result.scanned += page.objects.length;

          // Age first (cheap, no database): the minimum age is every stray's baseline protection.
          const old = page.objects.filter((o) => {
            const young = !o.lastModified || o.lastModified.getTime() > cutoff.getTime();
            if (young) result.skippedTooYoung += 1;
            return !young;
          });
          const parsed: { key: string; ref: ParsedKey }[] = [];
          for (const o of old) {
            const ref = parseMediaKey(o.key);
            if (!ref) result.unrecognised += 1;
            else parsed.push({ key: o.key, ref });
          }
          if (parsed.length === 0) continue;

          const hasRow = new Set(
            (
              await this.prisma.postMedia.findMany({
                where: { id: { in: [...new Set(parsed.map((p) => p.ref.mediaId))] } },
                select: { id: true },
              })
            ).map((r) => r.id),
          );
          const deferred = new Set(
            (
              await this.prisma.postMediaDeferredDeletion.findMany({
                where: { objectKey: { in: parsed.map((p) => p.key) } },
                select: { objectKey: true },
              })
            ).map((d) => d.objectKey),
          );
          const unseen = [...new Set(parsed.map((p) => p.ref.uploaderId))].filter((u) => !heldCache.has(u));
          for (const u of unseen) heldCache.set(u, (await uploadersUnderHold(this.prisma, [u], now)).has(u));

          for (const p of parsed) {
            if (hasRow.has(p.ref.mediaId)) {
              result.skippedHasRow += 1;
              continue;
            }
            if (deferred.has(p.key)) {
              result.skippedDeferred += 1;
              continue;
            }
            if (heldCache.get(p.ref.uploaderId)) {
              result.skippedUploaderHeld += 1;
              continue;
            }
            if (result.deleted + result.wouldDelete >= cap) {
              result.capped = true;
              return result;
            }
            if (dryRun) {
              result.wouldDelete += 1;
              continue;
            }
            try {
              await this.storage.delete(p.key);
              result.deleted += 1;
            } catch (err) {
              result.failed += 1;
              this.logger.warn(`Stray media sweep: media ${p.ref.mediaId} not deleted (${msg(err)}); it is retried next run.`);
            }
          }
        } while (token);
      }
    } catch (err) {
      result.outcome = this.listFailureOutcome(err);
    }
    return result;
  }

  // ---- 3. the account purge's cleanup -------------------------------------------------------------------

  /**
   * Removes whatever is still stored under a PURGED user's prefixes (the User row is gone, so no hold and no age
   * limit apply). Skips an object that has a PostMedia row or a deferral record. Never throws.
   */
  async deleteUploaderObjects(userId: string): Promise<UploaderObjectsResult> {
    const result: UploaderObjectsResult = { outcome: 'ok', deleted: 0, failed: 0 };
    if (!this.storage) {
      result.outcome = 'no_storage';
      return result;
    }
    try {
      for (const base of STRAY_SCAN_PREFIXES) {
        let token: string | null = null;
        do {
          const page: Awaited<ReturnType<DirectUploadStorageService['listObjects']>> = await this.storage.listObjects(
            `${base}${userId}/`,
            { continuationToken: token },
          );
          token = page.nextToken;
          if (page.objects.length === 0) continue;
          const keys = page.objects.map((o) => o.key);
          const rows = new Set(
            (
              await this.prisma.postMedia.findMany({
                where: { id: { in: keys.flatMap((k) => (parseMediaKey(k) ? [parseMediaKey(k)!.mediaId] : [])) } },
                select: { id: true },
              })
            ).map((r) => r.id),
          );
          const deferred = new Set(
            (await this.prisma.postMediaDeferredDeletion.findMany({ where: { objectKey: { in: keys } }, select: { objectKey: true } })).map(
              (d) => d.objectKey,
            ),
          );
          for (const key of keys) {
            const ref = parseMediaKey(key);
            if (!ref || rows.has(ref.mediaId) || deferred.has(key)) continue;
            try {
              await this.storage.delete(key);
              result.deleted += 1;
            } catch (err) {
              result.failed += 1;
              this.logger.warn(`Purged-account media cleanup: media ${ref.mediaId} not deleted (${msg(err)}); the daily sweep retries it.`);
            }
          }
        } while (token);
      }
    } catch (err) {
      result.outcome = this.listFailureOutcome(err);
    }
    return result;
  }

  // One place that turns a failed list into an outcome and a plain log line. A missing list permission is the
  // expected launch-gate gap (B-207), so it is an error with the fix named, not a stack trace.
  private listFailureOutcome(err: unknown): ListOutcome {
    if (err instanceof StorageListNotPermittedError) {
      this.logger.error(
        'Stray media sweep cannot run: the storage key is not allowed to LIST objects. Give the R2/S3 key a list permission (B-207, launch gate). Nothing was deleted.',
      );
      return 'list_not_permitted';
    }
    if (err instanceof ServiceUnavailableException) {
      this.logger.warn('Stray media sweep skipped: no object store is configured.');
      return 'storage_unavailable';
    }
    this.logger.error(`Stray media sweep stopped by a storage error (${msg(err)}); it is retried next run.`);
    return 'failed';
  }
}
