import { ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminProfileController } from './admin-profile.controller';
import { AdminProfileService } from './admin-profile.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminAccessTokenPayload } from './token/admin-token.types';

// Exercises real HTTP request/response handling (routing, DTO validation,
// status codes) with AdminProfileService mocked out — mirrors the
// established *.controller.http.spec.ts pattern in this codebase
// (auth.controller.http.spec.ts, users.controller.http.spec.ts).
const AUTHENTICATED_ADMIN: AdminAccessTokenPayload = {
  sub: 'admin-1',
  role: 'moderator',
  aud: 'admin-console',
};

describe('AdminProfileController (HTTP layer)', () => {
  let app: INestApplication;
  const adminProfileService = {
    getOwnProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
  };

  const adminSummary = {
    id: 'admin-1',
    email: 'admin@example.com',
    fullName: 'Test Admin',
    phone: null,
    role: 'moderator',
    accountStatus: 'active',
    createdAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
    updatedAt: new Date('2026-09-01T00:00:00.000Z').toISOString(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminProfileController],
      providers: [{ provide: AdminProfileService, useValue: adminProfileService }],
    })
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

  describe('GET /admin/profile', () => {
    it('returns 200 with the caller-from-JWT admin summary, not any path/body-supplied id', async () => {
      adminProfileService.getOwnProfile.mockResolvedValueOnce(adminSummary);

      const response = await request(app.getHttpServer()).get('/admin/profile').expect(200);

      expect(response.body).toEqual(adminSummary);
      expect(adminProfileService.getOwnProfile).toHaveBeenCalledWith(AUTHENTICATED_ADMIN.sub);
    });

    it('propagates a 404 thrown by the service (since-removed admin account)', async () => {
      adminProfileService.getOwnProfile.mockRejectedValueOnce(
        new NotFoundException('Admin account not found'),
      );

      await request(app.getHttpServer()).get('/admin/profile').expect(404);
    });
  });

  describe('PATCH /admin/profile', () => {
    it('returns 200 and delegates to the service with the caller-from-JWT id and the allowed fields', async () => {
      adminProfileService.updateOwnProfile.mockResolvedValueOnce({
        ...adminSummary,
        fullName: 'Updated Name',
        phone: '+2348012345678',
      });

      const response = await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ fullName: 'Updated Name', phone: '+2348012345678' })
        .expect(200);

      expect(response.body.fullName).toBe('Updated Name');
      expect(adminProfileService.updateOwnProfile).toHaveBeenCalledWith(AUTHENTICATED_ADMIN.sub, {
        fullName: 'Updated Name',
        phone: '+2348012345678',
      });
    });

    it('rejects an attempt to self-edit role with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ role: 'superadmin' })
        .expect(400);

      expect(adminProfileService.updateOwnProfile).not.toHaveBeenCalled();
    });

    it('rejects an attempt to self-edit email with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ email: 'new-email@example.com' })
        .expect(400);

      expect(adminProfileService.updateOwnProfile).not.toHaveBeenCalled();
    });

    it('rejects an attempt to self-edit accountStatus with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ accountStatus: 'active' })
        .expect(400);

      expect(adminProfileService.updateOwnProfile).not.toHaveBeenCalled();
    });

    it('rejects an invalid phone with 400', async () => {
      await request(app.getHttpServer())
        .patch('/admin/profile')
        .send({ phone: 'not-a-phone-number!!' })
        .expect(400);

      expect(adminProfileService.updateOwnProfile).not.toHaveBeenCalled();
    });
  });
});

// Real AdminJwtAuthGuard behavior (missing/malformed/invalid-signature/
// wrong-audience bearer tokens) is covered directly and thoroughly by
// guards/admin-jwt-auth.guard.spec.ts — deliberately not re-tested here
// via a second, differently-wired app instance, to avoid two tests
// asserting the same guard behavior in two different, harder-to-keep-in-
// sync ways.
