import { ConfigService } from '@nestjs/config';
import { POST_MEDIA_DEFAULTS, PostMediaConfig } from './post-media.config';

const cfg = (env: Record<string, string> = {}) => new PostMediaConfig(new ConfigService(env));

describe('PostMediaConfig', () => {
  it('defaults match the founder-stated limits (Decision Log #419)', () => {
    const c = cfg();
    expect(c.limits).toEqual({ imageMaxBytes: 10 * 1024 * 1024, videoMaxBytes: 100 * 1024 * 1024, videoMaxSeconds: 120, maxPerPost: 10 });
    expect(c.quarantineMaxAgeHours).toBe(24);
    expect(c.uploadLinkTtlSeconds).toBe(900);
    expect(c.uploadRateLimit).toEqual({ max: 30, windowSeconds: 3600 });
    expect(c.ffmpegPath).toBe('ffmpeg');
    expect(c.ffprobePath).toBe('ffprobe');
  });

  it('reads overrides from configuration', () => {
    const c = cfg({ POST_MEDIA_VIDEO_MAX_SECONDS: '60', POST_MEDIA_IMAGE_MAX_BYTES: '2048', FFMPEG_PATH: '/opt/ff/ffmpeg', POST_MEDIA_UPLOAD_RATE_LIMIT_MAX: '3' });
    expect(c.limits.videoMaxSeconds).toBe(60);
    expect(c.limits.imageMaxBytes).toBe(2048);
    expect(c.ffmpegPath).toBe('/opt/ff/ffmpeg');
    expect(c.uploadRateLimit.max).toBe(3);
  });

  it('a value that is not a whole number in range falls back to the default instead of producing a nonsense limit', () => {
    const c = cfg({
      POST_MEDIA_VIDEO_MAX_SECONDS: 'abc',
      POST_MEDIA_IMAGE_MAX_BYTES: '-5',
      POST_MEDIA_MAX_PER_POST: '99',
      POST_MEDIA_UPLOAD_LINK_TTL_SECONDS: '1.5',
    });
    expect(c.limits.videoMaxSeconds).toBe(POST_MEDIA_DEFAULTS.videoMaxSeconds);
    expect(c.limits.imageMaxBytes).toBe(POST_MEDIA_DEFAULTS.imageMaxBytes);
    expect(c.limits.maxPerPost).toBe(10); // capped at the DTO's own maximum
    expect(c.uploadLinkTtlSeconds).toBe(POST_MEDIA_DEFAULTS.uploadLinkTtlSeconds);
  });

  describe('moderation thresholds', () => {
    it('a minor uploader gets stricter defaults than an adult', () => {
      const c = cfg();
      const adult = c.thresholdsFor(false);
      const minor = c.thresholdsFor(true);
      expect(minor.pass).toBeLessThan(adult.pass);
      expect(minor.reject).toBeLessThan(adult.reject);
    });

    it('reads each pair from its own variables', () => {
      const c = cfg({
        MEDIA_CHECK_PASS_THRESHOLD: '55',
        MEDIA_CHECK_REJECT_THRESHOLD: '95',
        MEDIA_CHECK_PASS_THRESHOLD_MINOR: '10',
        MEDIA_CHECK_REJECT_THRESHOLD_MINOR: '70',
      });
      expect(c.thresholdsFor(false)).toMatchObject({ pass: 55, reject: 95 });
      expect(c.thresholdsFor(true)).toMatchObject({ pass: 10, reject: 70 });
    });

    it('a reject threshold below the pass threshold is invalid: BOTH values fall back to the defaults', () => {
      const c = cfg({ MEDIA_CHECK_PASS_THRESHOLD: '80', MEDIA_CHECK_REJECT_THRESHOLD: '50' });
      expect(c.thresholdsFor(false)).toMatchObject({ pass: POST_MEDIA_DEFAULTS.passThreshold, reject: POST_MEDIA_DEFAULTS.rejectThreshold });
    });

    it('the reject categories are configurable, trimmed and compared case-insensitively', () => {
      const c = cfg({ MEDIA_CHECK_REJECT_CATEGORIES: ' Explicit , Gambling ,' });
      expect([...c.rejectCategories].sort()).toEqual(['explicit', 'gambling']);
      expect(cfg().rejectCategories.has('explicit')).toBe(true);
    });
  });

  it('video sampling and retry settings have bounded defaults', () => {
    const c = cfg();
    expect(c.videoSampling).toEqual({ intervalSeconds: 5, maxFrames: 30 });
    expect(c.checkMaxAttempts).toBe(5);
    expect(c.checkBatchSize).toBe(10);
    expect(cfg({ MEDIA_CHECK_VIDEO_MAX_FRAMES: '12', MEDIA_CHECK_VIDEO_FRAME_INTERVAL_SECONDS: '2' }).videoSampling).toEqual({ intervalSeconds: 2, maxFrames: 12 });
  });
});
