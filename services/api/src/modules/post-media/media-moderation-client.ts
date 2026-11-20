import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { ModerationLabel } from './media-moderation-decision.util';

// backend/w14-post-media-pipeline (B-036; Decision Log #419 item 4). The automatic check's one external
// dependency, behind an abstract class so the service logic is tested against an in-memory fake and the
// real Amazon Rekognition client is wired only through configuration.
//
// What is SENT to Rekognition (for the DPIA drafter): one still image per call, as bytes in the request
// body -- the uploaded photo itself, or one sampled frame of an uploaded video, at most 5 MB (larger
// images are downscaled for the check only). No user id, no account data, no filename, no URL and no
// text accompanies it. What comes BACK: a list of moderation labels (category name, parent category name,
// confidence). Of that, only the category NAMES at or above the pass threshold are stored.

/** Rekognition's DetectModerationLabels accepts at most 5 MB of image bytes. */
export const MODERATION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export abstract class MediaModerationClient {
  /** False when no credentials are configured: the check then does not run at all (nothing is approved). */
  abstract get isConfigured(): boolean;

  /** Labels for one image, at or above `minConfidence` (0-100). Throws on any service failure. */
  abstract detectModerationLabels(image: Buffer, minConfidence: number): Promise<ModerationLabel[]>;
}

@Injectable()
export class RekognitionMediaModerationClient extends MediaModerationClient {
  private readonly logger = new Logger(RekognitionMediaModerationClient.name);
  private readonly client?: RekognitionClient;

  constructor(config: ConfigService) {
    super();
    const accessKeyId = config.get<string>('REKOGNITION_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = config.get<string>('REKOGNITION_SECRET_ACCESS_KEY')?.trim();
    // EU region by default (Decision Log #391: everything is hosted in the EU).
    const region = config.get<string>('REKOGNITION_REGION')?.trim() || 'eu-west-1';

    // The same "placeholder still in place" detection the S3 / Postmark / Stripe clients use.
    const configured =
      Boolean(accessKeyId) && accessKeyId !== 'replace-me' && Boolean(secretAccessKey) && secretAccessKey !== 'replace-me';
    if (!configured) {
      this.logger.warn(
        '[media-check] REKOGNITION_ACCESS_KEY_ID/REKOGNITION_SECRET_ACCESS_KEY not set — wired but inactive. ' +
          'Uploaded media will stay pending for a moderator and is never approved automatically.',
      );
      return;
    }
    this.client = new RekognitionClient({ region, credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } });
  }

  get isConfigured(): boolean {
    return this.client !== undefined;
  }

  async detectModerationLabels(image: Buffer, minConfidence: number): Promise<ModerationLabel[]> {
    if (!this.client) throw new Error('Rekognition is not configured');
    const res = await this.client.send(
      new DetectModerationLabelsCommand({ Image: { Bytes: image }, MinConfidence: minConfidence }),
    );
    return (res.ModerationLabels ?? []).map((l) => ({
      name: l.Name ?? 'Unknown',
      parentName: l.ParentName ? l.ParentName : null,
      confidence: l.Confidence ?? 0,
    }));
  }
}
