import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile } from 'fs/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaProcessor } from './media-processor';
import { PostMediaConfig } from './post-media.config';
import { PostMediaService } from './post-media.service';

// backend/media-privacy-vetting-followups (B-257, B-259; Decision Log #430 items 2 and 4): the upload
// pipeline's use of the private prefix, the author's signed view link, HEIC, the unattached purge, and the
// rule that a rejected file's private object is deleted on every path unless held / reported (B-283).

// Every confirm makes and removes a real temp directory (the service works on files). On a slow or busy disk
// that alone can pass the 30 s global default, so this file allows more; nothing here waits on anything else.
jest.setTimeout(120_000);

const NOW = new Date('2026-11-05T10:00:00Z');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(80)]);
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(80)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(80)]);

function build(env: Record<string, string> = {}) {
  const prisma = {
    postMedia: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    contestEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    // B-283: the protection rule reads active admin holds and the reports on a post, and writes deferrals.
    accountHold: { findMany: jest.fn().mockResolvedValue([]) },
    report: { findMany: jest.fn().mockResolvedValue([]) },
    postMediaDeferredDeletion: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const storage = {
    createUploadUrl: jest.fn().mockResolvedValue({ url: 'https://upload.test/x', headers: {} }),
    createDownloadUrl: jest.fn(async (key: string, ttl: number) => `https://view.test/${key}?ttl=${ttl}`),
    publicUrlFor: jest.fn((key: string) => `https://cdn.test/${key}`),
    copyObject: jest.fn(),
    delete: jest.fn().mockResolvedValue(undefined),
    head: jest.fn(),
    downloadToFile: jest.fn(),
    upload: jest.fn().mockResolvedValue('https://cdn.test/ignored'),
    uploadFile: jest.fn().mockResolvedValue('https://cdn.test/ignored'),
  };
  const processor = {
    assertVideoToolsAvailable: jest.fn().mockResolvedValue(undefined),
    sanitizeImage: jest.fn().mockResolvedValue({ buffer: Buffer.from('clean-image') }),
    probeVideo: jest.fn().mockResolvedValue({ durationSeconds: 10, hasVideoStream: true }),
    stripVideo: jest.fn(async (_i: string, out: string) => writeFile(out, Buffer.from('stripped-video'))),
  };
  const service = new PostMediaService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    processor as unknown as MediaProcessor,
    new PostMediaConfig(new ConfigService(env)),
    { now: () => NOW },
  );
  return { service, prisma, storage, processor };
}

const claimedRow = (over: Record<string, unknown> = {}) => ({
  id: 'abc',
  uploaderId: 'u1',
  kind: 'image',
  declaredContentType: 'image/jpeg',
  declaredSize: JPEG.length,
  uploadState: 'awaiting_upload',
  quarantineKey: 'quarantine/u1/abc',
  ...over,
});

const viewRow = (over: Record<string, unknown> = {}) => ({
  id: 'abc',
  kind: 'image',
  uploadState: 'ready',
  status: 'pending',
  rejectionReason: null,
  publicUrl: 'https://cdn.test/post-media/u1/abc.jpg',
  publicKey: 'post-media/u1/abc.jpg',
  privateKey: 'private-media/u1/abc.jpg',
  publishedAt: null,
  contentType: 'image/jpeg',
  byteSize: 10,
  durationSeconds: null,
  postId: null,
  createdAt: NOW,
  ...over,
});

describe('confirm: the processed file goes to the PRIVATE prefix', () => {
  it('an image is written to private-media/, never to post-media/, and nothing is copied or published', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(claimedRow());
    storage.head.mockResolvedValue({ size: JPEG.length, contentType: 'image/jpeg' });
    storage.downloadToFile.mockImplementation(async (_k: string, dest: string) => writeFile(dest, JPEG));
    prisma.postMedia.findUniqueOrThrow.mockResolvedValue(viewRow());

    await service.confirmUpload('u1', 'abc');

    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(storage.upload.mock.calls[0][1]).toBe('private-media/u1/abc.jpg');
    for (const call of [...storage.upload.mock.calls, ...storage.uploadFile.mock.calls]) expect(call[1]).not.toMatch(/^post-media\//);
    expect(storage.copyObject).not.toHaveBeenCalled();
    const done = prisma.postMedia.updateMany.mock.calls.find((c) => c[0].data.uploadState === 'ready')![0].data;
    expect(done).toMatchObject({
      privateKey: 'private-media/u1/abc.jpg',
      publicKey: 'post-media/u1/abc.jpg',
      publicUrl: 'https://cdn.test/post-media/u1/abc.jpg', // the FUTURE public location, from publicUrlFor
      checkState: 'queued',
    });
    expect(done.status).toBeUndefined(); // nothing is approved here
    expect(done.publishedAt).toBeUndefined();
  });

  it('a video is written to the private prefix too', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(claimedRow({ kind: 'video', declaredContentType: 'video/mp4', declaredSize: MP4.length }));
    storage.head.mockResolvedValue({ size: MP4.length, contentType: 'video/mp4' });
    storage.downloadToFile.mockImplementation(async (_k: string, dest: string) => writeFile(dest, MP4));
    prisma.postMedia.findUniqueOrThrow.mockResolvedValue(viewRow({ kind: 'video', publicKey: 'post-media/u1/abc.mp4', privateKey: 'private-media/u1/abc.mp4' }));

    await service.confirmUpload('u1', 'abc');

    expect(storage.uploadFile).toHaveBeenCalledTimes(1);
    expect(storage.uploadFile.mock.calls[0][1]).toBe('private-media/u1/abc.mp4');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('if the row changed under it, the PRIVATE object just written is removed (not a public one)', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(claimedRow());
    storage.head.mockResolvedValue({ size: JPEG.length, contentType: 'image/jpeg' });
    storage.downloadToFile.mockImplementation(async (_k: string, dest: string) => writeFile(dest, JPEG));
    prisma.postMedia.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await expect(service.confirmUpload('u1', 'abc')).rejects.toMatchObject({ status: 409 });
    expect(storage.delete).toHaveBeenCalledWith('private-media/u1/abc.jpg');
  });
});

describe('HEIC / HEIF (B-259): refused with a clear, plain message, no conversion', () => {
  const HEIC_MESSAGE =
    "HEIC photos (the default on many iPhones) aren't supported yet. Please change the picture to JPEG or PNG, or choose a different one, and try again.";

  it.each(['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence', 'IMAGE/HEIC'])('refuses a declared %s before touching storage or the database', async (contentType) => {
    const { service, prisma, storage } = build();
    const err = await service.createUpload('u1', { contentType, size: 100 }).catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.response).toMatchObject({ statusCode: 400, code: 'heic_not_supported', message: HEIC_MESSAGE });
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
    expect(prisma.postMedia.create).not.toHaveBeenCalled();
  });

  it('the message names HEIC and says what to do instead (not a generic "unsupported file")', () => {
    expect(HEIC_MESSAGE).toMatch(/HEIC/);
    expect(HEIC_MESSAGE).toMatch(/JPEG or PNG/);
    expect(HEIC_MESSAGE).not.toMatch(/isn't a supported picture or video/);
  });

  it('a HEIC photo sent under another declared type (image/jpeg) is refused on confirm with the same message, and discarded', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(claimedRow({ declaredSize: HEIC.length }));
    storage.head.mockResolvedValue({ size: HEIC.length, contentType: 'image/jpeg' });
    storage.downloadToFile.mockImplementation(async (_k: string, dest: string) => writeFile(dest, HEIC));
    const err = await service.confirmUpload('u1', 'abc').catch((e) => e);
    expect(err.status).toBe(400);
    expect(err.response).toMatchObject({ code: 'heic_not_supported', message: HEIC_MESSAGE });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.delete).toHaveBeenCalledWith('quarantine/u1/abc'); // discarded, nothing kept
    expect(prisma.postMedia.deleteMany).toHaveBeenCalled();
  });

  it('an unsupported but non-HEIC type keeps its own generic refusal (a GIF is not a HEIC)', async () => {
    const { service } = build();
    await expect(service.createUpload('u1', { contentType: 'image/gif', size: 10 })).rejects.toMatchObject({ response: { code: 'unsupported_file' } });
  });
});

describe('the author\'s own view link (B-257)', () => {
  it('a pending file gets a SHORT-LIVED signed link to its PRIVATE object, in addition to the unchanged url field', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(viewRow());
    const view = await service.getOwnUpload('u1', 'abc');
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('private-media/u1/abc.jpg', 300);
    expect(view.viewUrl).toBe('https://view.test/private-media/u1/abc.jpg?ttl=300');
    expect(view.viewUrlExpiresAt).toEqual(new Date(NOW.getTime() + 300_000));
    // publicUrl semantics are NOT removed or renamed: apps/web reads `url` today.
    expect(view.url).toBe('https://cdn.test/post-media/u1/abc.jpg');
  });

  it('a REJECTED file is still viewable by its author, from the private object', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(viewRow({ status: 'rejected', rejectionReason: "This file didn't meet our rules" }));
    const view = await service.getOwnUpload('u1', 'abc');
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('private-media/u1/abc.jpg', 300);
    expect(view.rejectionReason).toBe("This file didn't meet our rules");
  });

  it('an APPROVED, published file is viewed from the public object', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(viewRow({ status: 'approved', publishedAt: NOW, privateKey: null }));
    await service.getOwnUpload('u1', 'abc');
    expect(storage.createDownloadUrl).toHaveBeenCalledWith('post-media/u1/abc.jpg', 300);
  });

  it('is not signed for an upload that is not ready (there is no object yet), and a storage outage just leaves it null', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(viewRow({ uploadState: 'awaiting_upload' }));
    expect((await service.getOwnUpload('u1', 'abc')).viewUrl).toBeNull();
    expect(storage.createDownloadUrl).not.toHaveBeenCalled();

    prisma.postMedia.findFirst.mockResolvedValue(viewRow());
    storage.createDownloadUrl.mockRejectedValue(new ServiceUnavailableException('no store'));
    const view = await service.getOwnUpload('u1', 'abc');
    expect(view.viewUrl).toBeNull();
    expect(view.viewUrlExpiresAt).toBeNull();
  });

  it('the select never reads the check labels and the view carries no private key or reviewer data', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findFirst.mockResolvedValue(viewRow());
    const view = await service.getOwnUpload('u1', 'abc');
    const keys = Object.keys(view);
    for (const hidden of ['privateKey', 'publicKey', 'publishedAt', 'checkLabels', 'reportCount']) expect(keys).not.toContain(hidden);
  });
});

describe('deleting your own upload deletes a rejected file\'s private object too (B-283), unless held or reported', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'abc',
    uploaderId: 'u1',
    uploadState: 'ready',
    postId: 'p1',
    publicUrl: 'https://cdn.test/post-media/u1/abc.jpg',
    status: 'pending',
    publishedAt: null,
    publicKey: 'post-media/u1/abc.jpg',
    privateKey: 'private-media/u1/abc.jpg',
    quarantineKey: null,
    ...over,
  });

  it('a REJECTED file: the row goes and the private object is deleted', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(row({ status: 'rejected' }));
    await service.deleteOwnUpload('u1', 'abc');
    expect(prisma.postMedia.delete).toHaveBeenCalledWith({ where: { id: 'abc' } });
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['private-media/u1/abc.jpg']);
    expect(prisma.postMediaDeferredDeletion.createMany).not.toHaveBeenCalled();
  });

  it('a REJECTED file whose uploader is under an active hold: the row goes, the object is KEPT and the deletion is recorded', async () => {
    const { service, prisma, storage } = build();
    prisma.accountHold.findMany.mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]);
    prisma.postMedia.findFirst.mockResolvedValue(row({ status: 'rejected' }));
    await service.deleteOwnUpload('u1', 'abc');
    expect(prisma.postMedia.delete).toHaveBeenCalledWith({ where: { id: 'abc' } });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.postMediaDeferredDeletion.createMany).toHaveBeenCalledWith({
      data: [{ objectKey: 'private-media/u1/abc.jpg', mediaId: 'abc', uploaderId: 'u1', postId: 'p1' }],
      skipDuplicates: true,
    });
  });

  it('a REJECTED file on a post with an OPEN report: the object is KEPT and the deletion is recorded', async () => {
    const { service, prisma, storage } = build();
    prisma.report.findMany.mockResolvedValue([{ targetId: 'p1', status: 'open', appealStatus: null, reviewedAt: null, appealReviewedAt: null }]);
    prisma.postMedia.findFirst.mockResolvedValue(row({ status: 'rejected' }));
    await service.deleteOwnUpload('u1', 'abc');
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.postMediaDeferredDeletion.createMany).toHaveBeenCalledTimes(1);
  });

  it('the deferral is written in the SAME transaction as the row delete', async () => {
    const { service, prisma } = build();
    prisma.accountHold.findMany.mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]);
    prisma.postMedia.findFirst.mockResolvedValue(row({ status: 'rejected' }));
    await service.deleteOwnUpload('u1', 'abc');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const tx = prisma.$transaction.mock.invocationCallOrder[0];
    expect(prisma.postMediaDeferredDeletion.createMany.mock.invocationCallOrder[0]).toBeGreaterThan(tx);
  });

  it('a pending file: its private object is deleted', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(row());
    await service.deleteOwnUpload('u1', 'abc');
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['private-media/u1/abc.jpg']);
  });

  it('an approved, published file: the public object is deleted', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findFirst.mockResolvedValue(row({ status: 'approved', publishedAt: NOW, privateKey: null }));
    await service.deleteOwnUpload('u1', 'abc');
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['post-media/u1/abc.jpg']);
  });
});

describe('purgeUnattached (B-259, B-283): confirmed uploads never attached to a post, after 7 days', () => {
  const stale = (over: Record<string, unknown> = {}) => ({
    id: 'a',
    uploaderId: 'u1',
    postId: null,
    status: 'pending',
    publishedAt: null,
    publicKey: 'post-media/u1/a.jpg',
    privateKey: 'private-media/u1/a.jpg',
    quarantineKey: null,
    ...over,
  });

  it('selects ready, unattached uploads confirmed more than 7 days ago (a rejected one too, B-283)', async () => {
    const { service, prisma } = build();
    await service.purgeUnattached(NOW);
    expect(prisma.postMedia.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.postMedia.findMany.mock.calls[0][0].where).toEqual({
      uploadState: 'ready',
      postId: null,
      confirmedAt: { lt: new Date(NOW.getTime() - 7 * 24 * 3600 * 1000) },
      id: { notIn: [] },
    });
  });

  it('the age is configurable (POST_MEDIA_UNATTACHED_MAX_AGE_DAYS) and falls back to 7 for an unusable value', async () => {
    const three = build({ POST_MEDIA_UNATTACHED_MAX_AGE_DAYS: '3' });
    await three.service.purgeUnattached(NOW);
    expect(three.prisma.postMedia.findMany.mock.calls[0][0].where.confirmedAt).toEqual({ lt: new Date(NOW.getTime() - 3 * 24 * 3600 * 1000) });

    const bad = build({ POST_MEDIA_UNATTACHED_MAX_AGE_DAYS: 'soon' });
    await bad.service.purgeUnattached(NOW);
    expect(bad.prisma.postMedia.findMany.mock.calls[0][0].where.confirmedAt).toEqual({ lt: new Date(NOW.getTime() - 7 * 24 * 3600 * 1000) });
  });

  it('removes the objects first, then the row, and counts it', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce([stale()]);
    expect(await service.purgeUnattached(NOW)).toEqual({ purged: 1, failed: 0, heldBack: 0 });
    expect(storage.delete).toHaveBeenCalledWith('private-media/u1/a.jpg');
    expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({ where: { id: 'a', postId: null, status: 'pending' } });
    expect(storage.delete.mock.invocationCallOrder[0]).toBeLessThan(prisma.postMedia.deleteMany.mock.invocationCallOrder[0]);
  });

  it('a deletion failure is logged, the row is KEPT for the next run, and the rest of the batch still goes', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce([stale({ id: 'a' }), stale({ id: 'b', privateKey: 'private-media/u1/b.jpg' })]);
    storage.delete.mockImplementation(async (key: string) => {
      if (key.includes('/a.')) throw new Error('storage down');
    });
    expect(await service.purgeUnattached(NOW)).toEqual({ purged: 1, failed: 1, heldBack: 0 });
    expect(prisma.postMedia.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.postMedia.deleteMany.mock.calls[0][0].where.id).toBe('b');
  });

  it('a failed row is excluded from the next batch of the same run, so a down store cannot spin it', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce(Array.from({ length: 200 }, (_v, i) => stale({ id: `x${i}`, privateKey: `private-media/u1/x${i}.jpg` }))).mockResolvedValueOnce([]);
    storage.delete.mockRejectedValue(new Error('down'));
    const r = await service.purgeUnattached(NOW);
    expect(r.failed).toBe(200);
    expect(prisma.postMedia.findMany.mock.calls[1][0].where.id.notIn).toHaveLength(200);
  });

  it('a REJECTED item is purged like any other: its private object is deleted, then the row', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce([stale({ id: 'r', status: 'rejected', privateKey: 'private-media/u1/r.jpg' })]);
    expect(await service.purgeUnattached(NOW)).toEqual({ purged: 1, failed: 0, heldBack: 0 });
    expect(storage.delete).toHaveBeenCalledWith('private-media/u1/r.jpg');
    expect(prisma.postMedia.deleteMany).toHaveBeenCalledWith({ where: { id: 'r', postId: null, status: 'rejected' } });
  });

  it('a REJECTED item whose uploader is under an active hold is HELD BACK: nothing deleted, the row stays, the next batch skips it', async () => {
    const { service, prisma, storage } = build();
    prisma.accountHold.findMany.mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]);
    prisma.postMedia.findMany
      .mockResolvedValueOnce([stale({ id: 'r', status: 'rejected', privateKey: 'private-media/u1/r.jpg' }), stale({ id: 'p' })])
      .mockResolvedValueOnce([]);
    const r = await service.purgeUnattached(NOW);
    expect(r).toEqual({ purged: 1, failed: 0, heldBack: 1 });
    expect(storage.delete).not.toHaveBeenCalledWith('private-media/u1/r.jpg');
    expect(prisma.postMedia.deleteMany.mock.calls.map((c) => c[0].where.id)).toEqual(['p']);
  });

  it('a held-back item is excluded from the next batch of the same run (no spinning)', async () => {
    const { service, prisma } = build();
    prisma.accountHold.findMany.mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]);
    prisma.postMedia.findMany
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_v, i) => stale({ id: `r${i}`, status: 'rejected', privateKey: `private-media/u1/r${i}.jpg` })))
      .mockResolvedValueOnce([]);
    await service.purgeUnattached(NOW);
    expect(prisma.postMedia.findMany.mock.calls[1][0].where.id.notIn).toHaveLength(200);
  });
});

describe('purgeQuarantine (B-283): a rejected file\'s private object goes with its leftover original, unless held', () => {
  const rejectedReady = (over: Record<string, unknown> = {}) => ({
    id: 'r',
    quarantineKey: 'quarantine/u1/r',
    uploadState: 'ready',
    uploaderId: 'u1',
    postId: 'p1',
    status: 'rejected',
    privateKey: 'private-media/u1/r.jpg',
    ...over,
  });

  it('selects rows that still hold a quarantined ORIGINAL (and skips none at first)', async () => {
    const { service, prisma } = build();
    await service.purgeQuarantine(NOW);
    expect(prisma.postMedia.findMany.mock.calls[0][0].where).toEqual({
      quarantineKey: { not: null },
      createdAt: { lt: new Date(NOW.getTime() - 24 * 3600 * 1000) },
      id: { notIn: [] },
    });
  });

  it('a ready, REJECTED row: both the leftover original and the private object are deleted, and both keys are cleared', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce([rejectedReady()]).mockResolvedValueOnce([]);
    expect(await service.purgeQuarantine(NOW)).toEqual({ purged: 1 });
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['quarantine/u1/r', 'private-media/u1/r.jpg']);
    expect(prisma.postMedia.delete).not.toHaveBeenCalled();
    expect(prisma.postMedia.update).toHaveBeenCalledWith({ where: { id: 'r' }, data: { quarantineKey: null, privateKey: null } });
  });

  it('a ready row that is NOT rejected only loses the leftover original', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce([rejectedReady({ status: 'pending' })]).mockResolvedValueOnce([]);
    await service.purgeQuarantine(NOW);
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['quarantine/u1/r']);
    expect(prisma.postMedia.update).toHaveBeenCalledWith({ where: { id: 'r' }, data: { quarantineKey: null } });
  });

  it('a rejected row whose uploader is under an active hold is left ENTIRELY for the next run', async () => {
    const { service, prisma, storage } = build();
    prisma.accountHold.findMany.mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]);
    prisma.postMedia.findMany.mockResolvedValueOnce([rejectedReady()]);
    expect(await service.purgeQuarantine(NOW)).toEqual({ purged: 0 });
    expect(storage.delete).not.toHaveBeenCalled();
    expect(prisma.postMedia.update).not.toHaveBeenCalled();
    expect(prisma.postMedia.delete).not.toHaveBeenCalled();
  });

  it('held rows are excluded from the next batch of the same run (no spinning on a full page)', async () => {
    const { service, prisma } = build();
    prisma.accountHold.findMany.mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: null, expiresAt: null }]);
    prisma.postMedia.findMany
      .mockResolvedValueOnce(Array.from({ length: 200 }, (_v, i) => rejectedReady({ id: `r${i}`, quarantineKey: `quarantine/u1/r${i}` })))
      .mockResolvedValueOnce([]);
    await service.purgeQuarantine(NOW);
    expect(prisma.postMedia.findMany.mock.calls[1][0].where.id.notIn).toHaveLength(200);
  });

  it('a never-confirmed upload loses its object and its row, as before', async () => {
    const { service, prisma, storage } = build();
    prisma.postMedia.findMany.mockResolvedValueOnce([rejectedReady({ uploadState: 'awaiting_upload', status: 'pending', privateKey: null })]).mockResolvedValueOnce([]);
    await service.purgeQuarantine(NOW);
    expect(storage.delete.mock.calls.map((c) => c[0])).toEqual(['quarantine/u1/r']);
    expect(prisma.postMedia.delete).toHaveBeenCalledWith({ where: { id: 'r' } });
  });
});
