import { ConfigService } from '@nestjs/config';
import { writeFile } from 'fs/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaModerationClient } from './media-moderation-client';
import { MediaProcessor } from './media-processor';
import { MediaCheckService, PostMediaSweepService } from './media-check.service';
import { PostMediaObjectsService } from './post-media-objects.service';
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
    notification: { create: jest.fn().mockResolvedValue({ id: 'n1' }) },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(prisma));
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
  const objects = {
    copyToPublic: jest.fn().mockResolvedValue(undefined),
    discardUnrecordedCopy: jest.fn().mockResolvedValue(undefined),
    finishPublish: jest.fn().mockResolvedValue(undefined),
  };
  const guardianNotices = { notifyInBackground: jest.fn() };
  const service = new MediaCheckService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    processor as unknown as MediaProcessor,
    moderation as unknown as MediaModerationClient,
    new PostMediaConfig(new ConfigService(opts.env ?? {})),
    objects as unknown as PostMediaObjectsService,
    { now: () => NOW },
    guardianNotices as never,
  );
  return { service, prisma, storage, processor, moderation, objects, guardianNotices };
}

const imageRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  uploaderId: 'u1',
  kind: 'image',
  contentType: 'image/jpeg',
  privateKey: 'private-media/u1/m1.jpg',
  publicKey: 'post-media/u1/m1.jpg',
  publishedAt: null,
  durationSeconds: null,
  checkAttempts: 0,
  uploader: { isMinor: false },
  ...over,
});

describe('MediaCheckService.runDueChecks', () => {
  it('when Rekognition is not configured it runs no check and decides NOTHING: no download, no approval, no notification', async () => {
    const { service, prisma, storage, moderation } = build({ configured: false });
    expect(await service.runDueChecks(NOW)).toEqual({ checked: 0, outcomes: {} });
    expect(prisma.postMedia.findMany).not.toHaveBeenCalled();
    expect(storage.downloadToFile).not.toHaveBeenCalled();
    expect(moderation.detectModerationLabels).not.toHaveBeenCalled();
    expect(prisma.notification.create).not.toHaveBeenCalled();
    // The only write: rows that waited past the configured time go to the moderator queue (B-037).
    expect(prisma.postMedia.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.postMedia.updateMany.mock.calls[0][0];
    expect(call.data).toEqual({ reviewEnteredAt: NOW, reviewEntrySource: 'auto_check' });
    expect(call.data.status).toBeUndefined();
    expect(call.where).toEqual({
      uploadState: 'ready',
      status: 'pending',
      decisionSource: null,
      reviewEnteredAt: null,
      confirmedAt: { lte: new Date(NOW.getTime() - 30 * 60_000) },
    });
  });

  it('the unchecked wait is configurable', async () => {
    const { service, prisma } = build({ configured: false, env: { MEDIA_REVIEW_UNCHECKED_AFTER_MINUTES: '5' } });
    await service.runDueChecks(NOW);
    expect(prisma.postMedia.updateMany.mock.calls[0][0].where.confirmedAt).toEqual({ lte: new Date(NOW.getTime() - 5 * 60_000) });
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

// backend/b036-avatar-cover-check: the same download / shrink / detect / decide steps for ONE stored image, for
// callers other than post media.
describe('MediaCheckService.checkStoredImage (avatars and covers, B-036)', () => {
  it('reads the stored file, runs the SAME steps and thresholds, and returns the decision without writing anything', async () => {
    const { service, prisma, storage, processor, moderation } = build();
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Suggestive', parentName: null, confidence: 60 }]);

    const decision = await service.checkStoredImage('private-profile/u1/a.jpg', false);

    expect(storage.downloadToFile).toHaveBeenCalledWith('private-profile/u1/a.jpg', expect.any(String));
    expect(processor.shrinkForModeration).toHaveBeenCalledTimes(1);
    expect(moderation.detectModerationLabels).toHaveBeenCalledWith(expect.any(Buffer), 40);
    expect(decision).toEqual({ outcome: 'pending', categories: ['Suggestive'] });
    expect(prisma.postMedia.updateMany).not.toHaveBeenCalled();
    expect(prisma.postMedia.findUnique).not.toHaveBeenCalled();
  });

  it('is stricter for a minor: asks from the lower minor threshold and rejects at the minor reject threshold', async () => {
    const { service, moderation } = build();
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Explicit', parentName: null, confidence: 85 }]);
    expect(await service.checkStoredImage('private-profile/u1/a.jpg', true)).toMatchObject({ outcome: 'rejected' });
    expect(moderation.detectModerationLabels).toHaveBeenCalledWith(expect.any(Buffer), 20);
    expect(await service.checkStoredImage('private-profile/u1/a.jpg', false)).toMatchObject({ outcome: 'pending' });
  });

  it('a clean image is approved; a failure to read or to call Rekognition propagates (the caller decides what it means)', async () => {
    const { service, storage, moderation } = build();
    expect(await service.checkStoredImage('k', false)).toEqual({ outcome: 'approved', categories: [] });
    moderation.detectModerationLabels.mockRejectedValueOnce(new Error('Rekognition is down'));
    await expect(service.checkStoredImage('k', false)).rejects.toThrow('Rekognition is down');
    storage.downloadToFile.mockRejectedValueOnce(new Error('missing'));
    await expect(service.checkStoredImage('k', false)).rejects.toThrow('missing');
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
    expect(write.data).toMatchObject({ status: 'approved', decisionSource: 'auto', decidedAt: NOW, publishedAt: NOW, checkState: 'done', checkLabels: [] });
    // The uploader is told in the same transaction (B-037): the "approved" variant, naming the file.
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'post_media_approved', payloadRefId: 'm1' },
      select: { id: true },
    });
  });

  // ---- B-257 (Decision Log #430 item 2): the private prefix -------------------------------------------

  it('reads the file from the PRIVATE prefix, never the public one', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    await service.checkOne('m1', NOW);
    expect(storage.downloadToFile).toHaveBeenCalledWith('private-media/u1/m1.jpg', expect.any(String));
    expect(storage.downloadToFile).not.toHaveBeenCalledWith('post-media/u1/m1.jpg', expect.any(String));
  });

  it('an automatic APPROVAL publishes the file first (copy + verify), writes the decision, and then removes the private original', async () => {
    const order: string[] = [];
    const { service, prisma, objects } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    objects.copyToPublic.mockImplementation(async () => void order.push('copy'));
    prisma.postMedia.updateMany.mockImplementation(async () => {
      order.push('write');
      return { count: 1 };
    });
    objects.finishPublish.mockImplementation(async () => void order.push('finish'));
    expect(await service.checkOne('m1', NOW)).toBe('approved');
    expect(order).toEqual(['write', 'copy', 'write', 'finish']); // the first write is the claim
    expect(objects.copyToPublic).toHaveBeenCalledWith(expect.objectContaining({ privateKey: 'private-media/u1/m1.jpg', publicKey: 'post-media/u1/m1.jpg' }));
  });

  it('FAILS CLOSED: if publishing fails the approval is NOT written, no notification is sent, and the check is retried', async () => {
    const { service, prisma, objects } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    objects.copyToPublic.mockRejectedValue(new Error('storage down'));
    expect(await service.checkOne('m1', NOW)).toBe('retry');
    // updateMany calls: [0] the claim, [1] the failure bookkeeping -- and neither is an approval.
    const writes = prisma.postMedia.updateMany.mock.calls.map((c) => c[0].data);
    expect(writes.some((d) => d.status === 'approved' || d.publishedAt)).toBe(false);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(objects.finishPublish).not.toHaveBeenCalled();
  });

  it('after the last attempt a persistent publish failure goes to a moderator, still not approved', async () => {
    const { service, prisma, objects } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ checkAttempts: 4 }));
    objects.copyToPublic.mockRejectedValue(new Error('storage down'));
    expect(await service.checkOne('m1', NOW)).toBe('gave_up');
    expect(prisma.postMedia.updateMany.mock.calls[1][0].data.status).toBeUndefined();
  });

  it('an automatic rejection and an uncertain result copy NOTHING: the file stays private', async () => {
    const rejected = build();
    rejected.prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    rejected.moderation.detectModerationLabels.mockResolvedValue([{ name: 'Explicit', parentName: '', confidence: 99 }]);
    await rejected.service.checkOne('m1', NOW);
    expect(rejected.objects.copyToPublic).not.toHaveBeenCalled();

    const unsure = build();
    unsure.prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    unsure.moderation.detectModerationLabels.mockResolvedValue([{ name: 'Suggestive', parentName: '', confidence: 60 }]);
    await unsure.service.checkOne('m1', NOW);
    expect(unsure.objects.copyToPublic).not.toHaveBeenCalled();
  });

  it('an automatic approval that loses the race to a moderator cleans up its unrecorded public copy (and does not finish)', async () => {
    const { service, prisma, objects } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    prisma.postMedia.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await service.checkOne('m1', NOW)).toBe('skipped');
    expect(objects.discardUnrecordedCopy).toHaveBeenCalledWith('m1', 'post-media/u1/m1.jpg');
    expect(objects.finishPublish).not.toHaveBeenCalled();
  });

  it('an automatic rejection writes the generic reason and the "rejected" notification, never the labels', async () => {
    const { service, prisma, moderation } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Explicit', parentName: '', confidence: 99 }]);
    expect(await service.checkOne('m1', NOW)).toBe('rejected');
    expect(prisma.postMedia.updateMany.mock.calls[1][0].data).toMatchObject({ status: 'rejected', decisionSource: 'auto' });
    expect(prisma.notification.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'post_media_rejected', payloadRefId: 'm1' },
      select: { id: true },
    });
  });

  it('an uncertain result enters the moderator queue and writes NO decision and NO notification', async () => {
    const { service, prisma, moderation } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Suggestive', parentName: '', confidence: 60 }]);
    expect(await service.checkOne('m1', NOW)).toBe('pending');
    const data = prisma.postMedia.updateMany.mock.calls[1][0].data;
    expect(data).toMatchObject({ checkState: 'done', reviewEnteredAt: NOW, reviewEntrySource: 'auto_check' });
    expect(data.status).toBeUndefined();
    expect(prisma.notification.create).not.toHaveBeenCalled();
  });

  it('a moderator who decided first wins: the guarded write matches nothing and the outcome is "skipped"', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    prisma.postMedia.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect(await service.checkOne('m1', NOW)).toBe('skipped');
    expect(prisma.notification.create).not.toHaveBeenCalled(); // nothing decided by the check, nothing to announce
  });

  it('a video is sampled at the configured interval and every frame goes to Rekognition', async () => {
    const { service, prisma, processor, moderation } = build({ env: { MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS: '10', MEDIA_CHECK_VIDEO_MAX_FRAMES: '30' } });
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ kind: 'video', durationSeconds: 25, privateKey: 'private-media/u1/m1.mp4', publicKey: 'post-media/u1/m1.mp4' }));
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
    expect(data).toMatchObject({ checkState: 'gave_up', checkAttempts: 5, reviewEnteredAt: NOW, reviewEntrySource: 'auto_check' });
    expect(data.status).toBeUndefined();
    expect(data.decisionSource).toBeUndefined();
  });

  it('a missing stored file is a failure (retried), never an approval', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow({ privateKey: null }));
    expect(await service.checkOne('m1', NOW)).toBe('retry');
  });
});

describe('PostMediaSweepService', () => {
  it('runs the checks, the reconciler and both purges, and never throws out of a cron tick', async () => {
    const checks = { runDueChecks: jest.fn().mockRejectedValue(new Error('db down')) };
    const media = {
      purgeQuarantine: jest.fn().mockRejectedValue(new Error('s3 down')),
      purgeUnattached: jest.fn().mockRejectedValue(new Error('s3 down')),
    };
    const objects = { reconcile: jest.fn().mockRejectedValue(new Error('db down')) };
    const sweep = new PostMediaSweepService(
      checks as unknown as MediaCheckService,
      media as unknown as PostMediaService,
      objects as unknown as PostMediaObjectsService,
    );
    await expect(sweep.runChecks()).resolves.toBeUndefined();
    await expect(sweep.purgeQuarantine()).resolves.toBeUndefined();
    await expect(sweep.purgeUnattached()).resolves.toBeUndefined();
    await expect(sweep.reconcileObjects()).resolves.toBeUndefined();
    expect(checks.runDueChecks).toHaveBeenCalledTimes(1);
    expect(media.purgeQuarantine).toHaveBeenCalledTimes(1);
    expect(media.purgeUnattached).toHaveBeenCalledTimes(1);
    expect(objects.reconcile).toHaveBeenCalledTimes(1);
  });
});

// B-279 (Decision Log #456 A): an AUTOMATIC rejection (image screening) is a platform action on the uploader's
// content, so the uploader's guardian (if a minor with a confirmed guardian) is told the kind of action. The
// notice is asked for only when the rejection was actually written, and never carries the labels.
describe('MediaCheckService: guardian notice (B-279)', () => {
  it('an automatic rejection asks for a media_not_approved notice for the uploader, once', async () => {
    const { service, prisma, moderation, guardianNotices } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Explicit', parentName: '', confidence: 99 }]);
    expect(await service.checkOne('m1', NOW)).toBe('rejected');
    expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
    expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('u1', 'media_not_approved');
  });

  it('an automatic APPROVAL sends nothing', async () => {
    const { service, prisma, guardianNotices } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    expect(await service.checkOne('m1', NOW)).toBe('approved');
    expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('an uncertain result (sent to a moderator) sends nothing', async () => {
    const { service, prisma, moderation, guardianNotices } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Suggestive', parentName: '', confidence: 60 }]);
    expect(await service.checkOne('m1', NOW)).toBe('pending');
    expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('a rejection that lost a race (nothing written) sends nothing', async () => {
    const { service, prisma, moderation, guardianNotices } = build();
    prisma.postMedia.findUnique.mockResolvedValue(imageRow());
    moderation.detectModerationLabels.mockResolvedValue([{ name: 'Explicit', parentName: '', confidence: 99 }]);
    prisma.postMedia.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await service.checkOne('m1', NOW)).toBe('skipped');
    expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
  });
});
