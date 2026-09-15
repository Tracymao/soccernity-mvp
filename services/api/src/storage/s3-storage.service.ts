import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';

// The real StorageService implementation — configured ENTIRELY through
// env vars (S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY,
// S3_SECRET_KEY) so it runs unmodified against real AWS S3, Cloudflare
// R2, Backblaze B2, or DigitalOcean Spaces. No vendor-specific SDK
// quirks are hardcoded here — see media/README.md's Decision Log
// candidate for the actual provider choice, still open, mirroring
// Decision Log #26's own "unbundled, cost-aligned for a pre-launch MVP"
// reasoning for hosting generally.
//
// `S3_ENDPOINT` is the one env var that changes behaviour, not just a
// value: leaving it unset targets real AWS S3 (virtual-hosted-style
// URLs, e.g. https://<bucket>.s3.<region>.amazonaws.com/<key>, the AWS
// SDK v3's own default addressing style); setting it targets any other
// S3-compatible provider (path-style URLs, <endpoint>/<bucket>/<key> —
// the more universally-supported addressing style across R2/B2/Spaces/
// self-hosted MinIO). `forcePathStyle` and the public-URL construction
// below both key off the same "is a custom endpoint set" check, so they
// can never disagree with each other.
@Injectable()
export class S3StorageService extends StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly isConfigured: boolean;
  private readonly client?: S3Client;
  private readonly bucket?: string;
  private readonly publicUrlBase?: string;

  constructor(config: ConfigService) {
    super();

    const bucket = config.get<string>('S3_BUCKET')?.trim();
    const accessKeyId = config.get<string>('S3_ACCESS_KEY')?.trim();
    const secretAccessKey = config.get<string>('S3_SECRET_KEY')?.trim();
    const endpoint = config.get<string>('S3_ENDPOINT')?.trim();
    const region = config.get<string>('S3_REGION')?.trim() || 'auto';

    // Same "placeholder still in place" detection this codebase already
    // uses for EMAIL_PROVIDER_API_KEY (registration-email.service.ts) and
    // SENTRY_DSN (instrument.ts) — no real account exists yet (a human
    // action: choosing and provisioning an actual provider, per the
    // still-open Decision Log candidate above), so this stays "wired but
    // inactive" rather than attempting a doomed real network call against
    // literal placeholder credentials.
    this.isConfigured =
      Boolean(bucket) &&
      bucket !== 'replace-me' &&
      Boolean(accessKeyId) &&
      accessKeyId !== 'replace-me' &&
      Boolean(secretAccessKey) &&
      secretAccessKey !== 'replace-me';

    if (!this.isConfigured) {
      this.logger.warn(
        '[storage] S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY not set — wired but inactive. ' +
          'Media uploads will fail with a clear 503 until a real provider is configured.',
      );
      return;
    }

    this.bucket = bucket;
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
    this.publicUrlBase = endpoint
      ? `${endpoint.replace(/\/+$/, '')}/${bucket}`
      : `https://${bucket}.s3.${region}.amazonaws.com`;
  }

  async upload(buffer: Buffer, key: string, contentType: string): Promise<string> {
    if (!this.isConfigured || !this.client || !this.bucket || !this.publicUrlBase) {
      throw new ServiceUnavailableException(
        'Media storage is not configured yet — set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY to a real provider before uploading.',
      );
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    return `${this.publicUrlBase}/${key}`;
  }

  async delete(key: string): Promise<void> {
    if (!this.isConfigured || !this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'Media storage is not configured yet — set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY to a real provider before deleting.',
      );
    }

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
