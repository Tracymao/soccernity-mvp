import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { execFile } from 'child_process';
import type SharpFactory from 'sharp';
import { MediaProcessor, SanitizedImage, UnprocessableMediaError, VideoProbe } from './media-processor';
import { PostMediaConfig } from './post-media.config';
import { PostMediaContentType } from './media-signature.util';

// sharp 0.35 ships ESM-style typings (`export default`) but a CommonJS runtime whose module IS the factory
// function, and this project compiles to CommonJS without esModuleInterop, so it is loaded with require().
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof SharpFactory;
// Every file sharp reads here is a temp file deleted right afterwards; libvips' file cache would keep it open
// (and locked on Windows), and nothing is ever decoded twice, so the cache buys nothing.
sharp.cache(false);

// The real MediaProcessor: sharp for images, the ffmpeg and ffprobe binaries for video. Neither binary is
// bundled: they must exist on the host (FFMPEG_PATH / FFPROBE_PATH, default `ffmpeg` / `ffprobe` on PATH).
// When they do not, EVERY video operation fails closed with a 503 and nothing is stored.

const PIXEL_LIMIT = 100_000_000; // 100 megapixels: refuses a decompression bomb before sharp decodes it.
const TOOL_TIMEOUT_MS = 120_000;
const FRAME_TIMEOUT_MS = 30_000;
const VIDEO_UNAVAILABLE_MESSAGE = "Video uploads aren't available right now. Please try again later.";

type ErrnoError = Error & { code?: string };

interface RunResult {
  stdout: Buffer;
}

@Injectable()
export class FfmpegMediaProcessor extends MediaProcessor {
  private readonly logger = new Logger(FfmpegMediaProcessor.name);
  private toolsOk: boolean | null = null;

  constructor(private readonly config: PostMediaConfig) {
    super();
  }

  // ---- video tools ------------------------------------------------------------------------------

  async assertVideoToolsAvailable(): Promise<void> {
    // Cache only a success: a missing tool must be re-checked so installing it takes effect without a restart.
    if (this.toolsOk) return;
    try {
      await this.run(this.config.ffmpegPath, ['-version'], 10_000);
      await this.run(this.config.ffprobePath, ['-version'], 10_000);
      this.toolsOk = true;
    } catch (err) {
      this.logger.error(
        `Video tools unavailable (ffmpeg="${this.config.ffmpegPath}", ffprobe="${this.config.ffprobePath}"): ${
          err instanceof Error ? err.message : String(err)
        }. Video uploads are refused (fail closed).`,
      );
      throw new ServiceUnavailableException(VIDEO_UNAVAILABLE_MESSAGE);
    }
  }

  private run(bin: string, args: string[], timeoutMs: number, encoding: 'buffer' = 'buffer'): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      execFile(
        bin,
        args,
        { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, encoding, windowsHide: true },
        (error, stdout, stderr) => {
          if (error) {
            const code = (error as ErrnoError).code;
            const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf8').slice(-400) : '';
            // ENOENT/EACCES = the tool is not there / not runnable: a host problem, not a bad file.
            const e = new Error(`${code ?? 'EXEC_FAILED'}: ${error.message}${detail ? ` | ${detail}` : ''}`);
            (e as ErrnoError).code = code === undefined ? undefined : String(code);
            reject(e);
            return;
          }
          resolve({ stdout: Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout) });
        },
      );
    });
  }

  private isToolMissing(err: unknown): boolean {
    const code = (err as ErrnoError | undefined)?.code;
    return code === 'ENOENT' || code === 'EACCES';
  }

  async probeVideo(inputPath: string): Promise<VideoProbe> {
    try {
      const { stdout } = await this.run(
        this.config.ffprobePath,
        ['-v', 'error', '-print_format', 'json', '-show_entries', 'format=duration:stream=codec_type', inputPath],
        TOOL_TIMEOUT_MS,
      );
      const parsed = JSON.parse(stdout.toString('utf8')) as {
        format?: { duration?: string };
        streams?: { codec_type?: string }[];
      };
      const duration = Number(parsed.format?.duration);
      return {
        durationSeconds: Number.isFinite(duration) ? duration : 0,
        hasVideoStream: (parsed.streams ?? []).some((s) => s.codec_type === 'video'),
      };
    } catch (err) {
      if (this.isToolMissing(err)) throw new ServiceUnavailableException(VIDEO_UNAVAILABLE_MESSAGE);
      throw new UnprocessableMediaError('The video could not be read.');
    }
  }

  async stripVideo(inputPath: string, outputPath: string, contentType: PostMediaContentType): Promise<void> {
    const format = contentType === 'video/webm' ? 'webm' : contentType === 'video/quicktime' ? 'mov' : 'mp4';
    const args = [
      '-nostdin',
      '-y',
      '-v',
      'error',
      '-i',
      inputPath,
      // Only the first video and first audio stream: drops data, subtitle and attachment tracks.
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-map_metadata',
      '-1',
      '-map_metadata:s:v',
      '-1',
      '-map_metadata:s:a',
      '-1',
      '-map_chapters',
      '-1',
      // Copy, never transcode.
      '-c',
      'copy',
      '-fflags',
      '+bitexact',
      '-flags:v',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      ...(format === 'webm' ? [] : ['-movflags', '+faststart']),
      '-f',
      format,
      outputPath,
    ];
    try {
      await this.run(this.config.ffmpegPath, args, TOOL_TIMEOUT_MS);
    } catch (err) {
      if (this.isToolMissing(err)) throw new ServiceUnavailableException(VIDEO_UNAVAILABLE_MESSAGE);
      throw new UnprocessableMediaError('The video could not be processed.');
    }
  }

  async extractFrames(inputPath: string, timesSeconds: readonly number[]): Promise<Buffer[]> {
    const frames: Buffer[] = [];
    for (const t of timesSeconds) {
      const { stdout } = await this.run(
        this.config.ffmpegPath,
        [
          '-nostdin',
          '-v',
          'error',
          '-ss',
          String(t),
          '-i',
          inputPath,
          '-frames:v',
          '1',
          '-vf',
          "scale='min(1280,iw)':-2",
          '-f',
          'image2pipe',
          '-vcodec',
          'mjpeg',
          '-q:v',
          '4',
          'pipe:1',
        ],
        FRAME_TIMEOUT_MS,
      );
      if (stdout.length === 0) throw new Error(`No frame could be extracted at ${t}s`);
      frames.push(stdout);
    }
    return frames;
  }

  // ---- images -----------------------------------------------------------------------------------

  async sanitizeImage(inputPath: string, contentType: PostMediaContentType): Promise<SanitizedImage> {
    try {
      // rotate() applies EXIF orientation to the pixels; sharp then drops ALL metadata by default (no
      // withMetadata()), so the output carries no EXIF/GPS/XMP/IPTC. limitInputPixels bounds the decode.
      const pipeline = sharp(inputPath, { limitInputPixels: PIXEL_LIMIT, failOn: 'error' }).rotate();
      const encoded =
        contentType === 'image/png'
          ? pipeline.png()
          : contentType === 'image/webp'
            ? pipeline.webp({ quality: 90 })
            : pipeline.jpeg({ quality: 90, mozjpeg: true });
      const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
      return { buffer: data, contentType, width: info.width, height: info.height };
    } catch {
      throw new UnprocessableMediaError('The image could not be read.');
    }
  }

  async shrinkForModeration(image: Buffer, maxBytes: number): Promise<Buffer> {
    if (image.length <= maxBytes) return image;
    let edge = 2048;
    let quality = 80;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const out = await sharp(image, { limitInputPixels: PIXEL_LIMIT })
        .rotate()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
      if (out.length <= maxBytes) return out;
      edge = Math.floor(edge * 0.7);
      quality = Math.max(40, quality - 10);
    }
    throw new Error('The image could not be reduced to the moderation size limit.');
  }
}
