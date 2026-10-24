import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../../storage/s3-storage.service';
import { StorageService } from '../../storage/storage.service';
import { PROFILE_IMAGE_UNSUPPORTED_MESSAGE } from './profile-image.util';
import { UserAvatarService } from './user-avatar.service';
import { UserCoverService } from './user-cover.service';

// B-196 (Decision Log #411 item 4): the cover photo is the avatar pipeline with the
// same rules. These tests pin each rule, and a parity block proves the two services
// cannot drift apart on the rules they share.

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

function file(buffer: Buffer, mimetype: string) {
  return { buffer, mimetype, size: buffer.length, originalname: 'cover.jpg' };
}

function build(storage: Partial<StorageService> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ coverKey: null, avatarKey: null }),
      update: jest.fn().mockResolvedValue({ id: 'u1' }),
    },
  } as unknown as PrismaService;
  const store = {
    upload: jest.fn().mockResolvedValue('https://cdn.example/covers/u1/x.jpg'),
    delete: jest.fn().mockResolvedValue(undefined),
    ...storage,
  } as unknown as StorageService;
  return { prisma, store, service: new UserCoverService(prisma, store) };
}

describe('UserCoverService (B-196)', () => {
  it('stores the object, then records it as PENDING (never approved by an upload)', async () => {
    const { prisma, store, service } = build();
    const res = await service.uploadCover('u1', file(JPEG, 'image/jpeg'));

    expect(res).toEqual({ cover: { url: 'https://cdn.example/covers/u1/x.jpg', status: 'pending' } });
    const [, key, type] = (store.upload as jest.Mock).mock.calls[0];
    expect(key).toMatch(/^covers\/u1\/[0-9a-f-]{36}\.jpg$/);
    expect(type).toBe('image/jpeg');
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { coverUrl: 'https://cdn.example/covers/u1/x.jpg', coverKey: key, coverStatus: 'pending' },
      select: { id: true },
    });
  });

  it('never writes the avatar columns', async () => {
    const { prisma, service } = build();
    await service.uploadCover('u1', file(JPEG, 'image/jpeg'));
    const data = (prisma.user.update as jest.Mock).mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(['coverKey', 'coverStatus', 'coverUrl']);
  });

  it.each([
    ['image/png', PNG, 'png'],
    ['image/webp', WEBP, 'webp'],
  ])('accepts %s', async (mime, buf, ext) => {
    const { store, service } = build();
    await service.uploadCover('u1', file(buf, mime));
    expect((store.upload as jest.Mock).mock.calls[0][1]).toMatch(new RegExp(`\\.${ext}$`));
  });

  it('refuses a missing or empty file with 400 and touches neither storage nor the database', async () => {
    const { prisma, store, service } = build();
    await expect(service.uploadCover('u1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadCover('u1', file(Buffer.alloc(0), 'image/jpeg'))).rejects.toBeInstanceOf(BadRequestException);
    expect(store.upload).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['gif', Buffer.from('GIF89a......'), 'image/gif'],
    ['video', Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]), 'video/mp4'],
    ['a PNG labelled as JPEG', PNG, 'image/jpeg'],
    ['text labelled as PNG', Buffer.from('<html>not an image</html>'), 'image/png'],
  ])('refuses %s with the one generic message, before storage', async (_n, buf, mime) => {
    const { store, service } = build();
    await expect(service.uploadCover('u1', file(buf, mime))).rejects.toThrow(PROFILE_IMAGE_UNSUPPORTED_MESSAGE);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('removes the PREVIOUS cover object after a successful replace, best effort', async () => {
    const { prisma, store, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ coverKey: 'covers/u1/old.jpg' });
    await service.uploadCover('u1', file(JPEG, 'image/jpeg'));
    expect(store.delete).toHaveBeenCalledWith('covers/u1/old.jpg');
  });

  it('a failure removing the old object never fails the upload', async () => {
    const { prisma, service } = build({ delete: jest.fn().mockRejectedValue(new Error('r2 down')) });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ coverKey: 'covers/u1/old.jpg' });
    await expect(service.uploadCover('u1', file(JPEG, 'image/jpeg'))).resolves.toBeDefined();
  });

  it('removes the new object again and rethrows if the database write fails', async () => {
    const { prisma, store, service } = build();
    (prisma.user.update as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(service.uploadCover('u1', file(JPEG, 'image/jpeg'))).rejects.toThrow('db');
    expect(store.delete).toHaveBeenCalledWith((store.upload as jest.Mock).mock.calls[0][1]);
  });

  it('unconfigured storage is the SAME 503 as POST /admin/media/upload and writes nothing', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const real = new S3StorageService(config);
    const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } } as unknown as PrismaService;
    const service = new UserCoverService(prisma, real);

    const err = await service.uploadCover('u1', file(JPEG, 'image/jpeg')).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.message).toContain('Media storage is not configured');
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  describe('deleteCover', () => {
    it('clears all three columns together and removes the object', async () => {
      const { prisma, store, service } = build();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ coverKey: 'covers/u1/a.jpg' });
      await expect(service.deleteCover('u1')).resolves.toEqual({ cover: null });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { coverUrl: null, coverKey: null, coverStatus: null },
        select: { id: true },
      });
      expect(store.delete).toHaveBeenCalledWith('covers/u1/a.jpg');
    });

    it('is a 200 no-op without a cover (no storage call)', async () => {
      const { store, service } = build();
      await expect(service.deleteCover('u1')).resolves.toEqual({ cover: null });
      expect(store.delete).not.toHaveBeenCalled();
    });
  });

  // PARITY: the two profile pictures share their file rules and their no-store
  // behaviour. If one drifts, one of these fails.
  describe('parity with the avatar pipeline', () => {
    const cases: Array<[string, Buffer, string]> = [
      ['jpeg', JPEG, 'image/jpeg'],
      ['png', PNG, 'image/png'],
      ['webp', WEBP, 'image/webp'],
      ['gif', Buffer.from('GIF89a......'), 'image/gif'],
      ['video', Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70]), 'video/mp4'],
      ['mislabelled', PNG, 'image/jpeg'],
      ['not an image', Buffer.from('<html></html>'), 'image/png'],
      ['empty', Buffer.alloc(0), 'image/jpeg'],
    ];

    it.each(cases)('accepts or refuses %s exactly as the avatar does (same status, same message)', async (_n, buf, mime) => {
      const a = build();
      const c = build();
      const outcome = async (run: () => Promise<unknown>) =>
        run().then(
          () => 'accepted',
          (e: Error & { getStatus?: () => number }) => `${e.getStatus?.()}:${e.message}`,
        );
      const avatarResult = await outcome(() => new UserAvatarService(a.prisma, a.store).uploadAvatar('u1', file(buf, mime)));
      const coverResult = await outcome(() => c.service.uploadCover('u1', file(buf, mime)));
      expect(coverResult).toBe(avatarResult);
    });

    it('with no object store both answer the identical 503 body', async () => {
      const config = { get: () => undefined } as unknown as ConfigService;
      const real = new S3StorageService(config);
      const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } } as unknown as PrismaService;
      const a = await new UserAvatarService(prisma, real).uploadAvatar('u1', file(JPEG, 'image/jpeg')).catch((e) => e);
      const c = await new UserCoverService(prisma, real).uploadCover('u1', file(JPEG, 'image/jpeg')).catch((e) => e);
      expect(c.getStatus()).toBe(503);
      expect(c.getResponse()).toEqual(a.getResponse());
    });
  });
});
