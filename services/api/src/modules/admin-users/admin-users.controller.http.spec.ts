import { ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

describe('AdminUsersController (HTTP layer)', () => {
  let app: INestApplication;
  const adminUsersService = {
    listUsers: jest.fn(),
    updateUserStatus: jest.fn(),
    listStalledHolds: jest.fn(),
    listIncorrectDetailsReports: jest.fn(),
    resolveIncorrectDetailsReport: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [{ provide: AdminUsersService, useValue: adminUsersService }, AdminRolesGuard],
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

  describe('role gating (moderator/superadmin only, not editor)', () => {
    it('rejects an editor with 403 on GET /admin/users', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/users').expect(403);
      expect(adminUsersService.listUsers).not.toHaveBeenCalled();
    });

    it('rejects an editor with 403 on PATCH /admin/users/:id', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/users/user-1')
        .send({ status: 'suspended' })
        .expect(403);
      expect(adminUsersService.updateUserStatus).not.toHaveBeenCalled();
    });

    it('allows a moderator through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUsersService.listUsers.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/users').expect(200);
      expect(adminUsersService.listUsers).toHaveBeenCalledTimes(1);
    });

    it('allows a superadmin through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      adminUsersService.listUsers.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/users').expect(200);
      expect(adminUsersService.listUsers).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/users/held-investigations', () => {
    it('rejects an editor with 403', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/users/held-investigations').expect(403);
      expect(adminUsersService.listStalledHolds).not.toHaveBeenCalled();
    });

    it('passes olderThanDays through as a number for a moderator', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUsersService.listStalledHolds.mockResolvedValue({ thresholdDays: 45, items: [] });
      await request(app.getHttpServer()).get('/admin/users/held-investigations?olderThanDays=45').expect(200);
      expect(adminUsersService.listStalledHolds).toHaveBeenCalledWith(45);
    });

    it('rejects a negative threshold with 400', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/users/held-investigations?olderThanDays=-1').expect(400);
    });
  });

  // B-029 (Decision Log #372): the support side of the guardian's "report incorrect details" flag.
  describe('incorrect-details reports (B-029)', () => {
    it('GET rejects an editor with 403 and does not reach the service', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/users/incorrect-details-reports').expect(403);
      expect(adminUsersService.listIncorrectDetailsReports).not.toHaveBeenCalled();
    });

    it('GET returns the list for a moderator', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUsersService.listIncorrectDetailsReports.mockResolvedValue({ items: [{ userId: 'u1' }], truncated: false });
      const res = await request(app.getHttpServer()).get('/admin/users/incorrect-details-reports').expect(200);
      expect(res.body).toEqual({ items: [{ userId: 'u1' }], truncated: false });
    });

    it('POST resolve rejects an editor with 403 and does not reach the service', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/users/u1/incorrect-details-report/resolve').expect(403);
      expect(adminUsersService.resolveIncorrectDetailsReport).not.toHaveBeenCalled();
    });

    it('POST resolve passes the user id and the CALLING admin id, and returns 200', async () => {
      currentAdmin = { sub: 'admin-7', role: 'superadmin', aud: 'admin-console' };
      adminUsersService.resolveIncorrectDetailsReport.mockResolvedValue({ resolved: true });
      const res = await request(app.getHttpServer()).post('/admin/users/u1/incorrect-details-report/resolve').expect(200);
      expect(res.body).toEqual({ resolved: true });
      expect(adminUsersService.resolveIncorrectDetailsReport).toHaveBeenCalledWith('u1', 'admin-7');
    });

    it('POST resolve surfaces the service 404 (no open report)', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUsersService.resolveIncorrectDetailsReport.mockRejectedValue(
        new NotFoundException('No open incorrect-details report for this user'),
      );
      await request(app.getHttpServer()).post('/admin/users/u1/incorrect-details-report/resolve').expect(404);
    });
  });

  describe('GET /admin/users', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
    });

    it('passes the query through to the service', async () => {
      adminUsersService.listUsers.mockResolvedValue({ items: [{ id: 'user-1' }], nextCursor: null });

      const res = await request(app.getHttpServer())
        .get('/admin/users')
        .query({ status: 'suspended', limit: 10 })
        .expect(200);

      expect(adminUsersService.listUsers).toHaveBeenCalledWith({ status: 'suspended', limit: 10 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an invalid status filter', async () => {
      await request(app.getHttpServer()).get('/admin/users').query({ status: 'bogus' }).expect(400);
    });

    it('accepts every real accountStatus value as a filter, including ones this route cannot write', async () => {
      adminUsersService.listUsers.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/users').query({ status: 'deactivated' }).expect(200);
      await request(app.getHttpServer()).get('/admin/users').query({ status: 'pending_deletion' }).expect(200);
    });
  });

  describe('PATCH /admin/users/:id', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
    });

    it('suspends a user', async () => {
      adminUsersService.updateUserStatus.mockResolvedValue({
        deleted: false,
        user: { id: 'user-1', accountStatus: 'suspended' },
      });

      const res = await request(app.getHttpServer())
        .patch('/admin/users/user-1')
        .send({ status: 'suspended' })
        .expect(200);

      expect(adminUsersService.updateUserStatus).toHaveBeenCalledWith('user-1', 'admin-1', { status: 'suspended' });
      expect(res.body.user.accountStatus).toBe('suspended');
    });

    it('deletes a user immediately', async () => {
      adminUsersService.updateUserStatus.mockResolvedValue({ deleted: true, id: 'user-1' });

      const res = await request(app.getHttpServer())
        .patch('/admin/users/user-1')
        .send({ status: 'deleted' })
        .expect(200);

      expect(adminUsersService.updateUserStatus).toHaveBeenCalledWith('user-1', 'admin-1', { status: 'deleted' });
      expect(res.body).toEqual({ deleted: true, id: 'user-1' });
    });

    it('rejects an action outside the allowed set (e.g. deactivated/pending_deletion — self-service only)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/users/user-1')
        .send({ status: 'deactivated' })
        .expect(400);
      await request(app.getHttpServer())
        .patch('/admin/users/user-1')
        .send({ status: 'pending_deletion' })
        .expect(400);
      expect(adminUsersService.updateUserStatus).not.toHaveBeenCalled();
    });

    it('rejects a missing status', async () => {
      await request(app.getHttpServer()).patch('/admin/users/user-1').send({}).expect(400);
    });
  });
});
