import { ExecutionContext, INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserAvatarController } from './user-avatar.controller';
import { UserAvatarService } from './user-avatar.service';

describe('UserAvatarController (HTTP layer, B-035)', () => {
  let app: INestApplication;
  const avatars = { uploadAvatar: jest.fn(), deleteAvatar: jest.fn() };
  const CALLER = { sub: 'me', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserAvatarController],
      providers: [{ provide: UserAvatarService, useValue: avatars }],
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

  it('POST /users/:id/avatar hands the multipart file and the TOKEN subject to the service', async () => {
    avatars.uploadAvatar.mockResolvedValue({ avatar: { url: 'u', status: 'pending' } });
    const res = await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body).toEqual({ avatar: { url: 'u', status: 'pending' } });
    const [userId, file] = avatars.uploadAvatar.mock.calls[0];
    expect(userId).toBe('me');
    expect(file.mimetype).toBe('image/jpeg');
    expect(file.buffer.length).toBe(6);
  });

  it("another user's id is a 403 and nothing is stored", async () => {
    await request(app.getHttpServer())
      .post('/users/someone-else/avatar')
      .attach('file', Buffer.from([1]), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(403);
    await request(app.getHttpServer()).delete('/users/someone-else/avatar').expect(403);
    expect(avatars.uploadAvatar).not.toHaveBeenCalled();
    expect(avatars.deleteAvatar).not.toHaveBeenCalled();
  });

  it('an unconfigured store surfaces as 503 (same as the admin upload)', async () => {
    avatars.uploadAvatar.mockRejectedValue(new ServiceUnavailableException('Media storage is not configured yet'));
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('file', Buffer.from([0xff, 0xd8, 0xff]), { filename: 'a.jpg', contentType: 'image/jpeg' })
      .expect(503);
  });

  it('an upload over 5 MB is a 413 from multer before the service runs', async () => {
    await request(app.getHttpServer())
      .post('/users/me/avatar')
      .attach('file', Buffer.alloc(5 * 1024 * 1024 + 1024), { filename: 'big.jpg', contentType: 'image/jpeg' })
      .expect(413);
    expect(avatars.uploadAvatar).not.toHaveBeenCalled();
  });

  it('DELETE /users/:id/avatar clears the caller own avatar', async () => {
    avatars.deleteAvatar.mockResolvedValue({ avatar: null });
    const res = await request(app.getHttpServer()).delete('/users/me/avatar').expect(200);
    expect(res.body).toEqual({ avatar: null });
    expect(avatars.deleteAvatar).toHaveBeenCalledWith('me');
  });
});
