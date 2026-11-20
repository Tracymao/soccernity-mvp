import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { TwoFactorService } from '../two-factor/two-factor.service';
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
      providers: [
        { provide: AdminAuthService, useValue: adminAuthService },
        // The controller also injects TwoFactorService (admin enrolment start); covered by the two-factor specs.
        { provide: TwoFactorService, useValue: {} },
      ],
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
      expect(adminAuthService.login).toHaveBeenCalledWith('admin@example.com', 'password123', false);
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
    // B-310: the change revokes every session including the caller's own, so it answers 200 with a FRESH session
    // (no admin summary), except the decided case below.
    const FRESH_SESSION = { response: tokenPairResponse, persistent: false };

    it('returns 200 with a fresh token pair and delegates with the caller-from-JWT id, not a body field', async () => {
      adminAuthService.changePassword.mockResolvedValueOnce(FRESH_SESSION);

      const res = await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(200);

      expect(res.body).toEqual(tokenPairResponse);
      expect(res.body.admin).toBeUndefined();
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(adminAuthService.changePassword).toHaveBeenCalledWith(
        AUTHENTICATED_ADMIN.sub,
        'old-password',
        'new-password-123',
        undefined,
      );
    });

    it('cookie mode: sets the new sn_admin_rt cookie, leaves the refresh token out of the body, reads the CURRENT cookie', async () => {
      adminAuthService.changePassword.mockResolvedValueOnce({ response: tokenPairResponse, persistent: true });

      const res = await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .set('X-Auth-Mode', 'cookie')
        .set('Origin', 'http://localhost:5174')
        .set('Cookie', 'sn_admin_rt=current-id.current-secret; sn_rt=a-user-cookie')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(200);

      expect(res.body.accessToken).toBe('admin-access-token');
      expect(res.body.refreshToken).toBeUndefined();
      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_admin_rt=refresh-id.secret');
      expect(cookie).toContain('Path=/admin/auth');
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Max-Age=\d+/i);
      // only the ADMIN cookie is read, never the user one
      expect(adminAuthService.changePassword).toHaveBeenCalledWith(
        AUTHENTICATED_ADMIN.sub,
        'old-password',
        'new-password-123',
        'current-id.current-secret',
      );
    });

    it('cookie mode from a foreign Origin is a 403 and the password is NOT changed', async () => {
      await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .set('X-Auth-Mode', 'cookie')
        .set('Origin', 'https://evil.example')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(403);

      expect(adminAuthService.changePassword).not.toHaveBeenCalled();
    });

    // The decided exception: ADMIN_2FA_ENFORCED on and no two-factor for this admin. The password is saved and every
    // session revoked, but no session is issued (it would sidestep the refresh gate).
    it('204 with NO body when the service issues nothing (enforced, no two-factor)', async () => {
      adminAuthService.changePassword.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(204);

      expect(res.text).toBe('');
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('204 in cookie mode also clears the now-dead admin cookie', async () => {
      adminAuthService.changePassword.mockResolvedValueOnce(null);

      const res = await request(app.getHttpServer())
        .post('/admin/auth/change-password')
        .set('X-Auth-Mode', 'cookie')
        .set('Origin', 'http://localhost:5174')
        .set('Cookie', 'sn_admin_rt=current-id.current-secret')
        .send({ currentPassword: 'old-password', newPassword: 'new-password-123' })
        .expect(204);

      const cookie = String(res.headers['set-cookie']);
      expect(cookie).toContain('sn_admin_rt=;');
      expect(cookie).toMatch(/Max-Age=0/i);
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
