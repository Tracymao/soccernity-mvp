import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DirectUploadStorageService, ListedObject, StorageListNotPermittedError } from './direct-upload-storage.service';
import { isPublicKey, isPublicPrefix } from './storage-prefixes';

// The real StorageService implementation — configured ENTIRELY through
// env vars (S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY,
// S3_SECRET_KEY) so it runs unmodified against real AWS S3, Cloudflare
// R2, Backblaze B2, or DigitalOcean Spaces. No vendor-specific SDK
// quirks are hardcoded here — see media/README.md's Decision Log
// candidate for the actual provider choice, still open, mirroring
// Decision Log #26's own "unbundled, cost-aligned for a pre-launch MVP"
// reasoning for hosting generally.
//
// B-265 (two buckets): S3_BUCKET is the PUBLIC bucket (the only one S3_PUBLIC_BASE_URL serves) and
// S3_PRIVATE_BUCKET holds everything else (see storage-prefixes.ts for the public allow-list). Same
// endpoint, region and key pair for both. Without S3_PRIVATE_BUCKET this is the single-bucket
// development mode; production refuses to start that way (validate-runtime-env.ts).
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
  // The PUBLIC bucket in two-bucket mode; the one and only bucket in single-bucket mode.
  private readonly bucket?: string;
  // B-265: the PRIVATE bucket (S3_PRIVATE_BUCKET). Undefined = single-bucket mode (development only).
  private readonly privateBucket?: string;
  private readonly publicUrlBase?: string;

  constructor(config: ConfigService) {
    super();

    const bucket = config.get<string>('S3_BUCKET')?.trim();
    const privateBucketRaw = config.get<string>('S3_PRIVATE_BUCKET')?.trim();
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
    // Two-bucket mode only when a real, DIFFERENT private bucket is named.
    if (privateBucketRaw && privateBucketRaw !== 'replace-me' && privateBucketRaw !== bucket) {
      this.privateBucket = privateBucketRaw;
    } else {
      this.logger.warn(
        '[storage] S3_PRIVATE_BUCKET is not set (or equals S3_BUCKET) — SINGLE-BUCKET mode: private files ' +
          '(pending, held and rejected media, quarantine, data exports) share the bucket with public files. ' +
          'For local development and tests only; production refuses to start in this state.',
      );
    }
    this.client = new S3Client({
      region,
      endpoint: endpoint || undefined,
      forcePathStyle: Boolean(endpoint),
      credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
    });
    // B-035 (Decision Log #307): on Cloudflare R2 the S3-API endpoint above is
    // authenticated, so `<endpoint>/<bucket>/<key>` is NOT a URL anyone can
    // fetch. When S3_PUBLIC_BASE_URL is set (a custom domain on the PUBLIC bucket,
    // e.g. https://media.soccernity.com) it is used as the base of
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

  /**
   * B-265: the bucket an object key lives in. Two-bucket mode: the public bucket for the allow-listed public
   * prefixes (storage-prefixes.ts), the private bucket for EVERYTHING else. Single-bucket mode: the one bucket.
   * Callers never see this; they pass keys only.
   */
  bucketFor(key: string): string {
    const { bucket } = this.requireClient('choosing a bucket');
    return this.privateBucket && !isPublicKey(key) ? this.privateBucket : bucket;
  }

  /** True when a distinct private bucket is configured (two-bucket mode). */
  get isTwoBucket(): boolean {
    return Boolean(this.privateBucket);
  }

  /** What upload() returns for `key`: its public URL, or '' for a private object in two-bucket mode (it has none). */
  private addressFor(key: string, publicUrlBase: string): string {
    return this.privateBucket && !isPublicKey(key) ? '' : `${publicUrlBase}/${key}`;
  }

  async upload(buffer: Buffer, key: string, contentType: string): Promise<string> {
    if (!this.isConfigured || !this.client || !this.bucket || !this.publicUrlBase) {
      throw new ServiceUnavailableException(
        'Media storage is not configured yet — set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY to a real provider before uploading.',
      );
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(key),
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );

    // A private object has no public address: '' in two-bucket mode (never a servable-looking URL).
    return this.addressFor(key, this.publicUrlBase);
  }

  async delete(key: string): Promise<void> {
    if (!this.isConfigured || !this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'Media storage is not configured yet — set S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY to a real provider before deleting.',
      );
    }

    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketFor(key), Key: key }));
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
    const { client } = this.requireClient('creating an upload link');
    // The browser PUT goes to quarantine/, which is private: the link is signed against the PRIVATE bucket.
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: this.bucketFor(key), Key: key, ContentType: contentType, ContentLength: contentLength }),
      {
        expiresIn: expiresInSeconds,
        // Bind the type and the exact length into the signature (they are otherwise left unsigned).
        signableHeaders: new Set(['content-type', 'content-length']),
      },
    );
    return { url, headers: { 'Content-Type': contentType } };
  }

  async createDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { client } = this.requireClient('creating a view link');
    return getSignedUrl(client, new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key }), { expiresIn: expiresInSeconds });
  }

  async head(key: string): Promise<{ size: number; contentType: string | null } | null> {
    const { client } = this.requireClient('reading an upload');
    try {
      const res = await client.send(new HeadObjectCommand({ Bucket: this.bucketFor(key), Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === 'NotFound' || name === 'NoSuchKey' || status === 404) return null;
      throw err;
    }
  }

  async downloadToFile(key: string, destPath: string): Promise<void> {
    const { client } = this.requireClient('reading an upload');
    const res = await client.send(new GetObjectCommand({ Bucket: this.bucketFor(key), Key: key }));
    if (!res.Body) throw new Error(`Object ${key} has no body`);
    await pipeline(res.Body as Readable, createWriteStream(destPath));
  }

  async uploadFile(filePath: string, key: string, contentType: string): Promise<string> {
    const { client, publicUrlBase } = this.requireClient('uploading');
    const { size } = await stat(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucketFor(key),
        Key: key,
        Body: createReadStream(filePath),
        ContentType: contentType,
        ContentLength: size,
      }),
    );
    return this.addressFor(key, publicUrlBase);
  }

  // ---- backend/media-privacy-vetting-followups (B-257; Decision Log #430 item 2) -------------------

  /**
   * B-265: approve (private to public) and hold (public back to private) now cross buckets. The destination
   * bucket is the request's Bucket; CopySource is "<source bucket>/<key>". Cloudflare's R2 S3 documentation lists
   * CopyObject and x-amz-copy-source as supported but does NOT say whether the source may be in another bucket of
   * the account, so if the store refuses a cross-bucket CopyObject this falls back to reading the object and
   * writing it to the destination through the API (via a temp file, never memory). Same-bucket copies never fall
   * back. The caller verifies the copy with head() either way.
   */
  async copyObject(sourceKey: string, destKey: string, contentType: string): Promise<void> {
    const { client } = this.requireClient('copying a file');
    const sourceBucket = this.bucketFor(sourceKey);
    const destBucket = this.bucketFor(destKey);
    try {
      await client.send(
        new CopyObjectCommand({
          Bucket: destBucket,
          // The SDK requires CopySource as "<bucket>/<key>", URL-encoded per path segment.
          CopySource: `${sourceBucket}/${sourceKey.split('/').map(encodeURIComponent).join('/')}`,
          Key: destKey,
          ContentType: contentType,
          MetadataDirective: 'REPLACE',
        }),
      );
    } catch (err) {
      if (sourceBucket === destBucket) throw err;
      this.logger.warn(
        `[storage] cross-bucket CopyObject refused (${(err as { name?: string }).name ?? 'error'}); copying through the API instead`,
      );
      await this.copyThroughApi(client, sourceBucket, sourceKey, destBucket, destKey, contentType);
    }
  }

  private async copyThroughApi(
    client: S3Client,
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string,
    contentType: string,
  ): Promise<void> {
    const dir = await mkdtemp(path.join(tmpdir(), 'soccernity-copy-'));
    const file = path.join(dir, 'object');
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: sourceBucket, Key: sourceKey }));
      if (!res.Body) throw new Error(`Object ${sourceKey} has no body`);
      await pipeline(res.Body as Readable, createWriteStream(file));
      const { size } = await stat(file);
      await client.send(
        new PutObjectCommand({
          Bucket: destBucket,
          Key: destKey,
          Body: createReadStream(file),
          ContentType: contentType,
          ContentLength: size,
        }),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  publicUrlFor(key: string): string {
    const { publicUrlBase } = this.requireClient('building a public URL');
    // A private key has no public address; building one would be a bug in the caller, so fail loudly.
    if (this.privateBucket && !isPublicKey(key)) {
      throw new Error(`Key "${key.split('/')[0]}/..." is private and has no public URL`);
    }
    return `${publicUrlBase}/${key}`;
  }

  // ---- backend/b283-delete-rejected-media (B-283; Decision Log #464) -------------------------------

  async listObjects(
    prefix: string,
    options: { maxKeys?: number; continuationToken?: string | null } = {},
  ): Promise<{ objects: ListedObject[]; nextToken: string | null }> {
    const { client, bucket: publicBucket } = this.requireClient('listing objects');
    // Routed by the prefix: a public prefix lists the public bucket, anything else (including '') the private one.
    const bucket = this.privateBucket && !isPublicPrefix(prefix) ? this.privateBucket : publicBucket;
    try {
      const res = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          MaxKeys: options.maxKeys ?? 1000,
          ContinuationToken: options.continuationToken ?? undefined,
        }),
      );
      const objects = (res.Contents ?? [])
        .filter((o): o is typeof o & { Key: string } => typeof o.Key === 'string')
        .map((o) => ({ key: o.Key, size: o.Size ?? 0, lastModified: o.LastModified ?? null }));
      return { objects, nextToken: res.IsTruncated ? (res.NextContinuationToken ?? null) : null };
    } catch (err) {
      const name = (err as { name?: string }).name;
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (name === 'AccessDenied' || name === 'Forbidden' || status === 403) {
        throw new StorageListNotPermittedError(`The storage key is not allowed to list objects in bucket "${bucket}"`);
      }
      throw err;
    }
  }
}
