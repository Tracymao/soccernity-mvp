import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthThrottlerGuard } from './rate-limit/auth-throttler.guard';

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with AuthService mocked out, mirroring
// registration/registration.controller.spec.ts's pattern -- this is the
// HTTP-layer coverage that replaces the direct-call validation tests
// that lived in auth.controller.spec.ts before LoginDto/RefreshDto/
// LogoutDto became class-validator classes validated by main.ts's
// global ValidationPipe.
describe('AuthController (HTTP layer)', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  const tokenPairResponse = {
    accessToken: 'access-token',
    accessTokenExpiresIn: 900,
    refreshToken: 'refresh-id.secret',
    refreshTokenExpiresAt: new Date('2026-08-18T00:00:00.000Z').toISOString(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    })
      // Same reasoning as registration.controller.spec.ts: @UseGuards()
      // resolves by class reference, so overrideGuard() bypasses
      // AuthThrottlerGuard's real DI graph without faking rate-limit
      // behavior itself (covered separately by
      // rate-limit/auth-throttler.guard.spec.ts).
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('returns 200 with the token pair on success', async () => {
      authService.login.mockResolvedValueOnce(tokenPairResponse);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'player@example.com', password: 'password123' })
        .expect(200);

      expect(response.body).toEqual(tokenPairResponse);
      expect(authService.login).toHaveBeenCalledWith('player@example.com', 'password123');
    });

    it('rejects a body missing the password field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'player@example.com' })
        .expect(400);

      expect(authService.login).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type email field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 12345, password: 'password123' })
        .expect(400);

      expect(authService.login).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'player@example.com', password: 'password123', role: 'admin' })
        .expect(400);

      expect(authService.login).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/refresh', () => {
    it('returns 200 with the rotated token pair on success', async () => {
      authService.refresh.mockResolvedValueOnce(tokenPairResponse);

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'refresh-id.secret' })
        .expect(200);

      expect(response.body).toEqual(tokenPairResponse);
      expect(authService.refresh).toHaveBeenCalledWith('refresh-id.secret');
    });

    it('rejects a body missing refreshToken with 400', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);

      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type refreshToken field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 12345 })
        .expect(400);

      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'refresh-id.secret', role: 'admin' })
        .expect(400);

      expect(authService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/logout', () => {
    it('returns 204 on success', async () => {
      authService.logout.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'refresh-id.secret' })
        .expect(204);

      expect(authService.logout).toHaveBeenCalledWith('refresh-id.secret', false, undefined);
    });

    it('rejects a body missing refreshToken with 400', async () => {
      await request(app.getHttpServer()).post('/auth/logout').send({}).expect(400);

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('rejects a wrong-type allSessions field with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'refresh-id.secret', allSessions: 'yes' })
        .expect(400);

      expect(authService.logout).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: 'refresh-id.secret', role: 'admin' })
        .expect(400);

      expect(authService.logout).not.toHaveBeenCalled();
    });
  });
});
