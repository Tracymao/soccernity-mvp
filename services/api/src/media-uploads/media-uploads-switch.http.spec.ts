import { ExecutionContext, INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../modules/auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../modules/auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../modules/auth/guards/profile-complete.guard';
import { PostMediaController } from '../modules/post-media/post-media.controller';
import { PostMediaService } from '../modules/post-media/post-media.service';
import { UserAvatarController } from '../modules/users/user-avatar.controller';
import { UserAvatarService } from '../modules/users/user-avatar.service';
import { UserCoverController } from '../modules/users/user-cover.controller';
import { UserCoverService } from '../modules/users/user-cover.service';
import { MediaUploadsEnabledGuard } from './media-uploads-enabled.guard';
import { MediaUploadsSwitchService } from './media-uploads-switch.service';

// backend/b306-media-uploads-switch (B-306; Decision Log #501). The REAL guard and the REAL switch service over a
// fake ConfigService, mounted on the three real controllers that carry the four gated routes. Services are
// mocks, so "nothing was written" is asserted as "the service was never called". The other guards are
// pass-through here (write-route-guards.spec.ts pins them).
describe('media uploads switch (HTTP layer, B-306)', () => {
  let app: INestApplication;
  let env: Record<string, string | undefined> = { NODE_ENV: 'production', MEDIA_UPLOADS_ENABLED: 'true' };
  const media = { createUpload: jest.fn(), confirmUpload: jest.fn(), getOwnUpload: jest.fn(), deleteOwnUpload: jest.fn() };
  const avatars = { uploadAvatar: jest.fn(), deleteAvatar: jest.fn() };
  const covers = { uploadCover: jest.fn(), deleteCover: jest.fn() };
  const CALLER = { sub: 'me', role: 'fan' };
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PostMediaController, UserAvatarController, UserCoverController],
      providers: [
        MediaUploadsSwitchService,
        MediaUploadsEnabledGuard,
        { provide: ConfigService, useValue: { get: (key: string) => env[key] } },
        { provide: PostMediaService, useValue: media },
        { provide: UserAvatarService, useValue: avatars },
        { provide: UserCoverService, useValue: covers },
      ],
    })
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProfileCompleteGuard)
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
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    env = { NODE_ENV: 'production', MEDIA_UPLOADS_ENABLED: 'false' };
  });
  afterEach(() => jest.clearAllMocks());

  const DISABLED_BODY = expect.objectContaining({ statusCode: 403, code: 'media_uploads_disabled' });
  const noServiceCalled = () => {
    for (const m of [media.createUpload, media.confirmUpload, avatars.uploadAvatar, covers.uploadCover]) {
      expect(m).not.toHaveBeenCalled();
    }
  };

  describe('switch off', () => {
    it('POST /media/uploads is 403 media_uploads_disabled and the service is never called', async () => {
      const res = await request(app.getHttpServer()).post('/media/uploads').send({ contentType: 'video/mp4', size: 5000 }).expect(403);
      expect(res.body).toEqual(DISABLED_BODY);
      noServiceCalled();
    });

    it('POST /media/uploads is refused before body validation (an invalid body still gets the switch answer)', async () => {
      const res = await request(app.getHttpServer()).post('/media/uploads').send({ nonsense: true }).expect(403);
      expect(res.body.code).toBe('media_uploads_disabled');
    });

    it('POST /media/uploads/:id/confirm is 403 media_uploads_disabled and the service is never called', async () => {
      const res = await request(app.getHttpServer()).post('/media/uploads/u1/confirm').expect(403);
      expect(res.body).toEqual(DISABLED_BODY);
      noServiceCalled();
    });

    it('POST /users/:id/avatar is 403 media_uploads_disabled; the multipart file never reaches the service', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/me/avatar')
        .attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(403);
      expect(res.body).toEqual(DISABLED_BODY);
      noServiceCalled();
    });

    it('POST /users/:id/cover is 403 media_uploads_disabled; the multipart file never reaches the service', async () => {
      const res = await request(app.getHttpServer())
        .post('/users/me/cover')
        .attach('file', JPEG, { filename: 'c.jpg', contentType: 'image/jpeg' })
        .expect(403);
      expect(res.body).toEqual(DISABLED_BODY);
      noServiceCalled();
    });

    it("the switch answer wins even over the 'someone else's id' check (the gate runs first)", async () => {
      const res = await request(app.getHttpServer())
        .post('/users/someone-else/avatar')
        .attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' })
        .expect(403);
      expect(res.body.code).toBe('media_uploads_disabled');
    });

    it('the ungated routes still work: GET and DELETE /media/uploads/:id', async () => {
      media.getOwnUpload.mockResolvedValue({ id: 'u1', status: 'pending' });
      media.deleteOwnUpload.mockResolvedValue(undefined);
      await request(app.getHttpServer()).get('/media/uploads/u1').expect(200);
      await request(app.getHttpServer()).delete('/media/uploads/u1').expect(204);
      expect(media.getOwnUpload).toHaveBeenCalledWith('me', 'u1');
      expect(media.deleteOwnUpload).toHaveBeenCalledWith('me', 'u1');
    });

    it('the ungated routes still work: DELETE /users/:id/avatar and /cover', async () => {
      avatars.deleteAvatar.mockResolvedValue({ avatar: null });
      covers.deleteCover.mockResolvedValue({ cover: null });
      await request(app.getHttpServer()).delete('/users/me/avatar').expect(200);
      await request(app.getHttpServer()).delete('/users/me/cover').expect(200);
      expect(avatars.deleteAvatar).toHaveBeenCalledWith('me');
      expect(covers.deleteCover).toHaveBeenCalledWith('me');
    });

    it('an unrecognised value in production (TRUE, 1, empty, unset) is also off', async () => {
      for (const value of ['TRUE', '1', '', undefined]) {
        env = { NODE_ENV: 'production', MEDIA_UPLOADS_ENABLED: value };
        await request(app.getHttpServer()).post('/media/uploads').send({ contentType: 'image/png', size: 10 }).expect(403);
      }
      expect(media.createUpload).not.toHaveBeenCalled();
    });
  });

  describe('switch on', () => {
    it('production with the exact text "true": all four routes behave as before', async () => {
      env = { NODE_ENV: 'production', MEDIA_UPLOADS_ENABLED: 'true' };
      media.createUpload.mockResolvedValue({ id: 'u1' });
      media.confirmUpload.mockResolvedValue({ id: 'u1', uploadState: 'ready' });
      avatars.uploadAvatar.mockResolvedValue({ avatar: { url: 'u', status: 'pending' } });
      covers.uploadCover.mockResolvedValue({ cover: { url: 'u', status: 'pending' } });
      await request(app.getHttpServer()).post('/media/uploads').send({ contentType: 'video/mp4', size: 5000 }).expect(201);
      await request(app.getHttpServer()).post('/media/uploads/u1/confirm').expect(200);
      await request(app.getHttpServer()).post('/users/me/avatar').attach('file', JPEG, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(201);
      await request(app.getHttpServer()).post('/users/me/cover').attach('file', JPEG, { filename: 'c.jpg', contentType: 'image/jpeg' }).expect(201);
      expect(media.createUpload).toHaveBeenCalledWith('me', { contentType: 'video/mp4', size: 5000 });
      expect(media.confirmUpload).toHaveBeenCalledWith('me', 'u1');
      expect(avatars.uploadAvatar).toHaveBeenCalledTimes(1);
      expect(covers.uploadCover).toHaveBeenCalledTimes(1);
    });

    it('outside production the unset default is on', async () => {
      env = { NODE_ENV: 'development' };
      media.createUpload.mockResolvedValue({ id: 'u1' });
      await request(app.getHttpServer()).post('/media/uploads').send({ contentType: 'image/png', size: 10 }).expect(201);
    });

    it('outside production the exact text "false" turns it off', async () => {
      env = { NODE_ENV: 'development', MEDIA_UPLOADS_ENABLED: 'false' };
      await request(app.getHttpServer()).post('/media/uploads').send({ contentType: 'image/png', size: 10 }).expect(403);
    });
  });
});

describe('MediaUploadsSwitchService start-up warning (B-306)', () => {
  const build = (env: Record<string, string | undefined>) =>
    new MediaUploadsSwitchService({ get: (key: string) => env[key] } as unknown as ConfigService);

  it('logs exactly one warning, naming the setting and the code, when uploads are off', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    build({ NODE_ENV: 'production' }).onModuleInit();
    expect(warn).toHaveBeenCalledTimes(1);
    const text = String(warn.mock.calls[0][0]);
    expect(text).toContain('MEDIA_UPLOADS_ENABLED');
    expect(text).toContain('media_uploads_disabled');
    warn.mockRestore();
  });

  it('logs nothing when uploads are on, and never throws (off does not refuse to boot)', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    build({ NODE_ENV: 'production', MEDIA_UPLOADS_ENABLED: 'true' }).onModuleInit();
    build({ NODE_ENV: 'test' }).onModuleInit();
    expect(warn).not.toHaveBeenCalled();
    expect(() => build({ NODE_ENV: 'production' }).onModuleInit()).not.toThrow();
    warn.mockRestore();
  });
});
