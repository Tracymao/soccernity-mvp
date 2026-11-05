import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'fs/promises';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../../storage/s3-storage.service';
import { DirectUploadStorageService } from '../../storage/direct-upload-storage.service';
import { MediaProcessor } from '../post-media/media-processor';
import { ProfileImageViewService } from './profile-image-view.service';
import { AVATAR_UNSUPPORTED_MESSAGE, UserAvatarService } from './user-avatar.service';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBPVP8 ')]);

// The pre-B-205 tests below pin validation, store-before-write ordering and the 503 using fake bytes
// that only pass the magic-byte check, so the re-encode step is a pass-through here. The re-encode itself
// (metadata gone, orientation applied, corrupt file = 400) is proven with real sharp in
// profile-image.reencode.spec.ts.
const PASSTHROUGH = {
  sanitizeImage: async (inputPath: string, contentType: string) => ({
    buffer: await readFile(inputPath),
    contentType,
    width: 1,
    height: 1,
  }),
} as unknown as MediaProcessor;

function file(buffer: Buffer, mimetype: string) {
  return { buffer, mimetype, size: buffer.length, originalname: 'me.jpg' };
}

function build(storage: Partial<DirectUploadStorageService> = {}) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue({ avatarKey: null }), update: jest.fn().mockResolvedValue({ id: 'u1' }) },
  } as unknown as PrismaService;
  const store = {
    // upload() would return the URL of the PRIVATE key (not a URL anyone may use); the service must ignore it.
    upload: jest.fn().mockImplementation(async (_b: Buffer, key: string) => `https://cdn.example/${key}`),
    delete: jest.fn().mockResolvedValue(undefined),
    publicUrlFor: jest.fn().mockImplementation((key: string) => `https://cdn.example/${key}`),
    createDownloadUrl: jest.fn().mockResolvedValue('https://signed.example/view?sig=1'),
    ...storage,
  } as unknown as DirectUploadStorageService;
  return { prisma, store, service: new UserAvatarService(prisma, store, new ProfileImageViewService(store), PASSTHROUGH) };
}

describe('UserAvatarService (B-035)', () => {
  it('stores the object, then records it as PENDING (never approved by an upload)', async () => {
    const { prisma, store, service } = build();
    const res = await service.uploadAvatar('u1', file(JPEG, 'image/jpeg'));

    const [, key, type] = (store.upload as jest.Mock).mock.calls[0];
    // B-036: stored in the PRIVATE prefix, never under a prefix the public address could serve.
    expect(key).toMatch(/^private-profile\/u1\/[0-9a-f-]{36}\.jpg$/);
    expect(type).toBe('image/jpeg');
    // The owner is handed a short-lived signed link to the private file, never a public address.
    expect(res).toEqual({ avatar: { url: 'https://signed.example/view?sig=1', status: 'pending', rejectionReason: null } });
    expect(store.createDownloadUrl).toHaveBeenCalledWith(key, 300);
    // The row stores the file's PRIVATE key and its FUTURE public URL (profile-media/), built not fetched.
    const publicKey = key.replace('private-profile/', 'profile-media/');
    expect(store.publicUrlFor).toHaveBeenCalledWith(publicKey);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { avatarUrl: `https://cdn.example/${publicKey}`, avatarKey: key, avatarStatus: 'pending', avatarRejectionReason: null, avatarUploadedAt: expect.any(Date) },
      select: { id: true },
    });
    // The response never contains the public URL of a pending picture.
    expect(JSON.stringify(res)).not.toContain('profile-media');
    expect(JSON.stringify(res)).not.toContain('private-profile');
  });

  it.each([
    ['image/png', PNG, 'png'],
    ['image/webp', WEBP, 'webp'],
  ])('accepts %s', async (mime, buf, ext) => {
    const { store, service } = build();
    await service.uploadAvatar('u1', file(buf, mime));
    expect((store.upload as jest.Mock).mock.calls[0][1]).toMatch(new RegExp(`\\.${ext}$`));
  });

  it('refuses a missing or empty file with 400 and touches neither storage nor the database', async () => {
    const { prisma, store, service } = build();
    await expect(service.uploadAvatar('u1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadAvatar('u1', file(Buffer.alloc(0), 'image/jpeg'))).rejects.toBeInstanceOf(BadRequestException);
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
    await expect(service.uploadAvatar('u1', file(buf, mime))).rejects.toThrow(AVATAR_UNSUPPORTED_MESSAGE);
    expect(store.upload).not.toHaveBeenCalled();
  });

  it('a signed link that cannot be made gives url null, never a failure or a public address', async () => {
    const { service } = build({ createDownloadUrl: jest.fn().mockRejectedValue(new Error('r2 down')) });
    await expect(service.uploadAvatar('u1', file(JPEG, 'image/jpeg'))).resolves.toEqual({
      avatar: { url: null, status: 'pending', rejectionReason: null },
    });
  });

  it('removes the PREVIOUS object after a successful replace, best effort', async () => {
    const { prisma, store, service } = build();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: 'private-profile/u1/old.jpg' });
    await service.uploadAvatar('u1', file(JPEG, 'image/jpeg'));
    expect(store.delete).toHaveBeenCalledWith('private-profile/u1/old.jpg');
  });

  it('a failure removing the old object never fails the upload', async () => {
    const { prisma, service } = build({ delete: jest.fn().mockRejectedValue(new Error('r2 down')) });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: 'private-profile/u1/old.jpg' });
    await expect(service.uploadAvatar('u1', file(JPEG, 'image/jpeg'))).resolves.toBeDefined();
  });

  it('removes the new object again and rethrows if the database write fails', async () => {
    const { prisma, store, service } = build();
    (prisma.user.update as jest.Mock).mockRejectedValue(new Error('db'));
    await expect(service.uploadAvatar('u1', file(JPEG, 'image/jpeg'))).rejects.toThrow('db');
    expect(store.delete).toHaveBeenCalledWith((store.upload as jest.Mock).mock.calls[0][1]);
  });

  it('unconfigured storage is a 503 with a friendly message (no S3_* detail) and writes nothing', async () => {
    // The real S3StorageService with its placeholder credentials: the exact object
    // the admin media route uses when no store is configured.
    const config = { get: () => undefined } as unknown as ConfigService;
    const real = new S3StorageService(config);
    const prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
    } as unknown as PrismaService;
    const service = new UserAvatarService(prisma, real, new ProfileImageViewService(real), PASSTHROUGH);

    const err = await service.uploadAvatar('u1', file(JPEG, 'image/jpeg')).catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.message).toBe("Picture uploads aren't available right now. Please try again later.");
    expect(err.message).not.toMatch(/S3_|environment|configured/i);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the S3_* detail in the server log and out of the response (D-20)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      const config = { get: () => undefined } as unknown as ConfigService;
      const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } } as unknown as PrismaService;
      const real = new S3StorageService(config);
      const service = new UserAvatarService(prisma, real, new ProfileImageViewService(real), PASSTHROUGH);
      const err = await service.uploadAvatar('u1', file(JPEG, 'image/jpeg')).catch((e) => e);
      expect(err.message).not.toMatch(/S3_/);
      expect(warn.mock.calls.some(([m]) => /S3_BUCKET/.test(String(m)))).toBe(true);
    } finally {
      warn.mockRestore();
    }
  });

  describe('deleteAvatar', () => {
    it('clears all three columns together and removes the object', async () => {
      const { prisma, store, service } = build();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ avatarKey: 'private-profile/u1/a.jpg' });
      await expect(service.deleteAvatar('u1')).resolves.toEqual({ avatar: null });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { avatarUrl: null, avatarKey: null, avatarStatus: null, avatarRejectionReason: null, avatarUploadedAt: null },
        select: { id: true },
      });
      expect(store.delete).toHaveBeenCalledWith('private-profile/u1/a.jpg');
    });

    it('is a 200 no-op without an avatar (no storage call)', async () => {
      const { store, service } = build();
      await expect(service.deleteAvatar('u1')).resolves.toEqual({ avatar: null });
      expect(store.delete).not.toHaveBeenCalled();
    });
  });
});
