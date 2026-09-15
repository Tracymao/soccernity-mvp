import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { encodeMediaCursor } from './cursor.util';
import { MediaService, UploadedMediaFile } from './media.service';

// Mocked-Prisma unit tests, following admin-content.service.spec.ts /
// admin-users.service.spec.ts's own convention. StorageService is also
// mocked here — a real fake/in-memory implementation of the abstraction
// (per this PR's own task brief, item 4) rather than a real
// S3StorageService — so these tests never need real S3-compatible
// credentials. S3StorageService's own construction/URL-shape logic (the
// only genuinely S3-specific code in this PR) is covered separately in
// s3-storage.service.spec.ts; nothing here exercises a real network call.

function buildPrismaMock() {
  const prisma = {
    mediaAsset: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;

  return prisma;
}

function buildFakeStorage(): StorageService {
  return {
    upload: jest.fn().mockResolvedValue('https://cdn.example.com/media/uploader-1/fake-key.jpg'),
    delete: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageService;
}

function mediaAsset(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'media-1',
    uploaderId: 'admin-1',
    url: 'https://cdn.example.com/media/admin-1/fake-key.jpg',
    type: 'image',
    size: 12345,
    createdAt: new Date('2026-09-15T10:00:00.000Z'),
    ...overrides,
  };
}

function uploadedFile(overrides: Partial<UploadedMediaFile> = {}): UploadedMediaFile {
  return {
    buffer: Buffer.from('fake-bytes'),
    mimetype: 'image/jpeg',
    size: 12345,
    originalname: 'photo.jpg',
    ...overrides,
  };
}

describe('MediaService', () => {
  describe('uploadMedia', () => {
    it('rejects when no file was attached', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      const service = new MediaService(storage, prisma);

      await expect(service.uploadMedia('admin-1', undefined)).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('rejects an unsupported MIME type before ever calling storage', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      const service = new MediaService(storage, prisma);

      await expect(
        service.uploadMedia('admin-1', uploadedFile({ mimetype: 'application/pdf' })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('uploads an image, derives type from the MIME type, and creates a MediaAsset row', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue(mediaAsset());
      const service = new MediaService(storage, prisma);

      const result = await service.uploadMedia('admin-1', uploadedFile());

      expect(storage.upload).toHaveBeenCalledWith(expect.any(Buffer), expect.stringContaining('media/admin-1/'), 'image/jpeg');
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            uploaderId: 'admin-1',
            type: 'image',
            size: 12345,
            url: 'https://cdn.example.com/media/uploader-1/fake-key.jpg',
          }),
        }),
      );
      expect(result).toEqual(mediaAsset());
    });

    it('derives type "video" for a video MIME type', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue(mediaAsset({ type: 'video' }));
      const service = new MediaService(storage, prisma);

      await service.uploadMedia('admin-1', uploadedFile({ mimetype: 'video/mp4', originalname: 'clip.mp4' }));

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'video' }) }),
      );
    });

    it('sanitizes an unsafe original filename into the generated key', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue(mediaAsset());
      const service = new MediaService(storage, prisma);

      await service.uploadMedia('admin-1', uploadedFile({ originalname: '../../etc/passwd.jpg' }));

      const [, key] = (storage.upload as jest.Mock).mock.calls[0];
      expect(key).not.toMatch(/\.\./);
      expect(key).toMatch(/^media\/admin-1\/[0-9a-f-]+-passwd\.jpg$/);
    });
  });

  describe('listMedia', () => {
    it('applies an exact-match type filter alongside the cursor', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([]);
      const service = new MediaService(storage, prisma);

      const cursor = encodeMediaCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'media-0' });
      await service.listMedia({ type: 'video', cursor, limit: 10 });

      expect(prisma.mediaAsset.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { type: 'video' },
              {
                OR: [
                  { createdAt: { lt: new Date('2026-09-01T00:00:00.000Z') } },
                  { createdAt: new Date('2026-09-01T00:00:00.000Z'), id: { lt: 'media-0' } },
                ],
              },
            ],
          },
          take: 11,
        }),
      );
    });

    it('returns a nextCursor only when more rows exist beyond the page', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      const rows = Array.from({ length: 3 }, (_, i) => mediaAsset({ id: `media-${i}` }));
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new MediaService(storage, prisma);

      const page = await service.listMedia({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it('returns a null nextCursor on the last page', async () => {
      const storage = buildFakeStorage();
      const prisma = buildPrismaMock();
      (prisma.mediaAsset.findMany as jest.Mock).mockResolvedValue([mediaAsset()]);
      const service = new MediaService(storage, prisma);

      const page = await service.listMedia({ limit: 20 });

      expect(page.items).toHaveLength(1);
      expect(page.nextCursor).toBeNull();
    });
  });
});
