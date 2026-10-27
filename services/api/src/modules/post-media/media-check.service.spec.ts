import { ConfigService } from '@nestjs/config';
import { writeFile } from 'fs/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaModerationClient } from './media-moderation-client';
import { MediaProcessor } from './media-processor';
import { MediaCheckService, PostMediaSweepService } from './media-check.service';
import { PostMediaConfig } from './post-media.config';
import { PostMediaService } from './post-media.service';

const NOW = new Date('2026-11-05T10:00:00Z');

function build(opts: { configured?: boolean; env?: Record<string, string> } = {}) {
  const prisma = {
    postMedia: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage = { downloadToFile: jest.fn(async (_key: string, dest: string) => writeFile(dest, Buffer.from('image-bytes'))) };
  const processor = {
    assertVideoToolsAvailable: jest.fn().mockResolvedValue(undefined),
    extractFrames: jest.fn().mockResolvedValue([Buffer.from('f1'), Buffer.from('f2')]),
    shrinkForModeration: jest.fn(async (b: Buffer) => b),
  };
  const moderation = {
    isConfigured: opts.configured ?? true,
    detectModerationLabels: jest.fn().mockResolvedValue([]),
  };
  const service = new MediaCheckService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    processor as unknown as MediaProcessor,
    moderation as unknown as MediaModerationClient,
    new PostMediaConfig(new ConfigService(opts.env ?? {})),
    { now: () => NOW },
  );
  return { service, prisma, storage, processor, moderation };
}

const imageRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  kind: 'image',
  publicKey: 'post-media/u1/m1.jpg',
  durationSeconds: null,
  checkAttempts: 0,
  uploader: { isMinor: false },
  ...over,
});

describe('MediaCheckService.runDueChecks', () => {
  it('does nothing at all when Rekognition is not configured: no query, no download, no decision', async () => {
    const { service, prisma, storage, moderation } = build({ configured: false });
    expect(await service.runDueChecks(NOW)).toEqual({ checked: 0, outcomes: {} });
    expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
    expect(storage.downloadToFile).not.toHaveBeenCalled();
    expect(moderation.detectModerationLabels).not.toHaveBeenCalled();
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
  });

  it('selects only ready, still-pending, undecided rows that are due (queued and due, or a checking row whose lease expired), oldest first, one batch', async () => {
    const { service, prisma } = build({ env: { MEDIA_CHECK_BATCH_SIZE: '3' } });
    await service.runDueChecks(NOW);
    expect(prisma.postMedia.findMany).toHaveBeenCalledWith({
      where: {
        uploadState: 'ready',
        status: 'pending',
        decisionSource: null,
        OR: [
          { checkState: 'queued', checkNextAt: { lte: NOW } },
          { checkState: 'checking', checkLeaseUntil: { lt: NOW } },
        ],
      },
      select: { id: true },
      orderBy: { sequence: 'asc' },
      take: 3,
    });
  });
});

describe('MediaCheckService.checkOne', () => {
  it('loses the claim race quietly: another worker has it, so nothing is downloaded or sent', async () => {
    const { service, prisma, storage, moderation } = build();
    prisma.postMedia.updateMany.mockResolvedValue({ count: 0 });
    expect(await service.checkOne('m1', NOW)).toBe('skipped');
    expect(storage.downloadToFile).not.toHaveBeenCalled();
    expect(moderation.detectModerationLabels).not.toHaveBeenCalled();
  });

  it('claims with a lease, and a deleted row is skipped', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findUnique.mockResolvedValue(null);
    expect(await service.checkOne('m1', NOW)).toBe('skipped');
    expect(prisma.postMedia.updateMany.mock.calls[0][0].data).toEqual({
      checkState: 'checking',
      checkLeaseUntil: new Date(NOW.getTime() + 600_000),
    });
  });

  it('uses the ADULT thresholds for an adult and the stricter MINOR ones for a minor, and asks Rekognition from the lower of the two', async () => {
    const adult = build();
    adult.prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    await adult.service.checkOne('m1', NOW);
    expect(adult.moderation.detectModerationLabels).toHaveBeenCalledWith(expect.any(Buffer), 40);

    const minor = build();
    minor.prisma.postMedia.findUnique.mockResolvedValue(imageRow({ uploader: { isMinor: true } }));
    await minor.service.checkOne('m1', NOW);
    expect(minor.moderation.detectModerationLabels).toHaveBeenCalledWith(expect.any(Buffer), 20);
  });

  it('a decision is written only if the row is still pending and undecided (the guard), approved only when every frame is clean', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    expect(await service.checkOne('m1', NOW)).toBe('approved');
    const write = prisma.postMedia.updateMany.mock.calls[1][0];
    expect(write.where).toEqual({ id: 'm1', status: 'pending', decisionSource: null });
    expect(write.data).toMatchObject({ status: 'approved', decisionSource: 'auto', decidedAt: NOW, checkState: 'done', checkLabels: [] });
  });

  it('a moderator who decided first wins: the guarded write matches nothing and the outcome is "skipped"', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    prisma.postMedia.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await service.checkOne('m1', NOW)).toBe('skipped');
  });

  it('a video is sampled at the configured interval and every frame goes to Rekognition', async () => {
    const { service, prisma, processor, moderation } = build({ env: { MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS: '10', MEDIA_CHECK_VIDEO_MAX_FRAMES: '30' } });
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ kind: 'video', durationSeconds: 25, publicKey: 'post-media/u1/m1.mp4' }));
    await service.checkOne('m1', NOW);
    expect(processor.extractFrames).toHaveBeenCalledWith(expect.any(String), [4.167, 12.5, 20.833]);
    expect(moderation.detectModerationLabels).toHaveBeenCalledTimes(2); // the fake returns 2 frames
  });

  it('a failure schedules a retry with doubling back-off and records only the error NAME', async () => {
    const { service, prisma, moderation } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ checkAttempts: 2 }));
    moderation.detectModerationLabels.mockRejectedValue(new TypeError('secret detail'));
    expect(await service.checkOne('m1', NOW)).toBe('retry');
    const write = prisma.postMedia.updateMany.mock.calls[1][0];
    expect(write.data).toEqual({
      checkState: 'queued',
      checkAttempts: 3,
      checkNextAt: new Date(NOW.getTime() + 240_000),
      checkLeaseUntil: null,
      checkError: 'TypeError',
    });
    expect(JSON.stringify(write.data)).not.toContain('secret detail');
  });

  it('the back-off is capped at an hour', async () => {
    const { service, prisma, moderation } = build({ env: { MEDIA_CHECK_MAX_ATTEMPTS: '20' } });
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ checkAttempts: 12 }));
    moderation.detectModerationLabels.mockRejectedValue(new Error('x'));
    await service.checkOne('m1', NOW);
    expect(prisma.postMedia.updateMany.mock.calls[1][0].data.checkNextAt).toEqual(new Date(NOW.getTime() + 3_600_000));
  });

  it('after the last attempt it is left pending as "gave_up" -- never approved', async () => {
    const { service, prisma, moderation } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ checkAttempts: 4 }));
    moderation.detectModerationLabels.mockRejectedValue(new Error('x'));
    expect(await service.checkOne('m1', NOW)).toBe('gave_up');
    const data = prisma.postMedia.updateMany.mock.calls[1][0].data;
    expect(data).toMatchObject({ checkState: 'gave_up', checkAttempts: 5 });
    expect(data.status).toBeUndefined();
    expect(data.decisionSource).toBeUndefined();
  });

  it('a missing stored file is a failure (retried), never an approval', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ publicKey: null }));
    expect(await service.checkOne('m1', NOW)).toBe('retry');
  });
});

describe('PostMediaSweepService', () => {
  it('runs the checks and the purge, and never throws out of a cron tick', async () => {
    const checks = { runDueChecks: jest.fn().mockRejectedValue(new Error('db down')) };
    const media = { purgeQuarantine: jest.fn().mockRejectedValue(new Error('s3 down')) };
    const sweep = new PostMediaSweepService(checks as unknown as MediaCheckService, media as unknown as PostMediaService);
    await expect(sweep.runChecks()).resolves.toBeUndefined();
    await expect(sweep.purgeQuarantine()).resolves.toBeUndefined();
    expect(checks.runDueChecks).toHaveBeenCalledTimes(1);
    expect(media.purgeQuarantine).toHaveBeenCalledTimes(1);
  });
});
