import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { S3StorageService } from './s3-storage.service';

// backend/w14-post-media-pipeline (B-041): the direct-to-storage half of S3StorageService. Unlike
// s3-storage.service.spec.ts this does NOT mock the SDK: a presigned URL is computed locally from the
// credentials (no network), so the real signing is exercised; S3Client.send is spied for the calls that
// would reach the network.
const base = { S3_BUCKET: 'b', S3_ACCESS_KEY: 'AKIAEXAMPLE', S3_SECRET_KEY: 'secret', S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com' };
const cfg = (values: Record<string, string | undefined>) => new ConfigService(values);

describe('S3StorageService direct upload', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('createUploadUrl', () => {
    it('signs a PUT link into the bucket and key, bound to the content type and the exact length, with the requested expiry', async () => {
      const service = new S3StorageService(cfg(base));
      const out = await service.createUploadUrl('quarantine/u1/abc', 'image/jpeg', 1234, 900);

      const url = new URL(out.url);
      expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com');
      expect(url.pathname).toBe('/b/quarantine/u1/abc');
      expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
      const signed = (url.searchParams.get('X-Amz-SignedHeaders') ?? '').split(';');
      expect(signed).toEqual(expect.arrayContaining(['content-length', 'content-type', 'host']));
      expect(out.headers).toEqual({ 'Content-Type': 'image/jpeg' });
    });

    it('a different length gives a different signature (the length is really part of the signed request)', async () => {
      const service = new S3StorageService(cfg(base));
      const a = new URL((await service.createUploadUrl('k', 'image/jpeg', 100, 900)).url).searchParams.get('X-Amz-Signature');
      const b = new URL((await service.createUploadUrl('k', 'image/jpeg', 101, 900)).url).searchParams.get('X-Amz-Signature');
      expect(a).not.toBe(b);
    });

    it('is a 503 when no store is configured', async () => {
      const service = new S3StorageService(cfg({ S3_BUCKET: 'replace-me', S3_ACCESS_KEY: 'replace-me', S3_SECRET_KEY: 'replace-me' }));
      await expect(service.createUploadUrl('k', 'image/jpeg', 1, 60)).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.head('k')).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.downloadToFile('k', 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(service.uploadFile('x', 'k', 'image/jpeg')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('head', () => {
    it('returns the size and content type', async () => {
      jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: unknown) => {
        expect(cmd).toBeInstanceOf(HeadObjectCommand);
        return { ContentLength: 42, ContentType: 'image/png' };
      }) as never);
      expect(await new S3StorageService(cfg(base)).head('k')).toEqual({ size: 42, contentType: 'image/png' });
    });

    it('returns null for a missing object (NotFound / NoSuchKey / 404) and rethrows anything else', async () => {
      const service = new S3StorageService(cfg(base));
      const send = jest.spyOn(S3Client.prototype, 'send');
      for (const err of [{ name: 'NotFound' }, { name: 'NoSuchKey' }, { name: 'Other', $metadata: { httpStatusCode: 404 } }]) {
        send.mockRejectedValueOnce(err as never);
        expect(await service.head('k')).toBeNull();
      }
      send.mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'InternalError', $metadata: { httpStatusCode: 500 } }) as never);
      await expect(service.head('k')).rejects.toThrow('boom');
    });
  });

  describe('downloadToFile and uploadFile', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 's3-direct-'));
    });
    afterEach(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('streams the object into a file', async () => {
      jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: unknown) => {
        expect(cmd).toBeInstanceOf(GetObjectCommand);
        return { Body: Readable.from([Buffer.from('hello '), Buffer.from('world')]) };
      }) as never);
      const dest = path.join(dir, 'out.bin');
      await new S3StorageService(cfg(base)).downloadToFile('k', dest);
      expect((await readFile(dest)).toString()).toBe('hello world');
    });

    it('uploads a file with its exact length and returns the public URL', async () => {
      const sent: PutObjectCommand[] = [];
      jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: PutObjectCommand) => {
        sent.push(cmd);
        return {};
      }) as never);
      const file = path.join(dir, 'in.bin');
      await writeFile(file, Buffer.alloc(10, 1));
      const url = await new S3StorageService(cfg({ ...base, S3_PUBLIC_BASE_URL: 'https://media.example.com' })).uploadFile(file, 'post-media/u1/x.mp4', 'video/mp4');
      expect(url).toBe('https://media.example.com/post-media/u1/x.mp4');
      expect(sent[0].input).toMatchObject({ Bucket: 'b', Key: 'post-media/u1/x.mp4', ContentType: 'video/mp4', ContentLength: 10 });
    });
  });
});
