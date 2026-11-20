import { PostMediaContentType } from './media-signature.util';

// backend/w14-post-media-pipeline (B-041; Decision Log #419 items 2 and 3). The file-processing seam:
// everything that touches the bytes of an upload (re-encoding an image without its metadata, probing and
// remuxing a video, sampling frames for the automatic check) sits behind this abstract class, so the
// service logic is tested against a fake and the real implementation (sharp + the ffmpeg binaries) is
// tested on its own.

export interface SanitizedImage {
  buffer: Buffer;
  contentType: PostMediaContentType;
  width: number;
  height: number;
}

export interface VideoProbe {
  durationSeconds: number;
  hasVideoStream: boolean;
}

export abstract class MediaProcessor {
  /**
   * Fails closed: throws a 503 (ServiceUnavailableException) when the video tools (ffmpeg and ffprobe)
   * are not available on this host. Called when an upload LINK is requested and again before a video is
   * processed, so a video is never accepted, stored or approved without its metadata being stripped.
   */
  abstract assertVideoToolsAvailable(): Promise<void>;

  /**
   * Re-encodes an image with ALL metadata removed (EXIF, GPS, XMP, IPTC; orientation is applied first so
   * the picture does not turn sideways). Throws a 400-class error (UnprocessableMediaError) when the bytes
   * are not a decodable image or are absurdly large in pixels.
   */
  abstract sanitizeImage(inputPath: string, contentType: PostMediaContentType): Promise<SanitizedImage>;

  /** Reads a video's duration and whether it has a video stream. Throws UnprocessableMediaError on a broken file. */
  abstract probeVideo(inputPath: string): Promise<VideoProbe>;

  /**
   * Remuxes a video into `outputPath` WITHOUT transcoding (streams copied) and WITHOUT metadata: global,
   * stream and chapter metadata dropped, and only the first video and first audio stream kept (so a
   * data/GPS/subtitle track cannot ride along). Same container as the input.
   */
  abstract stripVideo(inputPath: string, outputPath: string, contentType: PostMediaContentType): Promise<void>;

  /** One JPEG per requested time (seconds), for the automatic check. Never written to storage. */
  abstract extractFrames(inputPath: string, timesSeconds: readonly number[]): Promise<Buffer[]>;

  /**
   * A copy of an image that fits `maxBytes` (and is JPEG), for the moderation API only. The original is
   * untouched. Returns the input as-is when it already fits.
   */
  abstract shrinkForModeration(image: Buffer, maxBytes: number): Promise<Buffer>;
}

/** The uploaded bytes are not a valid file of the declared kind (corrupt, too many pixels, no video stream). */
export class UnprocessableMediaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnprocessableMediaError';
  }
}
