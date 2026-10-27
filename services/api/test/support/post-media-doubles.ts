import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import type SharpFactory from 'sharp';
import { FfmpegMediaProcessor } from '../../src/modules/post-media/ffmpeg-media-processor';
import { MediaModerationClient } from '../../src/modules/post-media/media-moderation-client';
import { ModerationLabel } from '../../src/modules/post-media/media-moderation-decision.util';
import { MediaProcessor, SanitizedImage, VideoProbe } from '../../src/modules/post-media/media-processor';
import { PostMediaContentType } from '../../src/modules/post-media/media-signature.util';
import { PostMediaConfig } from '../../src/modules/post-media/post-media.config';
import { DirectUploadStorageService } from '../../src/storage/direct-upload-storage.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof SharpFactory;

// backend/w14-post-media-pipeline: the e2e doubles. No object store, no Rekognition account and no ffmpeg
// exist in CI, so the three external seams are replaced with in-memory stand-ins. Images still go through
// the REAL sharp processor (it needs no external tool), so EXIF stripping is proven for real; only the
// video tools are faked.

/** An object store held in a Map. `put()` stands in for the browser's PUT to the one-time link. */
export class InMemoryStorage extends DirectUploadStorageService {
  readonly objects = new Map<string, { buffer: Buffer; contentType: string }>();
  readonly issuedLinks: { key: string; contentType: string; contentLength: number; expiresInSeconds: number }[] = [];
  unavailable = false;
  failDeleteFor = new Set<string>();

  private ensure(): void {
    if (this.unavailable) throw new ServiceUnavailableException('Media storage is not configured yet — set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY');
  }

  /** Simulates the browser PUTting `buffer` to the link issued for `key`. */
  put(key: string, buffer: Buffer, contentType = 'application/octet-stream'): void {
    this.objects.set(key, { buffer, contentType });
  }

  has(key: string): boolean {
    return this.objects.has(key);
  }

  keysWithPrefix(prefix: string): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix));
  }

  async upload(buffer: Buffer, key: string, contentType: string): Promise<string> {
    this.ensure();
    this.objects.set(key, { buffer, contentType });
    return `https://cdn.test/${key}`;
  }

  async delete(key: string): Promise<void> {
    this.ensure();
    if (this.failDeleteFor.has(key)) throw new Error(`delete of ${key} failed`);
    this.objects.delete(key);
  }

  async createUploadUrl(key: string, contentType: string, contentLength: number, expiresInSeconds: number) {
    this.ensure();
    this.issuedLinks.push({ key, contentType, contentLength, expiresInSeconds });
    return { url: `https://upload.test/${key}?len=${contentLength}`, headers: { 'Content-Type': contentType } };
  }

  readonly issuedViewLinks: { key: string; expiresInSeconds: number }[] = [];

  async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    this.ensure();
    this.issuedViewLinks.push({ key, expiresInSeconds });
    return `https://view.test/${key}?ttl=${expiresInSeconds}`;
  }

  async head(key: string) {
    this.ensure();
    const o = this.objects.get(key);
    return o ? { size: o.buffer.length, contentType: o.contentType } : null;
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    this.ensure();
    const o = this.objects.get(key);
    if (!o) throw new Error(`no such object ${key}`);
    await writeFile(destPath, o.buffer);
  }

  async uploadFile(filePath: string, key: string, contentType: string): Promise<string> {
    this.ensure();
    this.objects.set(key, { buffer: await readFile(filePath), contentType });
    return `https://cdn.test/${key}`;
  }
}

/** Real sharp for images; a controllable stand-in for the ffmpeg-based video operations. */
export class TestMediaProcessor extends MediaProcessor {
  private readonly real = new FfmpegMediaProcessor(new PostMediaConfig(new ConfigService({})));
  videoToolsAvailable = true;
  probe: VideoProbe = { durationSeconds: 30, hasVideoStream: true };
  framesToReturn = 3;
  readonly stripCalls: string[] = [];
  readonly frameRequests: number[][] = [];
  frameFailure: Error | null = null;
  private frame: Buffer | null = null;

  async assertVideoToolsAvailable(): Promise<void> {
    if (!this.videoToolsAvailable) throw new ServiceUnavailableException("Video uploads aren't available right now. Please try again later.");
  }

  sanitizeImage(inputPath: string, contentType: PostMediaContentType): Promise<SanitizedImage> {
    return this.real.sanitizeImage(inputPath, contentType);
  }

  shrinkForModeration(image: Buffer, maxBytes: number): Promise<Buffer> {
    return this.real.shrinkForModeration(image, maxBytes);
  }

  async probeVideo(): Promise<VideoProbe> {
    await this.assertVideoToolsAvailable();
    return this.probe;
  }

  /** "Strips" a video by prefixing a marker, so a test can see which bytes were stored. */
  async stripVideo(inputPath: string, outputPath: string): Promise<void> {
    await this.assertVideoToolsAvailable();
    this.stripCalls.push(inputPath);
    await writeFile(outputPath, Buffer.concat([Buffer.from('STRIPPED:'), await readFile(inputPath)]));
  }

  async extractFrames(_inputPath: string, timesSeconds: readonly number[]): Promise<Buffer[]> {
    await this.assertVideoToolsAvailable();
    this.frameRequests.push([...timesSeconds]);
    if (this.frameFailure) throw this.frameFailure;
    this.frame ??= await sharp({ create: { width: 16, height: 16, channels: 3, background: '#888' } }).jpeg().toBuffer();
    return timesSeconds.map(() => this.frame as Buffer);
  }
}

/** Rekognition stand-in. `labelsFor` is called per image sent; calls are recorded. */
export class FakeModerationClient extends MediaModerationClient {
  configured = true;
  labelsFor: (callIndex: number, image: Buffer) => ModerationLabel[] = () => [];
  failTimes = 0;
  /** Awaited inside every call, before the labels are returned: lets a test act "while Rekognition is thinking". */
  onCall: (() => Promise<void>) | null = null;
  readonly calls: { bytes: number; minConfidence: number }[] = [];

  get isConfigured(): boolean {
    return this.configured;
  }

  async detectModerationLabels(image: Buffer, minConfidence: number): Promise<ModerationLabel[]> {
    this.calls.push({ bytes: image.length, minConfidence });
    if (this.onCall) await this.onCall();
    if (this.failTimes > 0) {
      this.failTimes -= 1;
      throw new Error('Rekognition is down');
    }
    return this.labelsFor(this.calls.length - 1, image);
  }
}

/** A real, decodable JPEG, optionally carrying EXIF (so a test can prove it is stripped). */
export async function makeJpeg(opts: { exifCopyright?: string; width?: number; height?: number } = {}): Promise<Buffer> {
  const pipeline = sharp({
    create: { width: opts.width ?? 24, height: opts.height ?? 16, channels: 3, background: '#2a8' },
  }).jpeg();
  return (opts.exifCopyright ? pipeline.withExif({ IFD0: { Copyright: opts.exifCopyright } }) : pipeline).toBuffer();
}

/** Bytes that pass the MP4 signature check; the fake processor does not decode them. */
export function makeMp4(extra = 'video-payload'): Buffer {
  return Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(8), Buffer.from(extra)]);
}

/** An incompressible PNG of roughly side*side*3 bytes (uncompressed), for tests that need a big file. */
export async function makeNoisePng(side: number): Promise<Buffer> {
  const noise = randomBytes(side * side * 3);
  return sharp(noise, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}
