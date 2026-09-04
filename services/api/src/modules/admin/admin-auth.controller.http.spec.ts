import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminAccessTokenPayload } from './token/admin-token.types';

// Exercises real HTTP request/response handling (routing, DTO validation,
// status codes) with AdminAuthService mocked out — mirrors
// auth/auth.controller.http.spec.ts's exact pattern, scoped to the Admin
// Console's own controller/guard classes throughout (never the
// User-facing ones), proving the two are wired independently even at the
// HTTP-test-harness level.
const AUTHENTICATED_ADMIN: AdminAccessTokenPayload = {
  sub: 'admin-1',
  role: 'editor',
  aud: 'admin-console',
};

describe('AdminAuthController (HTTP layer)', () => {
  let app: INestApplication;
  const adminAuthService = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    changePassword: jest.fn(),
  };

  const tokenPairResponse = {
    accessToken: 'admin-access-token',
    accessTokenExpiresIn: 900,
    refreshToken: 'refresh-id.secret',
    refreshTokenExpiresAt: new Date('2026-09-04T00:00:00.000Z').toISOString(),
  };

  const adminAuthResponse = {
    ...tokenPairResponse,
    admin: {
      id: 'admin-1',
      email: 'admin@example.com',
      fullName: 'Test Admin',
      phone: null,
      role: 'editor',
      accountStatus: 'active',
      createdAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
      updatedAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [{ provide: AdminAuthService, useValue: adminAuthService }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.admin = AUTHENTICATED_ADMIN;
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

  describe('POST /admin/auth/login', () => {
    it('returns 200 with the token pair and admin summary on success', async () => {
      adminAuthService.login.mockResolvedValueOnce(adminAuthResponse);

      const response = await request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({ email: 'admin@example.com', password: 'password123' })
        .expect(200);

      expect(response.body).toEqual(adminAuthResponse);
      expect(adminAuthService.login).toHaveBeenCalledWith('admin@example.com', 'password123');
    });

    it('rejects a body missing the password field with 400', async () => {
      await request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({ email: 'admin@example.com' })
        .expect(400);

      expect(adminAuthService.login).not.toHaveBeenCalled();
    });

    it('rejects an unexpected extra field with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/admin/auth/login')
        .send({ email: 'admin@example.com', password: 'password123', role: 'superadmin' })
        .expect(400);

      expect(adminAuthService.login).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/auth/refresh', () => {
    it('returns 200 with the rotated token pair on success', async () => {
      adminAuthService.refresh.mockResolvedValueOnce(tokenPairResponse);

      const response = await request(app.getHttpServer())
        .post('/admin/auth/refresh')
        .send({ refreshToken: 'refresh-id.secret' })
        .expect(200);

      expect(response.body).toEqual(tokenPairResponse);
      expect(adminAuthService.refresh).toHaveBeenCalledWith('refresh-id.secret');
    });

    it('rejects a body missing refreshToken with 400', async () => {
      await request(app.getHttpServer()).post('/admin/auth/refresh').send({}).expect(400);

      expect(adminAuthService.refresh).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/auth/logout', () => {
    it('returns 204 on success', async () => {
      adminAuthService.logout.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/admin/auth/logout')
        .send({ refreshToken: 'refresh-id.secret' })
        .expect(204);

      expect(adminAuthService.logout).toHaveBeenCalledWith('refresh-id.secret', false, undefined);
    });

    it('rejects a body missing refreshToken with 400', async () => {
      await request(app.getHttpServer()).post('/admin/auth/logout').send({}).expect(400);

      expect(adminAuthService.logout).not.toHaveBeenCalled();
    });
  });

  describe('POST /admin/auth/change-password', () => {
    it('returns 204 and delegates to adminAuthService with the caller-from-JWT id, not a body field', async () => {
      adminAuthService.changePassword.mockResolvedValueOnce(undefined);

      await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(204);

      expect(adminAuthService.changePassword).toHaveBeenCalledWith(
        AUTHENTICATED_ADMIN.sub,
        'old-password',
        'new-password-123',
      );
    });

    it('rejects a newPassword shorter than 8 characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .send({ currentPassword: 'old-password', newPassword: 'short' })
        .expect(400);

      expect(adminAuthService.changePassword).not.toHaveBeenCalled();
    });

    it('propagates a 401 thrown by the service (wrong current password)', async () => {
      adminAuthService.changePassword.mockRejectedValueOnce(
        new UnauthorizedException('Current password is incorrect'),
      );

      await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .send({ currentPassword: 'wrong', newPassword: 'new-password-123' })
        .expect(401);
    });
  });
});
