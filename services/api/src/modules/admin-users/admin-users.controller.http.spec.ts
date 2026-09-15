import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
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
