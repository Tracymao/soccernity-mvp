import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaProcessor } from './media-processor';
import { MODERATION_MAX_IMAGE_BYTES, MediaModerationClient } from './media-moderation-client';
import { AUTO_REJECTION_REASON, ModerationLabel, decideModeration, sampleFrameTimes } from './media-moderation-decision.util';
import { POST_MEDIA_DEFAULTS, PostMediaConfig } from './post-media.config';
import { PostMediaService } from './post-media.service';

// backend/w14-post-media-pipeline (B-036; Decision Log #419 item 4). The automatic check, run in the
// background by a sweep (like the other lifecycle sweeps) after an upload is confirmed:
//
//   images  -> Amazon Rekognition DetectModerationLabels (an image over the API's byte limit is
//              downscaled for the CHECK ONLY; the stored file is untouched)
//   videos  -> sampled into frames (interval and maximum count in configuration); every frame is checked
//
// Three outcomes from configuration thresholds (stricter for a minor uploader):
//   every label on every frame below the pass threshold  -> approved   (decisionSource 'auto')
//   a reject category at or above the reject threshold   -> rejected   (decisionSource 'auto', generic reason)
//   anything between                                     -> stays pending, for the moderator queue
//
// NOTHING IS EVER APPROVED BY DEFAULT. If Rekognition is not configured the sweep does not run the
// check at all and the rows stay queued (pending); if a check throws, the row is retried with back-off
// and, after the configured attempts, is left pending ('gave_up') for a moderator. A decision is only
// written if nobody (a moderator) decided first.

export type CheckOutcome = 'approved' | 'rejected' | 'pending' | 'retry' | 'gave_up' | 'skipped';

const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 60 * 60_000;

@Injectable()
export class MediaCheckService {
  private readonly logger = new Logger(MediaCheckService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DirectUploadStorageService,
    private readonly processor: MediaProcessor,
    private readonly moderation: MediaModerationClient,
    private readonly config: PostMediaConfig,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  /**
   * One pass: claims up to a batch of due rows and checks each. Does nothing when the moderation client is
   * not configured (the rows simply wait). Returns the outcomes, for tests and the log line.
   */
  async runDueChecks(now: Date = this.clock.now()): Promise<{ checked: number; outcomes: Record<string, number> }> {
    if (!this.moderation.isConfigured) return { checked: 0, outcomes: {} };

    const due = await this.prisma.postMedia.findMany({
      where: {
        uploadState: 'ready',
        status: 'pending',
        decisionSource: null,
        OR: [
          { checkState: 'queued', checkNextAt: { lte: now } },
          { checkState: 'checking', checkLeaseUntil: { lt: now } },
        ],
      },
      select: { id: true },
      orderBy: { sequence: 'asc' },
      take: this.config.checkBatchSize,
    });

    const outcomes: Record<string, number> = {};
    for (const { id } of due) {
      const outcome = await this.checkOne(id, now);
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    }
    return { checked: due.length, outcomes };
  }

  /** Claims and checks one row. Safe to call concurrently from several workers: only one wins the claim. */
  async checkOne(id: string, now: Date = this.clock.now()): Promise<CheckOutcome> {
    const lease = new Date(now.getTime() + POST_MEDIA_DEFAULTS.checkLeaseSeconds * 1000);
    const claimed = await this.prisma.postMedia.updateMany({
      where: {
        id,
        uploadState: 'ready',
        status: 'pending',
        decisionSource: null,
        OR: [
          { checkState: 'queued', checkNextAt: { lte: now } },
          { checkState: 'checking', checkLeaseUntil: { lt: now } },
        ],
      },
      data: { checkState: 'checking', checkLeaseUntil: lease },
    });
    if (claimed.count === 0) return 'skipped';

    const row = await this.prisma.postMedia.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        publicKey: true,
        durationSeconds: true,
        checkAttempts: true,
        uploader: { select: { isMinor: true } },
      },
    });

    // The post (and so this row) can be deleted between the claim and this read.
    if (!row) return 'skipped';

    try {
      const decision = await this.evaluate(row);
      return await this.apply(id, decision, now);
    } catch (err) {
      return this.recordFailure(id, row.checkAttempts, err, now);
    }
  }

  private async evaluate(row: {
    kind: string;
    publicKey: string | null;
    durationSeconds: number | null;
    uploader: { isMinor: boolean };
  }): Promise<{ outcome: 'approved' | 'rejected' | 'pending'; categories: string[] }> {
    if (!row.publicKey) throw new Error('The stored file is missing');
    const thresholds = this.config.thresholdsFor(row.uploader.isMinor);
    // Ask Rekognition for labels down to the LOWER of the two thresholds, or a label that should have
    // kept the file out of auto-approval would never be returned.
    const minConfidence = Math.min(thresholds.pass, thresholds.reject);

    const dir = await mkdtemp(path.join(tmpdir(), 'media-check-'));
    try {
      const source = path.join(dir, 'source');
      await this.storage.downloadToFile(row.publicKey, source);

      let images: Buffer[];
      if (row.kind === 'image') {
        images = [await readFile(source)];
      } else {
        await this.processor.assertVideoToolsAvailable();
        const sampling = this.config.videoSampling;
        const times = sampleFrameTimes(row.durationSeconds ?? 0, sampling.intervalSeconds, sampling.maxFrames);
        images = await this.processor.extractFrames(source, times);
      }

      const frames: ModerationLabel[][] = [];
      for (const image of images) {
        const forApi = await this.processor.shrinkForModeration(image, MODERATION_MAX_IMAGE_BYTES);
        frames.push(await this.moderation.detectModerationLabels(forApi, minConfidence));
      }
      return decideModeration(frames, thresholds);
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Writes the outcome, but only if no moderator decided while the check ran. */
  private async apply(
    id: string,
    decision: { outcome: 'approved' | 'rejected' | 'pending'; categories: string[] },
    now: Date,
  ): Promise<CheckOutcome> {
    const labels = decision.categories as unknown as Prisma.InputJsonValue;
    const guard = { id, status: 'pending', decisionSource: null } as const;

    if (decision.outcome === 'approved') {
      const r = await this.prisma.postMedia.updateMany({
        where: guard,
        data: {
          status: 'approved',
          decisionSource: 'auto',
          decidedAt: now,
          checkState: 'done',
          checkedAt: now,
          checkLeaseUntil: null,
          checkError: null,
          checkLabels: labels,
        },
      });
      return r.count === 1 ? 'approved' : 'skipped';
    }
    if (decision.outcome === 'rejected') {
      const r = await this.prisma.postMedia.updateMany({
        where: guard,
        data: {
          status: 'rejected',
          decisionSource: 'auto',
          decidedAt: now,
          rejectionReason: AUTO_REJECTION_REASON,
          checkState: 'done',
          checkedAt: now,
          checkLeaseUntil: null,
          checkError: null,
          checkLabels: labels,
        },
      });
      return r.count === 1 ? 'rejected' : 'skipped';
    }
    // Between the thresholds: stays pending and waits for a moderator.
    await this.prisma.postMedia.updateMany({
      where: guard,
      data: { checkState: 'done', checkedAt: now, checkLeaseUntil: null, checkError: null, checkLabels: labels },
    });
    return 'pending';
  }

  private async recordFailure(id: string, attemptsBefore: number, err: unknown, now: Date): Promise<CheckOutcome> {
    const attempts = attemptsBefore + 1;
    // Not `instanceof Error`: an error from another realm (or a vendor SDK) is still an error with a name.
    const name = (err as { name?: unknown } | null)?.name;
    const errorName = typeof name === 'string' && name.length > 0 ? name.slice(0, 80) : 'Error';
    this.logger.warn(`Media check ${id} failed (attempt ${attempts}): ${err instanceof Error ? err.message : String(err)}`);
    if (attempts >= this.config.checkMaxAttempts) {
      await this.prisma.postMedia.updateMany({
        where: { id, status: 'pending', decisionSource: null },
        data: { checkState: 'gave_up', checkAttempts: attempts, checkLeaseUntil: null, checkError: errorName, checkedAt: now },
      });
      return 'gave_up';
    }
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
    await this.prisma.postMedia.updateMany({
      where: { id, status: 'pending', decisionSource: null },
      data: {
        checkState: 'queued',
        checkAttempts: attempts,
        checkNextAt: new Date(now.getTime() + delay),
        checkLeaseUntil: null,
        checkError: errorName,
      },
    });
    return 'retry';
  }
}

// The sweeps. Kept in their own provider so the services above stay free of scheduling concerns (and the
// e2e specs call the services directly with a fake clock, as the other lifecycle sweeps are tested).
@Injectable()
export class PostMediaSweepService {
  private readonly logger = new Logger(PostMediaSweepService.name);

  constructor(
    private readonly checks: MediaCheckService,
    private readonly media: PostMediaService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async runChecks(): Promise<void> {
    try {
      const r = await this.checks.runDueChecks();
      if (r.checked > 0) this.logger.log(`Media check pass: ${JSON.stringify(r.outcomes)}`);
    } catch (err) {
      this.logger.error(`Media check pass failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async purgeQuarantine(): Promise<void> {
    try {
      const r = await this.media.purgeQuarantine();
      if (r.purged > 0) this.logger.log(`Quarantine purge removed ${r.purged} object(s).`);
    } catch (err) {
      this.logger.error(`Quarantine purge failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
