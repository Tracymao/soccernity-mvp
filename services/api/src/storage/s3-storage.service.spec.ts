import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { S3StorageService } from './s3-storage.service';

// Same "wired but inactive" convention/test shape as
// registration-email.service.spec.ts (Postmark) — this file covers the
// one genuinely S3-specific piece of this PR: isConfigured gating and
// the endpoint-driven URL/addressing-style construction (real AWS S3 vs.
// any other S3-compatible provider). No real network call is ever made
// here — @aws-sdk/client-s3 is auto-mocked (jest.mock with no factory,
// configured below via plain runtime calls rather than a factory
// function — sidesteps ts-jest's mock-hoisting rules entirely, simpler
// than the mock-prefixed-variable convention registration-email.service.spec.ts
// uses) so `S3Client.send()` never actually reaches out.
// media.service.spec.ts covers MediaService's own branching logic
// against a fake StorageService instead; this file is the only place a
// real S3StorageService instance is constructed.
jest.mock('@aws-sdk/client-s3');

const mockSend = jest.fn();
const MockedS3Client = S3Client as jest.MockedClass<typeof S3Client>;
const MockedPutObjectCommand = PutObjectCommand as jest.MockedClass<typeof PutObjectCommand>;
const MockedDeleteObjectCommand = DeleteObjectCommand as jest.MockedClass<typeof DeleteObjectCommand>;

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('S3StorageService', () => {
  beforeEach(() => {
    MockedS3Client.mockImplementation(() => ({ send: mockSend }) as unknown as S3Client);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('not configured (.env.example placeholders still in place)', () => {
    it('throws a clear ServiceUnavailableException on upload() rather than attempting a network call', async () => {
      const service = new S3StorageService(
        buildConfig({ S3_BUCKET: 'replace-me', S3_ACCESS_KEY: 'replace-me', S3_SECRET_KEY: 'replace-me' }),
      );

      await expect(service.upload(Buffer.from('x'), 'media/a-key.jpg', 'image/jpeg')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('throws a clear ServiceUnavailableException on delete() rather than attempting a network call', async () => {
      const service = new S3StorageService(buildConfig({}));

      await expect(service.delete('media/a-key.jpg')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('configured against real AWS S3 (no S3_ENDPOINT set)', () => {
    it('uploads via a real PutObjectCommand and returns a virtual-hosted-style URL', async () => {
      mockSend.mockResolvedValue({});
      const service = new S3StorageService(
        buildConfig({
          S3_BUCKET: 'soccernity-media',
          S3_ACCESS_KEY: 'AKIA...',
          S3_SECRET_KEY: 'secret',
          S3_REGION: 'us-east-1',
        }),
      );

      const url = await service.upload(Buffer.from('bytes'), 'media/admin-1/photo.jpg', 'image/jpeg');

      expect(url).toBe('https://soccernity-media.s3.us-east-1.amazonaws.com/media/admin-1/photo.jpg');
      expect(MockedPutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'soccernity-media',
        Key: 'media/admin-1/photo.jpg',
        Body: expect.any(Buffer),
        ContentType: 'image/jpeg',
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(MockedPutObjectCommand));
      // forcePathStyle must be false/unset for real AWS S3 — virtual-hosted
      // addressing is the AWS SDK v3's own default and what the URL above
      // assumes.
      expect(MockedS3Client).toHaveBeenCalledWith(expect.objectContaining({ forcePathStyle: false }));
    });

    it('deletes via a real DeleteObjectCommand', async () => {
      mockSend.mockResolvedValue({});
      const service = new S3StorageService(
        buildConfig({ S3_BUCKET: 'soccernity-media', S3_ACCESS_KEY: 'AKIA...', S3_SECRET_KEY: 'secret' }),
      );

      await service.delete('media/admin-1/photo.jpg');

      expect(MockedDeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'soccernity-media',
        Key: 'media/admin-1/photo.jpg',
      });
      expect(mockSend).toHaveBeenCalledWith(expect.any(MockedDeleteObjectCommand));
    });
  });

  describe('configured against an S3-compatible provider (S3_ENDPOINT set — R2/B2/Spaces/MinIO)', () => {
    it('uploads via forcePathStyle and returns a path-style URL built from the endpoint', async () => {
      mockSend.mockResolvedValue({});
      const service = new S3StorageService(
        buildConfig({
          S3_BUCKET: 'soccernity-media',
          S3_ACCESS_KEY: 'key-id',
          S3_SECRET_KEY: 'secret',
          S3_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com',
          S3_REGION: 'auto',
        }),
      );

      const url = await service.upload(Buffer.from('bytes'), 'media/admin-1/photo.jpg', 'image/jpeg');

      expect(url).toBe('https://abc123.r2.cloudflarestorage.com/soccernity-media/media/admin-1/photo.jpg');
      expect(MockedS3Client).toHaveBeenCalledWith(
        expect.objectContaining({ forcePathStyle: true, endpoint: 'https://abc123.r2.cloudflarestorage.com' }),
      );
    });

    it('defaults S3_REGION to "auto" when unset, for providers that expect that convention', async () => {
      mockSend.mockResolvedValue({});
      const service = new S3StorageService(
        buildConfig({
          S3_BUCKET: 'soccernity-media',
          S3_ACCESS_KEY: 'key-id',
          S3_SECRET_KEY: 'secret',
          S3_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com',
        }),
      );

      await service.upload(Buffer.from('bytes'), 'media/a-key.jpg', 'image/jpeg');

      expect(MockedS3Client).toHaveBeenCalledWith(expect.objectContaining({ region: 'auto' }));
    });

    it('strips a trailing slash from S3_ENDPOINT before building the public URL', async () => {
      mockSend.mockResolvedValue({});
      const service = new S3StorageService(
        buildConfig({
          S3_BUCKET: 'soccernity-media',
          S3_ACCESS_KEY: 'key-id',
          S3_SECRET_KEY: 'secret',
          S3_ENDPOINT: 'https://abc123.r2.cloudflarestorage.com/',
        }),
      );

      const url = await service.upload(Buffer.from('bytes'), 'media/a-key.jpg', 'image/jpeg');

      expect(url).toBe('https://abc123.r2.cloudflarestorage.com/soccernity-media/media/a-key.jpg');
    });
  });
});
