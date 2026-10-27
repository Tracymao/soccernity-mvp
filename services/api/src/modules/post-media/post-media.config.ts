import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModerationThresholds } from './media-moderation-decision.util';

// backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419). Every limit, threshold and
// interval of the pipeline lives in configuration (render.yaml / .env.example) and is read here, once,
// with a validated default. A value that is not a number in range falls back to the default and logs a
// warning, rather than silently producing a nonsense limit.

export const POST_MEDIA_DEFAULTS = {
  imageMaxBytes: 10 * 1024 * 1024,
  videoMaxBytes: 100 * 1024 * 1024,
  videoMaxSeconds: 120,
  maxPerPost: 10,
  uploadLinkTtlSeconds: 900,
  uploadRateLimitMax: 30,
  uploadRateLimitWindowSeconds: 3600,
  quarantineMaxAgeHours: 24,
  // Moderation. Stricter for a minor uploader (more reaches a human, more is auto-rejected).
  passThreshold: 40,
  rejectThreshold: 90,
  passThresholdMinor: 20,
  rejectThresholdMinor: 80,
  rejectCategories: ['Explicit', 'Violence', 'Visually Disturbing', 'Hate Symbols'],
  videoFrameIntervalSeconds: 5,
  videoMaxFrames: 30,
  checkMaxAttempts: 5,
  checkBatchSize: 10,
  // The longest an in-flight check may hold a row before another worker may take it over.
  checkLeaseSeconds: 600,
} as const;

export interface PostMediaLimits {
  imageMaxBytes: number;
  videoMaxBytes: number;
  videoMaxSeconds: number;
  maxPerPost: number;
}

export interface VideoSamplingConfig {
  intervalSeconds: number;
  maxFrames: number;
}

@Injectable()
export class PostMediaConfig {
  private readonly logger = new Logger(PostMediaConfig.name);

  constructor(private readonly config: ConfigService) {}

  private num(key: string, fallback: number, min: number, max: number, integer = true): number {
    const raw = this.config.get<string>(key)?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      this.logger.warn(`${key}="${raw}" is not a ${integer ? 'whole ' : ''}number between ${min} and ${max}; using ${fallback}.`);
      return fallback;
    }
    return n;
  }

  get limits(): PostMediaLimits {
    return {
      imageMaxBytes: this.num('POST_MEDIA_IMAGE_MAX_BYTES', POST_MEDIA_DEFAULTS.imageMaxBytes, 1024, 50 * 1024 * 1024),
      videoMaxBytes: this.num('POST_MEDIA_VIDEO_MAX_BYTES', POST_MEDIA_DEFAULTS.videoMaxBytes, 1024, 500 * 1024 * 1024),
      videoMaxSeconds: this.num('POST_MEDIA_VIDEO_MAX_SECONDS', POST_MEDIA_DEFAULTS.videoMaxSeconds, 1, 3600),
      maxPerPost: this.num('POST_MEDIA_MAX_PER_POST', POST_MEDIA_DEFAULTS.maxPerPost, 1, 10),
    };
  }

  get uploadLinkTtlSeconds(): number {
    return this.num('POST_MEDIA_UPLOAD_LINK_TTL_SECONDS', POST_MEDIA_DEFAULTS.uploadLinkTtlSeconds, 60, 3600);
  }

  get uploadRateLimit(): { max: number; windowSeconds: number } {
    return {
      max: this.num('POST_MEDIA_UPLOAD_RATE_LIMIT_MAX', POST_MEDIA_DEFAULTS.uploadRateLimitMax, 1, 10000),
      windowSeconds: this.num(
        'POST_MEDIA_UPLOAD_RATE_LIMIT_WINDOW_SECONDS',
        POST_MEDIA_DEFAULTS.uploadRateLimitWindowSeconds,
        60,
        7 * 24 * 3600,
      ),
    };
  }

  get quarantineMaxAgeHours(): number {
    return this.num('POST_MEDIA_QUARANTINE_MAX_AGE_HOURS', POST_MEDIA_DEFAULTS.quarantineMaxAgeHours, 1, 24 * 30);
  }

  get ffmpegPath(): string {
    return this.config.get<string>('FFMPEG_PATH')?.trim() || 'ffmpeg';
  }

  get ffprobePath(): string {
    return this.config.get<string>('FFPROBE_PATH')?.trim() || 'ffprobe';
  }

  /** Thresholds for an uploader; stricter for a minor. A pair where reject < pass is invalid and replaced by the defaults. */
  thresholdsFor(uploaderIsMinor: boolean): ModerationThresholds {
    // Literal variable names (not a built-up suffix) so env-completeness.spec.ts can see every one.
    const defPass = uploaderIsMinor ? POST_MEDIA_DEFAULTS.passThresholdMinor : POST_MEDIA_DEFAULTS.passThreshold;
    const defReject = uploaderIsMinor ? POST_MEDIA_DEFAULTS.rejectThresholdMinor : POST_MEDIA_DEFAULTS.rejectThreshold;
    let pass = uploaderIsMinor
      ? this.num('MEDIA_CHECK_PASS_THRESHOLD_MINOR', defPass, 0, 100, false)
      : this.num('MEDIA_CHECK_PASS_THRESHOLD', defPass, 0, 100, false);
    let reject = uploaderIsMinor
      ? this.num('MEDIA_CHECK_REJECT_THRESHOLD_MINOR', defReject, 0, 100, false)
      : this.num('MEDIA_CHECK_REJECT_THRESHOLD', defReject, 0, 100, false);
    if (reject < pass) {
      this.logger.warn(
        `The ${uploaderIsMinor ? 'minor' : 'adult'} reject threshold (${reject}) is below the pass threshold (${pass}); using the defaults.`,
      );
      pass = defPass;
      reject = defReject;
    }
    return { pass, reject, rejectCategories: this.rejectCategories };
  }

  get rejectCategories(): ReadonlySet<string> {
    const raw = this.config.get<string>('MEDIA_CHECK_REJECT_CATEGORIES')?.trim();
    const list = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [...POST_MEDIA_DEFAULTS.rejectCategories];
    return new Set(list.map((s) => s.toLowerCase()));
  }

  get videoSampling(): VideoSamplingConfig {
    return {
      intervalSeconds: this.num('MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS', POST_MEDIA_DEFAULTS.videoFrameIntervalSeconds, 1, 60),
      maxFrames: this.num('MEDIA_CHECK_VIDEO_MAX_FRAMES', POST_MEDIA_DEFAULTS.videoMaxFrames, 1, 100),
    };
  }

  get checkMaxAttempts(): number {
    return this.num('MEDIA_CHECK_MAX_ATTEMPTS', POST_MEDIA_DEFAULTS.checkMaxAttempts, 1, 20);
  }

  get checkBatchSize(): number {
    return this.num('MEDIA_CHECK_BATCH_SIZE', POST_MEDIA_DEFAULTS.checkBatchSize, 1, 100);
  }
}
