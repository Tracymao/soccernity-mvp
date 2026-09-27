import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminStaffVettingController } from './admin-staff-vetting.controller';
import { AdminStaffVettingService } from './admin-staff-vetting.service';

// Exercises the real HTTP layer: routing, DTO validation, AND the real
// AdminRolesGuard (only depends on the globally-available Reflector, no
// mocking needed) — same pattern admin-moderation.controller.http.spec.ts /
// admin-users.controller.http.spec.ts already use. Only AdminJwtAuthGuard
// is overridden (bypassing real token verification).
describe('AdminStaffVettingController (HTTP layer)', () => {
  let app: INestApplication;
  const adminStaffVettingService = {
    setChildSafetyVetting: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminStaffVettingController],
      providers: [{ provide: AdminStaffVettingService, useValue: adminStaffVettingService }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = currentAdmin;
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

  afterEach(() => jest.clearAllMocks());

  describe('role gating (superadmin ONLY — not moderator, not editor)', () => {
    it('rejects an editor with 403', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: true })
        .expect(403);
      expect(adminStaffVettingService.setChildSafetyVetting).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 (unlike every other role-gated route in this codebase, moderator is NOT enough here)', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: true })
        .expect(403);
      expect(adminStaffVettingService.setChildSafetyVetting).not.toHaveBeenCalled();
    });

    it('allows a superadmin through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      adminStaffVettingService.setChildSafetyVetting.mockResolvedValue({
        id: 'target-admin-1',
        childSafetyVetted: true,
      });

      await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: true })
        .expect(200);
      expect(adminStaffVettingService.setChildSafetyVetting).toHaveBeenCalledTimes(1);
    });
  });

  describe('PATCH /admin/users/:id/child-safety-vetting', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'superadmin-1', role: 'superadmin', aud: 'admin-console' };
    });

    it('sets childSafetyVetted true, forwarding the TARGET admin id and the calling superadmin id separately', async () => {
      adminStaffVettingService.setChildSafetyVetting.mockResolvedValue({
        id: 'target-admin-1',
        email: 'mod@example.com',
        fullName: 'A Moderator',
        role: 'moderator',
        childSafetyVetted: true,
        vettedAt: '2026-09-27T00:00:00.000Z',
        vettedByAdminId: 'superadmin-1',
      });

      const res = await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: true })
        .expect(200);

      expect(adminStaffVettingService.setChildSafetyVetting).toHaveBeenCalledWith(
        'target-admin-1',
        'superadmin-1',
        { childSafetyVetted: true },
      );
      expect(res.body.childSafetyVetted).toBe(true);
      expect(res.body.vettedByAdminId).toBe('superadmin-1');
      // Never leaks passwordHash — response is an explicit allowlist.
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('unsets childSafetyVetted false', async () => {
      adminStaffVettingService.setChildSafetyVetting.mockResolvedValue({
        id: 'target-admin-1',
        childSafetyVetted: false,
        vettedAt: null,
        vettedByAdminId: null,
      });

      const res = await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: false })
        .expect(200);

      expect(adminStaffVettingService.setChildSafetyVetting).toHaveBeenCalledWith(
        'target-admin-1',
        'superadmin-1',
        { childSafetyVetted: false },
      );
      expect(res.body.childSafetyVetted).toBe(false);
      expect(res.body.vettedAt).toBeNull();
    });

    it('rejects a missing childSafetyVetted', async () => {
      await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({})
        .expect(400);
      expect(adminStaffVettingService.setChildSafetyVetting).not.toHaveBeenCalled();
    });

    it('rejects a non-boolean childSafetyVetted', async () => {
      await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: 'yes' })
        .expect(400);
    });

    it('rejects an unrecognised extra field (whitelist: true, forbidNonWhitelisted: true)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/users/target-admin-1/child-safety-vetting')
        .send({ childSafetyVetted: true, role: 'superadmin' })
        .expect(400);
    });
  });
});
