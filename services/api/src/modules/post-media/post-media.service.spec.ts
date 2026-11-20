import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaProcessor } from './media-processor';
import { PostMediaConfig } from './post-media.config';
import { PostMediaService } from './post-media.service';

const NOW = new Date('2026-11-05T10:00:00Z');

function build(env: Record<string, string> = {}, overrides: { count?: number } = {}) {
  const prisma = {
    postMedia: {
      count: jest.fn().mockResolvedValue(overrides.count ?? 0),
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    contestEntry: { findUnique: jest.fn().mockResolvedValue(null) },
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  (prisma.$transaction as jest.Mock).mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  const storage = {
    createUploadUrl: jest.fn().mockResolvedValue({ url: 'https://upload.test/x', headers: { 'Content-Type': 'image/jpeg' } }),
    delete: jest.fn().mockResolvedValue(undefined),
    head: jest.fn(),
    downloadToFile: jest.fn(),
    upload: jest.fn(),
    uploadFile: jest.fn(),
  };
  const processor = { assertVideoToolsAvailable: jest.fn().mockResolvedValue(undefined) };
  const service = new PostMediaService(
    prisma as unknown as PrismaService,
    storage as unknown as DirectUploadStorageService,
    processor as unknown as MediaProcessor,
    new PostMediaConfig(new ConfigService(env)),
    { now: () => NOW },
  );
  return { service, prisma, storage, processor };
}

describe('PostMediaService.createUpload', () => {
  it('validates the declaration BEFORE touching storage or the database', async () => {
    const { service, prisma, storage } = build();
    await expect(service.createUpload('u1', { contentType: 'image/gif', size: 10 })).rejects.toMatchObject({ response: { code: 'unsupported_file' } });
    await expect(service.createUpload('u1', { contentType: 'image/png', size: 10 * 1024 * 1024 + 1 })).rejects.toMatchObject({ response: { code: 'file_too_large' } });
    await expect(service.createUpload('u1', { contentType: 'video/webm', size: 100 * 1024 * 1024 + 1 })).rejects.toMatchObject({ response: { code: 'file_too_large' } });
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
    expect(prisma.postMedia.create).not.toHaveBeenCalled();
    expect(prisma.postMedia.count).not.toHaveBeenCalled();
  });

  it('issues a link into the quarantine prefix, then records the row with the SAME id and key', async () => {
    const { service, prisma, storage } = build();
    const out = await service.createUpload('u1', { contentType: 'image/jpeg', size: 500 });

    const [key, type, len, ttl] = storage.createUploadUrl.mock.calls[0];
    expect(key).toBe(`quarantine/u1/${out.id}`);
    expect([type, len, ttl]).toEqual(['image/jpeg', 500, 900]);
    expect(prisma.postMedia.create).toHaveBeenCalledWith({
      data: { id: out.id, uploaderId: 'u1', kind: 'image', declaredContentType: 'image/jpeg', declaredSize: 500, quarantineKey: key, createdAt: NOW },
    });
    expect(out.expiresAt).toEqual(new Date('2026-11-05T10:15:00Z'));
    expect(out).toMatchObject({ uploadMethod: 'PUT', uploadUrl: 'https://upload.test/x', maxBytes: 10 * 1024 * 1024 });
  });

  it('checks the video tools before anything is written (a video link fails closed)', async () => {
    const { service, prisma, storage, processor } = build();
    processor.assertVideoToolsAvailable.mockRejectedValue(new ServiceUnavailableException('no ffmpeg'));
    await expect(service.createUpload('u1', { contentType: 'video/mp4', size: 100 })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.createUploadUrl).not.toHaveBeenCalled();
    expect(prisma.postMedia.create).not.toHaveBeenCalled();

    // an image never consults the video tools
    processor.assertVideoToolsAvailable.mockClear();
    await service.createUpload('u1', { contentType: 'image/png', size: 100 });
    expect(processor.assertVideoToolsAvailable).not.toHaveBeenCalled();
  });

  it('throttles per user from configuration: the window start comes from the clock, and it counts only that user', async () => {
    const { service, prisma } = build({ POST_MEDIA_UPLOAD_RATE_LIMIT_MAX: '3', POST_MEDIA_UPLOAD_RATE_LIMIT_WINDOW_SECONDS: '600' }, { count: 3 });
    await expect(service.createUpload('u1', { contentType: 'image/png', size: 10 })).rejects.toMatchObject({
      status: 429,
      response: { code: 'upload_rate_limited' },
    });
    expect(prisma.postMedia.count).toHaveBeenCalledWith({ where: { uploaderId: 'u1', createdAt: { gte: new Date('2026-11-05T09:50:00Z') } } });
    expect(prisma.postMedia.create).not.toHaveBeenCalled();
  });

  it('turns the storage layer\'s 503 (which names the S3 variables) into a friendly one and writes no row', async () => {
    const { service, prisma, storage } = build();
    storage.createUploadUrl.mockRejectedValue(new ServiceUnavailableException('set S3_BUCKET/S3_ACCESS_KEY'));
    const err = await service.createUpload('u1', { contentType: 'image/png', size: 10 }).catch((e) => e);
    expect(err.status).toBe(503);
    expect(err.response.code).toBe('uploads_unavailable');
    expect(JSON.stringify(err.response)).not.toMatch(/S3_/);
    expect(prisma.postMedia.create).not.toHaveBeenCalled();
  });

  it('an unexpected storage error is not swallowed', async () => {
    const { service, storage } = build();
    storage.createUploadUrl.mockRejectedValue(new Error('network'));
    await expect(service.createUpload('u1', { contentType: 'image/png', size: 10 })).rejects.toThrow('network');
  });
});

describe('PostMediaService own-upload routes', () => {
  it('getOwnUpload and confirmUpload answer 404 for an upload that is not the caller\'s (the query is scoped to the uploader)', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findFirst.mockResolvedValue(null);
    await expect(service.getOwnUpload('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.confirmUpload('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteOwnUpload('u1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    for (const call of prisma.postMedia.findFirst.mock.calls) expect(call[0].where).toEqual({ id: 'x', uploaderId: 'u1' });
  });

  it('never returns the file URL of an upload that is not ready, nor the check labels', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findFirst.mockResolvedValue({
      id: 'x', kind: 'image', uploadState: 'awaiting_upload', status: 'pending', rejectionReason: null,
      publicUrl: 'https://leak', contentType: null, byteSize: null, durationSeconds: null, postId: null, createdAt: NOW,
    });
    const view = await service.getOwnUpload('u1', 'x');
    expect(view.url).toBeNull();
    expect(Object.keys(view)).not.toContain('checkLabels');
    expect((prisma.postMedia.findFirst.mock.calls[0][0].select as Record<string, boolean>).checkLabels).toBeUndefined();
  });

  it('deleting refuses an upload that is mid-processing, and a contest entry\'s file', async () => {
    const { service, prisma } = build();
    prisma.postMedia.findFirst.mockResolvedValue({ id: 'x', uploadState: 'processing', postId: null, publicUrl: null, publicKey: null, quarantineKey: 'q' });
    await expect(service.deleteOwnUpload('u1', 'x')).rejects.toMatchObject({ status: 409, response: { code: 'upload_in_progress' } });

    prisma.postMedia.findFirst.mockResolvedValue({ id: 'x', uploadState: 'ready', postId: 'p1', publicUrl: 'u', publicKey: 'k', quarantineKey: null });
    prisma.contestEntry.findUnique.mockResolvedValue({ id: 'e1' });
    await expect(service.deleteOwnUpload('u1', 'x')).rejects.toMatchObject({ status: 409, response: { code: 'media_in_contest_entry' } });
    expect(prisma.postMedia.delete).not.toHaveBeenCalled();
  });
});
