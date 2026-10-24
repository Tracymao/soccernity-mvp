import { ExecutionContext, INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserCoverController } from './user-cover.controller';
import { UserCoverService } from './user-cover.service';

describe('UserCoverController (HTTP layer, B-196)', () => {
  let app: INestApplication;
  const covers = { uploadCover: jest.fn(), deleteCover: jest.fn() };
  const CALLER = { sub: 'me', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserCoverController],
      providers: [{ provide: UserCoverService, useValue: covers }],
    })
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  it('POST /users/:id/cover hands the multipart file and the TOKEN subject to the service', async () => {
    covers.uploadCover.mockResolvedValue({ cover: { url: 'u', status: 'pending' } });
    const res = await request(app.getHttpServer())
      .post('/users/me/cover')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body).toEqual({ cover: { url: 'u', status: 'pending' } });
    const [userId, file] = covers.uploadCover.mock.calls[0];
    expect(userId).toBe('me');
    expect(file.mimetype).toBe('image/jpeg');
    expect(file.buffer.length).toBe(6);
  });

  it("another user's id is a 403 and nothing is stored", async () => {
    await request(app.getHttpServer())
      .post('/users/someone-else/cover')
      .attach('file', Buffer.from([1]), { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(403);
    await request(app.getHttpServer()).delete('/users/someone-else/cover').expect(403);
    expect(covers.uploadCover).not.toHaveBeenCalled();
    expect(covers.deleteCover).not.toHaveBeenCalled();
  });

  it('an unconfigured store surfaces as 503 (same as the admin upload and the avatar)', async () => {
    covers.uploadCover.mockRejectedValue(new ServiceUnavailableException('Media storage is not configured yet'));
    await request(app.getHttpServer())
      .post('/users/me/cover')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'c.jpg', contentType: 'image/jpeg' })
      .expect(503);
  });

  it('an upload over 5 MB is a 413 from multer before the service runs', async () => {
    await request(app.getHttpServer())
      .post('/users/me/cover')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1024), { filename: 'big.jpg', contentType: 'image/jpeg' })
      .expect(413);
    expect(covers.uploadCover).not.toHaveBeenCalled();
  });

  it('DELETE /users/:id/cover clears the caller own cover', async () => {
    covers.deleteCover.mockResolvedValue({ cover: null });
    const res = await request(app.getHttpServer()).delete('/users/me/cover').expect(200);
    expect(res.body).toEqual({ cover: null });
    expect(covers.deleteCover).toHaveBeenCalledWith('me');
  });
});
