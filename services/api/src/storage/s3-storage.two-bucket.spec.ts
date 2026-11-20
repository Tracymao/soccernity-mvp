import { ConfigService } from '@nestjs/config';
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { StorageListNotPermittedError } from './direct-upload-storage.service';
import { S3StorageService } from './s3-storage.service';

// B-265: two buckets. S3_BUCKET is the PUBLIC bucket, S3_PRIVATE_BUCKET holds everything not on the public allow-list
// (storage-prefixes.ts). Like s3-direct-upload.spec.ts this uses the real SDK with S3Client.send spied: presigned URLs are
// computed locally, and the commands the service builds are inspected through their `input`.
const base = {
  S3_BUCKET: 'pub',
  S3_PRIVATE_BUCKET: 'priv',
  S3_ACCESS_KEY: 'AKIAEXAMPLE',
  S3_SECRET_KEY: 'secret',
  S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  S3_PUBLIC_BASE_URL: 'https://media.soccernity.com',
};
const cfg = (values: Record<string, string | undefined>) => new ConfigService(values);

function spySend(handler: (cmd: unknown) => unknown) {
  const calls: unknown[] = [];
  jest.spyOn(S3Client.prototype, 'send').mockImplementation((async (cmd: unknown) => {
    calls.push(cmd);
    return handler(cmd);
  }) as never);
  return calls;
}
const inputOf = (cmd: unknown) => (cmd as { input: Record<string, unknown> }).input;
const nameOf = (cmd: unknown) => (cmd as object).constructor.name;

describe('S3StorageService two buckets (B-265)', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('which bucket a key goes to', () => {
    it.each([
      ['post-media/u1/a.jpg', 'pub'],
      ['profile-media/u1/a.jpg', 'pub'],
      ['media/admin-1/a.jpg', 'pub'],
      ['private-media/u1/a.jpg', 'priv'],
      ['private-profile/u1/a.jpg', 'priv'],
      ['quarantine/u1/a', 'priv'],
      ['data-export/u1/a.json', 'priv'],
      ['avatars/u1/a', 'priv'],
      ['covers/u1/a', 'priv'],
      ['a-prefix-nobody-has-seen/u1/a', 'priv'],
    ])('%s -> %s', (key, bucket) => {
      expect(new S3StorageService(cfg(base)).bucketFor(key)).toBe(bucket);
    });

    it('reports two-bucket mode', () => {
      expect(new S3StorageService(cfg(base)).isTwoBucket).toBe(true);
    });
  });

  describe('every operation routes by key', () => {
    it('upload(), delete(), head(), createDownloadUrl() use the bucket of the key', async () => {
      const calls = spySend((cmd) => {
        if (cmd instanceof HeadObjectCommand) return { ContentLength: 1, ContentType: 'image/png' };
        return {};
      });
      const s = new S3StorageService(cfg(base));
      await s.upload(Buffer.from('x'), 'post-media/u/a.png', 'image/png');
      await s.upload(Buffer.from('x'), 'private-media/u/a.png', 'image/png');
      await s.delete('post-media/u/a.png');
      await s.delete('quarantine/u/a');
      await s.head('private-profile/u/a');
      await s.head('profile-media/u/a');
      expect(calls.map((c) => [nameOf(c), inputOf(c).Bucket, inputOf(c).Key])).toEqual([
        ['PutObjectCommand', 'pub', 'post-media/u/a.png'],
        ['PutObjectCommand', 'priv', 'private-media/u/a.png'],
        ['DeleteObjectCommand', 'pub', 'post-media/u/a.png'],
        ['DeleteObjectCommand', 'priv', 'quarantine/u/a'],
        ['HeadObjectCommand', 'priv', 'private-profile/u/a'],
        ['HeadObjectCommand', 'pub', 'profile-media/u/a'],
      ]);

      const signedPriv = new URL(await s.createDownloadUrl('private-media/u/a.png', 300));
      expect(signedPriv.pathname).toBe('/priv/private-media/u/a.png');
      const signedPub = new URL(await s.createDownloadUrl('post-media/u/a.png', 300));
      expect(signedPub.pathname).toBe('/pub/post-media/u/a.png');
    });

    it('downloadToFile() reads from the bucket of the key', async () => {
      const calls = spySend(() => ({ Body: Readable.from([Buffer.from('x')]) }));
      const file = path.join(tmpdir(), `two-bucket-dl-${Date.now()}.bin`);
      try {
        await new S3StorageService(cfg(base)).downloadToFile('quarantine/u/a', file);
      } finally {
        try {
          unlinkSync(file);
        } catch {
          /* not written */
        }
      }
      expect(calls[0]).toBeInstanceOf(GetObjectCommand);
      expect(inputOf(calls[0]).Bucket).toBe('priv');
    });

    it('uploadFile() writes a private key to the private bucket and returns no address for it', async () => {
      const calls = spySend(async (cmd) => {
        // Drain the stream like the real SDK does, so the temp file is read while it still exists.
        for await (const _chunk of inputOf(cmd).Body as Readable) void _chunk;
        return {};
      });
      const s = new S3StorageService(cfg(base));
      const file = path.join(tmpdir(), `two-bucket-${Date.now()}.bin`);
      writeFileSync(file, 'hello');
      try {
        expect(await s.uploadFile(file, 'private-media/u/a.png', 'image/png')).toBe('');
        expect(await s.uploadFile(file, 'post-media/u/a.png', 'image/png')).toBe(
          'https://media.soccernity.com/post-media/u/a.png',
        );
      } finally {
        unlinkSync(file);
      }
      expect(calls.map((c) => inputOf(c).Bucket)).toEqual(['priv', 'pub']);
    });

    it('upload() of a private key returns "" (never a servable-looking URL); a public key returns the public URL', async () => {
      spySend(() => ({}));
      const s = new S3StorageService(cfg(base));
      expect(await s.upload(Buffer.from('x'), 'data-export/u/a.json', 'application/json')).toBe('');
      expect(await s.upload(Buffer.from('x'), 'media/admin-1/a.jpg', 'image/jpeg')).toBe(
        'https://media.soccernity.com/media/admin-1/a.jpg',
      );
    });
  });

  describe('createUploadUrl signs against the PRIVATE bucket for quarantine/', () => {
    it('the browser PUT link points at the private bucket', async () => {
      const out = await new S3StorageService(cfg(base)).createUploadUrl('quarantine/u1/abc', 'image/jpeg', 1234, 900);
      const url = new URL(out.url);
      expect(url.origin).toBe('https://acct.r2.cloudflarestorage.com');
      expect(url.pathname).toBe('/priv/quarantine/u1/abc');
    });
  });

  describe('publicUrlFor', () => {
    it('builds a URL for a public key and THROWS for a private one (no public address exists)', () => {
      const s = new S3StorageService(cfg(base));
      expect(s.publicUrlFor('post-media/u/a.jpg')).toBe('https://media.soccernity.com/post-media/u/a.jpg');
      expect(() => s.publicUrlFor('private-media/u/a.jpg')).toThrow(/private and has no public URL/);
      expect(() => s.publicUrlFor('quarantine/u/a')).toThrow(/private/);
    });
  });

  describe('copyObject across buckets', () => {
    it('approve (private to public): Bucket is the destination, CopySource is "<private bucket>/<encoded key>"', async () => {
      const calls = spySend(() => ({}));
      await new S3StorageService(cfg(base)).copyObject('private-media/u 1/a b.jpg', 'post-media/u 1/a b.jpg', 'image/jpeg');
      expect(calls).toHaveLength(1);
      expect(calls[0]).toBeInstanceOf(CopyObjectCommand);
      expect(inputOf(calls[0])).toMatchObject({
        Bucket: 'pub',
        Key: 'post-media/u 1/a b.jpg',
        CopySource: 'priv/private-media/u%201/a%20b.jpg',
        ContentType: 'image/jpeg',
        MetadataDirective: 'REPLACE',
      });
    });

    it('hold (public to private) is the mirror image', async () => {
      const calls = spySend(() => ({}));
      await new S3StorageService(cfg(base)).copyObject('post-media/u/a.jpg', 'private-media/u/a.jpg', 'image/jpeg');
      expect(inputOf(calls[0])).toMatchObject({
        Bucket: 'priv',
        CopySource: 'pub/post-media/u/a.jpg',
        Key: 'private-media/u/a.jpg',
      });
    });

    it('when the store refuses a cross-bucket CopyObject it falls back to GET from the source bucket and PUT to the destination', async () => {
      const putBodies: string[] = [];
      const calls = spySend(async (cmd) => {
        if (cmd instanceof CopyObjectCommand) throw Object.assign(new Error('not supported'), { name: 'NotImplemented' });
        if (cmd instanceof GetObjectCommand) return { Body: Readable.from([Buffer.from('payload')]) };
        // The real SDK reads the request body before send() resolves; do the same so the temp file is read while it exists.
        const body = inputOf(cmd).Body as Readable;
        const chunks: Buffer[] = [];
        for await (const chunk of body) chunks.push(Buffer.from(chunk));
        putBodies.push(Buffer.concat(chunks).toString());
        return {};
      });
      await new S3StorageService(cfg(base)).copyObject('private-media/u/a.jpg', 'post-media/u/a.jpg', 'image/jpeg');
      expect(calls.map(nameOf)).toEqual(['CopyObjectCommand', 'GetObjectCommand', 'PutObjectCommand']);
      expect(inputOf(calls[1])).toMatchObject({ Bucket: 'priv', Key: 'private-media/u/a.jpg' });
      expect(inputOf(calls[2])).toMatchObject({
        Bucket: 'pub',
        Key: 'post-media/u/a.jpg',
        ContentType: 'image/jpeg',
        ContentLength: 7,
      });
      expect(putBodies).toEqual(['payload']);
    });

    it('a same-bucket copy that fails is NOT retried through the API (the error is rethrown)', async () => {
      const calls = spySend((cmd) => {
        if (cmd instanceof CopyObjectCommand) throw Object.assign(new Error('boom'), { name: 'InternalError' });
        return {};
      });
      await expect(new S3StorageService(cfg(base)).copyObject('private-media/a', 'quarantine/b', 'image/jpeg')).rejects.toThrow('boom');
      expect(calls).toHaveLength(1);
    });

    it('if the fallback itself fails the error surfaces (so the caller keeps the item pending)', async () => {
      spySend((cmd) => {
        if (cmd instanceof CopyObjectCommand) throw Object.assign(new Error('nope'), { name: 'NotImplemented' });
        if (cmd instanceof GetObjectCommand) throw Object.assign(new Error('gone'), { name: 'NoSuchKey' });
        return {};
      });
      await expect(new S3StorageService(cfg(base)).copyObject('private-media/a', 'post-media/a', 'image/jpeg')).rejects.toThrow('gone');
    });
  });

  describe('listObjects routes by prefix', () => {
    it.each([
      ['private-media/', 'priv'],
      ['quarantine/', 'priv'],
      ['', 'priv'],
      ['post-media/', 'pub'],
      ['profile-media/u1/', 'pub'],
    ])('prefix %j lists the %s bucket', async (prefix, bucket) => {
      const calls = spySend(() => ({ Contents: [], IsTruncated: false }));
      await new S3StorageService(cfg(base)).listObjects(prefix);
      expect(calls[0]).toBeInstanceOf(ListObjectsV2Command);
      expect(inputOf(calls[0]).Bucket).toBe(bucket);
    });

    it('a 403 names the bucket that refused (B-207: the token must list on BOTH buckets)', async () => {
      spySend(() => {
        throw Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
      });
      const s = new S3StorageService(cfg(base));
      await expect(s.listObjects('private-media/')).rejects.toThrow(StorageListNotPermittedError);
      await expect(s.listObjects('private-media/')).rejects.toThrow(/"priv"/);
      await expect(s.listObjects('post-media/')).rejects.toThrow(/"pub"/);
    });
  });

  describe('single-bucket fallback (S3_PRIVATE_BUCKET unset, blank, a placeholder or equal to S3_BUCKET): behaviour is as before', () => {
    const single = { ...base, S3_PRIVATE_BUCKET: undefined, S3_PUBLIC_BASE_URL: undefined };

    it.each([undefined, '', '   ', 'replace-me', 'pub'])('S3_PRIVATE_BUCKET=%j', (value) => {
      const s = new S3StorageService(cfg({ ...single, S3_PRIVATE_BUCKET: value }));
      expect(s.isTwoBucket).toBe(false);
      expect(s.bucketFor('private-media/u/a')).toBe('pub');
      expect(s.bucketFor('post-media/u/a')).toBe('pub');
    });

    it('private keys keep a URL, upload() returns it, and publicUrlFor does not throw', async () => {
      spySend(() => ({}));
      const s = new S3StorageService(cfg(single));
      expect(await s.upload(Buffer.from('x'), 'private-media/u/a.jpg', 'image/jpeg')).toBe(
        'https://acct.r2.cloudflarestorage.com/pub/private-media/u/a.jpg',
      );
      expect(s.publicUrlFor('private-media/u/a.jpg')).toBe('https://acct.r2.cloudflarestorage.com/pub/private-media/u/a.jpg');
    });

    it('a cross-prefix copy is a plain same-bucket CopyObject with no fallback', async () => {
      const calls = spySend(() => ({}));
      await new S3StorageService(cfg(single)).copyObject('private-media/a', 'post-media/a', 'image/jpeg');
      expect(calls).toHaveLength(1);
      expect(inputOf(calls[0])).toMatchObject({ Bucket: 'pub', CopySource: 'pub/private-media/a' });
    });
  });

  it('a store that is not configured at all stays inactive (a private bucket name alone does not activate it)', async () => {
    const s = new S3StorageService(
      cfg({ S3_BUCKET: 'replace-me', S3_PRIVATE_BUCKET: 'priv', S3_ACCESS_KEY: 'replace-me', S3_SECRET_KEY: 'replace-me' }),
    );
    await expect(s.upload(Buffer.from('x'), 'post-media/a', 'image/png')).rejects.toThrow(/not configured/);
    expect(() => s.bucketFor('post-media/a')).toThrow(/not configured/);
  });
});
