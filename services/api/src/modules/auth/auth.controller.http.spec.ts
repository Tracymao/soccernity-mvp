import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthThrottlerGuard } from './rate-limit/auth-throttler.guard';

// Exercises real HTTP request/response handling (routing, DTO
// validation, status codes) with AuthService mocked out, mirroring
// registration/registration.controller.spec.ts's pattern -- this is the
// HTTP-layer coverage that replaces the direct-call validation tests
// that lived in auth.controller.spec.ts before LoginDto/RefreshDto/
// LogoutDto became class-validator classes validated by main.ts's
// global ValidationPipe.
//
// sprint-1/f5-f6-missing-endpoints added four JwtAuthGuard/unguarded
// routes (change-password, deactivate-account, delete-account,
// reactivate-account) to this same controller. JwtAuthGuard is
// overridden (not left real) the same way
// users/users.controller.http.spec.ts already does -- this file mocks
// AuthService entirely, so there is no real TokenService/PrismaService
// in this TestingModule for the real JwtAuthGuard to depend on.
const AUTHENTICATED_USER = { sub: 'user-1', role: 'fan' };

describe('AuthController (HTTP layer)', () => {
  let app: INestApplication;
  const authService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
    deactivateAccount: jest.fn(),
    deleteAccount: jest.fn(),
    reactivateAccount: jest.fn(),
  };

  const tokenPairResponse = {
    accessToken: 'access-token',
    accessTokenExpiresIn: 900,
    refreshToken: 'refresh-id.secret',
    refreshTokenExpiresAt: new Date('2026-08-18T00:00:00.000Z').toISOString(),
  };

  // /auth/login's response (unlike /auth/refresh's) also carries a `user`
  // summary as of sprint-2/auth-response-shape-reconciliation -- see
  // auth-response.mapper.ts's AuthResponse/toAuthUserSummary.
  const authResponse = {
    ...tokenPairResponse,
    user: {
      id: 'user-1',
      email: 'player@example.com',
      phone: null,
      displayName: 'Player One',
      dateOfBirth: new Date('1995-01-01').toISOString(),
      isMinor: false,
      role: 'fan',
      verificationStatus: 'unverified',
      createdAt: new Date('2026-08-16T00:00:00.000Z').toISOString(),
    },
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
      // Same pattern users.controller.http.spec.ts already established:
      // bypass real token verification, attach a fixed authenticated
      // user to the request so change-password/deactivate/delete-account
      // handlers have a @CurrentUser() to read.
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = AUTHENTICATED_USER;
          return true;
        },
      })
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
    it('returns 200 with the token pair and user on success', async () => {
      authService.login.mockResolvedValueOnce(authResponse);

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'player@example.com', password: 'password123' })
        .expect(200);

      expect(response.body).toEqual(authResponse);
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

  describe('POST /auth/change-password', () => {
    it('returns 204 and delegates to authService with the caller-from-JWT id, not a body field', async () => {
      authService.changePassword.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(204);

      expect(authService.changePassword).toHaveBeenCalledWith(
        AUTHENTICATED_USER.sub,
        'old-password',
        'new-password-123',
      );
    });

    it('rejects a newPassword shorter than 8 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ currentPassword: 'old-password', newPassword: 'short' })
        .expect(400);

      expect(authService.changePassword).not.toHaveBeenCalled();
    });

    it('rejects a body missing currentPassword with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ newPassword: 'new-password-123' })
        .expect(400);

      expect(authService.changePassword).not.toHaveBeenCalled();
    });

    it('propagates a 401 thrown by the service (wrong current password)', async () => {
      authService.changePassword.mockRejectedValueOnce(
        new UnauthorizedException('Current password is incorrect'),
      );

      await request(app.getHttpServer())
        .post('/auth/change-password')
        .send({ currentPassword: 'wrong', newPassword: 'new-password-123' })
        .expect(401);
    });
  });

  describe('POST /auth/deactivate-account', () => {
    it('returns 204 and delegates to authService with the caller-from-JWT id and the re-entered password', async () => {
      authService.deactivateAccount.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/deactivate-account')
        .send({ password: 'the-real-password' })
        .expect(204);

      expect(authService.deactivateAccount).toHaveBeenCalledWith(AUTHENTICATED_USER.sub, 'the-real-password');
    });

    it('rejects a body missing password with 400 -- a bare POST must never deactivate an account', async () => {
      await request(app.getHttpServer()).post('/auth/deactivate-account').send({}).expect(400);

      expect(authService.deactivateAccount).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/delete-account', () => {
    it('returns 204 and delegates to authService with the caller-from-JWT id and the re-entered password', async () => {
      authService.deleteAccount.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/auth/delete-account')
        .send({ password: 'the-real-password' })
        .expect(204);

      expect(authService.deleteAccount).toHaveBeenCalledWith(AUTHENTICATED_USER.sub, 'the-real-password');
    });

    it('rejects a body missing password with 400 -- a bare POST must never delete an account', async () => {
      await request(app.getHttpServer()).post('/auth/delete-account').send({}).expect(400);

      expect(authService.deleteAccount).not.toHaveBeenCalled();
    });
  });

  describe('POST /auth/reactivate-account', () => {
    it('returns 200 with a token pair + user on success', async () => {
      authService.reactivateAccount.mockResolvedValueOnce(authResponse);

      const response = await request(app.getHttpServer())
        .post('/auth/reactivate-account')
        .send({ email: 'player@example.com', password: 'the-real-password' })
        .expect(200);

      expect(response.body).toEqual(authResponse);
      expect(authService.reactivateAccount).toHaveBeenCalledWith('player@example.com', 'the-real-password');
    });

    it('rejects a body missing password with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/reactivate-account')
        .send({ email: 'player@example.com' })
        .expect(400);

      expect(authService.reactivateAccount).not.toHaveBeenCalled();
    });

    it('rejects an invalid email with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/reactivate-account')
        .send({ email: 'not-an-email', password: 'the-real-password' })
        .expect(400);

      expect(authService.reactivateAccount).not.toHaveBeenCalled();
    });
  });
});
