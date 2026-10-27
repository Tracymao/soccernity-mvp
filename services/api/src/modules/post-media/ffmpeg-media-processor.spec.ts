import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import type SharpFactory from 'sharp';
import { FfmpegMediaProcessor } from './ffmpeg-media-processor';
import { UnprocessableMediaError } from './media-processor';
import { PostMediaConfig } from './post-media.config';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof SharpFactory;

const make = (env: Record<string, string> = {}) => new FfmpegMediaProcessor(new PostMediaConfig(new ConfigService(env)));

describe('FfmpegMediaProcessor (real sharp; the ffmpeg tools are absent or bogus on purpose)', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ffmpeg-spec-'));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe('sanitizeImage', () => {
    it('re-encodes a JPEG WITHOUT its EXIF (the GPS/author tags are really gone, not just hidden)', async () => {
      const withExif = await sharp({ create: { width: 24, height: 12, channels: 3, background: '#e22' } })
        .jpeg()
        .withExif({ IFD0: { Copyright: 'secret-photographer', Artist: 'someone@example.com' } })
        .toBuffer();
      expect((await sharp(withExif).metadata()).exif).toBeDefined();
      expect(withExif.toString('latin1')).toContain('secret-photographer');

      const file = path.join(dir, 'exif.jpg');
      await writeFile(file, withExif);
      const out = await make().sanitizeImage(file, 'image/jpeg');

      expect(out.contentType).toBe('image/jpeg');
      expect((await sharp(out.buffer).metadata()).exif).toBeUndefined();
      expect(out.buffer.toString('latin1')).not.toContain('secret-photographer');
      expect(out.buffer.toString('latin1')).not.toContain('someone@example.com');
      expect([out.width, out.height]).toEqual([24, 12]);
    });

    it('applies the EXIF orientation to the pixels before stripping it, so a portrait phone photo does not turn sideways', async () => {
      const rotated = await sharp({ create: { width: 30, height: 10, channels: 3, background: '#0a0' } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer();
      const file = path.join(dir, 'orient.jpg');
      await writeFile(file, rotated);
      const out = await make().sanitizeImage(file, 'image/jpeg');
      expect([out.width, out.height]).toEqual([10, 30]);
      expect((await sharp(out.buffer).metadata()).orientation).toBeUndefined();
    });

    it.each([
      ['image/png', 'png'],
      ['image/webp', 'webp'],
    ] as const)('keeps a %s a %s', async (type, format) => {
      const src = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#33f' } })[format]().toBuffer();
      const file = path.join(dir, `x.${format}`);
      await writeFile(file, src);
      const out = await make().sanitizeImage(file, type);
      expect((await sharp(out.buffer).metadata()).format).toBe(format);
    });

    it('refuses bytes that are not a decodable image (400-class UnprocessableMediaError)', async () => {
      const file = path.join(dir, 'broken.jpg');
      await writeFile(file, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('not really a jpeg')]));
      await expect(make().sanitizeImage(file, 'image/jpeg')).rejects.toBeInstanceOf(UnprocessableMediaError);
    });
  });

  describe('shrinkForModeration', () => {
    it('returns an image that already fits untouched', async () => {
      const small = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#fff' } }).jpeg().toBuffer();
      expect(await make().shrinkForModeration(small, 5 * 1024 * 1024)).toBe(small);
    });

    it('downscales an oversized image to fit, as a JPEG', async () => {
      const noise = Buffer.alloc(900 * 900 * 3);
      for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) >>> 24;
      const big = await sharp(noise, { raw: { width: 900, height: 900, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
      const limit = Math.floor(big.length / 4);
      const out = await make().shrinkForModeration(big, limit);
      expect(out.length).toBeLessThanOrEqual(limit);
      expect((await sharp(out).metadata()).format).toBe('jpeg');
    });
  });

  describe('video tools missing: FAILS CLOSED', () => {
    const missing = () => make({ FFMPEG_PATH: path.join(dir, 'no-such-ffmpeg'), FFPROBE_PATH: path.join(dir, 'no-such-ffprobe') });

    it('assertVideoToolsAvailable throws a 503', async () => {
      await expect(missing().assertVideoToolsAvailable()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('re-checks on every call, so installing the tools takes effect without a restart (a failure is never cached)', async () => {
      const p = missing();
      await expect(p.assertVideoToolsAvailable()).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(p.assertVideoToolsAvailable()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('probeVideo, stripVideo and extractFrames never produce output when the tools are missing', async () => {
      const p = missing();
      const f = path.join(dir, 'v.mp4');
      await writeFile(f, Buffer.alloc(100));
      await expect(p.probeVideo(f)).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(p.stripVideo(f, path.join(dir, 'out.mp4'), 'video/mp4')).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(p.extractFrames(f, [1])).rejects.toBeDefined();
    });
  });
});
