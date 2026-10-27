import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DirectUploadStorageService } from './direct-upload-storage.service';

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
export class S3StorageService extends DirectUploadStorageService {
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
    // B-035 (Decision Log #307): on Cloudflare R2 the S3-API endpoint above is
    // authenticated, so `<endpoint>/<bucket>/<key>` is NOT a URL anyone can
    // fetch. When S3_PUBLIC_BASE_URL is set (the bucket's r2.dev subdomain or a
    // custom domain, e.g. https://media.example.com) it is used as the base of
    // every returned URL instead: `<S3_PUBLIC_BASE_URL>/<key>`. Unset keeps the
    // previous behaviour exactly, so nothing changes until it is configured.
    const publicBase = config.get<string>('S3_PUBLIC_BASE_URL')?.trim();
    this.publicUrlBase =
      publicBase && publicBase !== 'replace-me'
        ? publicBase.replace(/\/+$/, '')
        : endpoint
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

  // ---- backend/w14-post-media-pipeline (B-041; Decision Log #419) --------------------------------

  private requireClient(action: string): { client: S3Client; bucket: string; publicUrlBase: string } {
    if (!this.isConfigured || !this.client || !this.bucket || !this.publicUrlBase) {
      throw new ServiceUnavailableException(
        `Media storage is not configured yet — set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY to a real provider before ${action}.`,
      );
    }
    return { client: this.client, bucket: this.bucket, publicUrlBase: this.publicUrlBase };
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    contentLength: number,
    expiresInSeconds: number,
  ): Promise<{ url: string; headers: Record<string, string> }> {
    const { client, bucket } = this.requireClient('creating an upload link');
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType, ContentLength: contentLength }),
      {
        expiresIn: expiresInSeconds,
        // Bind the type and the exact length into the signature (they are otherwise left unsigned).
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return { url, headers: { 'Content-Type': contentType } };
  }

  async head(key: string): Promise<{ size: number; contentType: string | null } | null> {
    const { client, bucket } = this.requireClient('reading an upload');
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return null;
      throw err;
    }
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const { client, bucket } = this.requireClient('reading an upload');
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) throw new Error(`Object ${key} has no body`);
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  }

  async uploadFile(filePath: string, key: string, contentType: string): Promise<string> {
    const { client, bucket, publicUrlBase } = this.requireClient('uploading');
    const { size } = await stat(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: size,
      }),
    );
    return `${publicUrlBase}/${key}`;
  }
}
