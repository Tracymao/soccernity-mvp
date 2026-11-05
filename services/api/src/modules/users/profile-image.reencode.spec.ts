import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access } from 'fs/promises';
import type SharpFactory from 'sharp';
import { PrismaService } from '../../prisma/prisma.service';
import { S3StorageService } from '../../storage/s3-storage.service';
import { StorageService } from '../../storage/storage.service';
import { FfmpegMediaProcessor } from '../post-media/ffmpeg-media-processor';
import { MediaProcessor } from '../post-media/media-processor';
import { PostMediaConfig } from '../post-media/post-media.config';
import { PROFILE_IMAGE_UNSUPPORTED_MESSAGE } from './profile-image.util';
import { UserAvatarService } from './user-avatar.service';
import { UserCoverService } from './user-cover.service';

// B-205 (Decision Log #468 item 3): every avatar and cover photo is re-encoded through the SAME
// MediaProcessor.sanitizeImage the post images use, before anything is stored. These tests run the REAL
// processor (real sharp), the way ffmpeg-media-processor.spec.ts does, against both services, so a drift
// between avatar and cover shows up here.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof SharpFactory;

const SECRET_ARTIST = 'secret-photographer@example.com';
const SECRET_COPYRIGHT = 'secret-copyright-holder';

function realProcessor(): MediaProcessor {
  return new FfmpegMediaProcessor(new PostMediaConfig(new ConfigService({})));
}

// A JPEG that carries author tags, GPS tags and a sideways orientation flag (30x10 pixels, orientation 6).
async function exifJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 30, height: 10, channels: 3, background: '#e22' } })
    .jpeg()
    .withExif({
      IFD0: { Artist: SECRET_ARTIST, Copyright: SECRET_COPYRIGHT },
      IFD3: { GPSLatitudeRef: 'N', GPSLongitudeRef: 'E' },
    })
    .withMetadata({ orientation: 6 })
    .toBuffer();
}

type Kind = 'avatar' | 'cover';
const CASES: Kind[] = ['avatar', 'cover'];

function build(kind: Kind, processor: MediaProcessor = realProcessor(), storage: Partial<StorageService> = {}) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ avatarKey: null, coverKey: null }),
      update: jest.fn().mockResolvedValue({ id: 'u1' }),
    },
  } as unknown as PrismaService;
  const store = {
    upload: jest.fn().mockResolvedValue('https://cdn.example/stored'),
    delete: jest.fn().mockResolvedValue(undefined),
    ...storage,
  } as unknown as StorageService;
  const upload = (buffer: Buffer, mimetype: string) => {
    const file = { buffer, mimetype, size: buffer.length, originalname: 'p' };
    return kind === 'avatar'
      ? new UserAvatarService(prisma, store, processor).uploadAvatar('u1', file)
      : new UserCoverService(prisma, store, processor).uploadCover('u1', file);
  };
  return { prisma, store, upload };
}

const CORRUPT_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really a jpeg, just a start')]);

describe.each(CASES)('%s upload: metadata re-encode (B-205)', (kind) => {
  it('stores bytes with the author and GPS tags really gone, never the original', async () => {
    const original = await exifJpeg();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    expect(original.toString('latin1')).toContain(SECRET_ARTIST);

    const { store, upload } = build(kind);
    await upload(original, 'image/jpeg');

    const [stored, , contentType] = (store.upload as jest.Mock).mock.calls[0] as [Buffer, string, string];
    expect(stored.equals(original)).toBe(false);
    expect(contentType).toBe('image/jpeg');
    const latin = stored.toString('latin1');
    expect(latin).not.toContain(SECRET_ARTIST);
    expect(latin).not.toContain(SECRET_COPYRIGHT);
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
  });

  it('applies the orientation to the pixels first (a portrait phone photo is not stored sideways)', async () => {
    const { store, upload } = build(kind);
    await upload(await exifJpeg(), 'image/jpeg');
    const stored = (store.upload as jest.Mock).mock.calls[0][0] as Buffer;
    const meta = await sharp(stored).metadata();
    expect([meta.width, meta.height]).toEqual([10, 30]);
    expect(meta.orientation).toBeUndefined();
  });

  it('adds no resize: the stored picture has the pixel size of the upload (after orientation)', async () => {
    const big = await sharp({ create: { width: 3000, height: 1200, channels: 3, background: '#06c' } }).jpeg().toBuffer();
    const { store, upload } = build(kind);
    await upload(big, 'image/jpeg');
    const meta = await sharp((store.upload as jest.Mock).mock.calls[0][0] as Buffer).metadata();
    expect([meta.width, meta.height]).toEqual([3000, 1200]);
  });

  it.each([
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ] as const)('keeps a %s a %s (the output type is the input type, as for post images)', async (mime, format) => {
    const src = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#33f' } })[format]().toBuffer();
    const { store, upload } = build(kind);
    await upload(src, mime);
    const [stored, key, contentType] = (store.upload as jest.Mock).mock.calls[0] as [Buffer, string, string];
    expect((await sharp(stored).metadata()).format).toBe(format);
    expect(contentType).toBe(mime);
    expect(key).toMatch(new RegExp(`\\.${format}$`));
  });

  it('refuses a file that passes the magic-byte check but cannot be decoded: 400, nothing stored, no database write', async () => {
    const { prisma, store, upload } = build(kind);
    const err = await upload(CORRUPT_JPEG, 'image/jpeg').catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.message).toBe(PROFILE_IMAGE_UNSUPPORTED_MESSAGE);
    expect(store.upload).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('keeps the 503 for an unconfigured object store, with the friendly message and no database write', async () => {
    const real = new S3StorageService({ get: () => undefined } as unknown as ConfigService);
    const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } } as unknown as PrismaService;
    const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer();
    const file = { buffer: image, mimetype: 'image/jpeg', size: image.length, originalname: 'p' };
    const attempt =
      kind === 'avatar'
        ? new UserAvatarService(prisma, real, realProcessor()).uploadAvatar('u1', file)
        : new UserCoverService(prisma, real, realProcessor()).uploadCover('u1', file);
    const err = await attempt.catch((e) => e);
    expect(err).toBeInstanceOf(ServiceUnavailableException);
    expect(err.message).toBe("Picture uploads aren't available right now. Please try again later.");
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('does not leave its temp file behind, on success or on a corrupt file', async () => {
    const real = realProcessor();
    const paths: string[] = [];
    const spy = {
      sanitizeImage: (p: string, t: Parameters<MediaProcessor['sanitizeImage']>[1]) => {
        paths.push(p);
        return real.sanitizeImage(p, t);
      },
    } as unknown as MediaProcessor;
    const ok = build(kind, spy);
    await ok.upload(await exifJpeg(), 'image/jpeg');
    const bad = build(kind, spy);
    await bad.upload(CORRUPT_JPEG, 'image/jpeg').catch(() => undefined);
    expect(paths).toHaveLength(2);
    for (const p of paths) await expect(access(p)).rejects.toBeDefined();
  });
});

describe('avatar and cover share one re-encode (no drift)', () => {
  it('store byte-identical output for the same input', async () => {
    const input = await exifJpeg();
    const a = build('avatar');
    const c = build('cover');
    await a.upload(input, 'image/jpeg');
    await c.upload(input, 'image/jpeg');
    const sa = (a.store.upload as jest.Mock).mock.calls[0][0] as Buffer;
    const sc = (c.store.upload as jest.Mock).mock.calls[0][0] as Buffer;
    expect(sa.equals(sc)).toBe(true);
  });
});
