import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminStaffRolesController } from './admin-staff-roles.controller';
import { AdminStaffRolesService } from './admin-staff-roles.service';

// Exercises the real HTTP layer: routing, DTO validation, AND the real
// AdminRolesGuard (only depends on the globally-available Reflector, no
// mocking needed) — same pattern admin-staff-vetting.controller.http.spec.ts /
// admin-users.controller.http.spec.ts already use. Only AdminJwtAuthGuard
// is overridden (bypassing real token verification).
describe('AdminStaffRolesController (HTTP layer)', () => {
  let app: INestApplication;
  const adminStaffRolesService = {
    listStaff: jest.fn(),
    updateAdminRole: jest.fn(),
    createStaff: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminStaffRolesController],
      providers: [{ provide: AdminStaffRolesService, useValue: adminStaffRolesService }, AdminRolesGuard],
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
    it('rejects an editor with 403 on GET /admin/staff', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/staff').expect(403);
      expect(adminStaffRolesService.listStaff).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on GET /admin/staff (unlike every other role-gated route in this codebase, moderator is NOT enough here)', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/staff').expect(403);
      expect(adminStaffRolesService.listStaff).not.toHaveBeenCalled();
    });

    it('rejects an editor with 403 on PATCH /admin/staff/:id/role', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'moderator' })
        .expect(403);
      expect(adminStaffRolesService.updateAdminRole).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on PATCH /admin/staff/:id/role', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'editor' })
        .expect(403);
      expect(adminStaffRolesService.updateAdminRole).not.toHaveBeenCalled();
    });

    it('allows a superadmin through on both routes', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      adminStaffRolesService.listStaff.mockResolvedValue({ items: [], nextCursor: null });
      adminStaffRolesService.updateAdminRole.mockResolvedValue({ id: 'target-admin-1', role: 'moderator' });

      await request(app.getHttpServer()).get('/admin/staff').expect(200);
      await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'moderator' })
        .expect(200);
      expect(adminStaffRolesService.listStaff).toHaveBeenCalledTimes(1);
      expect(adminStaffRolesService.updateAdminRole).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/staff', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
    });

    it('passes the query through to the service', async () => {
      adminStaffRolesService.listStaff.mockResolvedValue({ items: [{ id: 'admin-1' }], nextCursor: null });

      const res = await request(app.getHttpServer())
        .get('/admin/staff')
        .query({ role: 'moderator', limit: 10 })
        .expect(200);

      expect(adminStaffRolesService.listStaff).toHaveBeenCalledWith({ role: 'moderator', limit: 10 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an invalid role filter', async () => {
      await request(app.getHttpServer()).get('/admin/staff').query({ role: 'bogus' }).expect(400);
      expect(adminStaffRolesService.listStaff).not.toHaveBeenCalled();
    });

    it('accepts every real role value as a filter', async () => {
      adminStaffRolesService.listStaff.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/staff').query({ role: 'editor' }).expect(200);
      await request(app.getHttpServer()).get('/admin/staff').query({ role: 'moderator' }).expect(200);
      await request(app.getHttpServer()).get('/admin/staff').query({ role: 'superadmin' }).expect(200);
    });
  });

  describe('PATCH /admin/staff/:id/role', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'superadmin-1', role: 'superadmin', aud: 'admin-console' };
    });

    it('assigns a new role, forwarding the TARGET admin id and the calling superadmin id separately', async () => {
      adminStaffRolesService.updateAdminRole.mockResolvedValue({
        id: 'target-admin-1',
        email: 'ed@example.com',
        fullName: 'An Editor',
        role: 'moderator',
        accountStatus: 'active',
        createdAt: '2026-09-27T00:00:00.000Z',
      });

      const res = await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'moderator' })
        .expect(200);

      expect(adminStaffRolesService.updateAdminRole).toHaveBeenCalledWith(
        'target-admin-1',
        'superadmin-1',
        { role: 'moderator' },
      );
      expect(res.body.role).toBe('moderator');
      // Never leaks passwordHash — response is an explicit allowlist.
      expect(res.body.passwordHash).toBeUndefined();
    });

    it('rejects a missing role', async () => {
      await request(app.getHttpServer()).patch('/admin/staff/target-admin-1/role').send({}).expect(400);
      expect(adminStaffRolesService.updateAdminRole).not.toHaveBeenCalled();
    });

    it('rejects a role outside the real editor/moderator/superadmin set', async () => {
      await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'owner' })
        .expect(400);
      expect(adminStaffRolesService.updateAdminRole).not.toHaveBeenCalled();
    });

    it('rejects an unrecognised extra field (whitelist: true, forbidNonWhitelisted: true)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'moderator', accountStatus: 'suspended' })
        .expect(400);
      expect(adminStaffRolesService.updateAdminRole).not.toHaveBeenCalled();
    });

    it('surfaces the service-level 409 for a last-active-superadmin demotion', async () => {
      const { ConflictException } = await import('@nestjs/common');
      adminStaffRolesService.updateAdminRole.mockRejectedValue(
        new ConflictException('Cannot change this role: it belongs to the last active superadmin account.'),
      );

      await request(app.getHttpServer())
        .patch('/admin/staff/target-admin-1/role')
        .send({ role: 'editor' })
        .expect(409);
    });
  });

  describe('POST /admin/staff', () => {
    const body = { email: 'new@example.com', fullName: 'New Person', role: 'moderator' };

    it.each(['editor', 'moderator'])('rejects a %s with 403', async (role) => {
      currentAdmin = { sub: 'admin-1', role, aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/staff').send(body).expect(403);
      expect(adminStaffRolesService.createStaff).not.toHaveBeenCalled();
    });

    it('lets a superadmin create, forwarding the calling admin id and dto', async () => {
      currentAdmin = { sub: 'superadmin-1', role: 'superadmin', aud: 'admin-console' };
      adminStaffRolesService.createStaff.mockResolvedValue({ id: 'new-1', ...body, temporaryPassword: 'generated' });

      const res = await request(app.getHttpServer()).post('/admin/staff').send(body).expect(201);

      expect(adminStaffRolesService.createStaff).toHaveBeenCalledWith('superadmin-1', body);
      expect(res.body.temporaryPassword).toBe('generated');
    });

    it.each([
      ['invalid email', { ...body, email: 'nope' }],
      ['missing fullName', { email: body.email, role: 'editor' }],
      ['role outside the real set', { ...body, role: 'owner' }],
      ['password shorter than 8', { ...body, temporaryPassword: 'short' }],
      ['extra field (e.g. accountStatus)', { ...body, accountStatus: 'active' }],
    ])('rejects %s with 400', async (_label, payload) => {
      currentAdmin = { sub: 'superadmin-1', role: 'superadmin', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/staff').send(payload).expect(400);
      expect(adminStaffRolesService.createStaff).not.toHaveBeenCalled();
    });
  });
});
