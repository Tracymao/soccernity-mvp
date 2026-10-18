import { ExecutionContext, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminUsersController } from './admin-users.controller';
import { AdminUserDetailService } from './admin-user-detail.service';
import { AdminUserDobCorrectionService } from './admin-user-dob-correction.service';
import { AdminUserUsernameRevokeService } from './admin-user-username-revoke.service';
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

  // B-109 / B-103.
  const adminUserDetailService = { getUserDetail: jest.fn(), getUserSummary: jest.fn() };
  const adminUserDobCorrectionService = { correctDateOfBirth: jest.fn() };
  const adminUserUsernameRevokeService = { revokeUsername: jest.fn() };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsersController],
      providers: [
        { provide: AdminUsersService, useValue: adminUsersService },
        { provide: AdminUserDetailService, useValue: adminUserDetailService },
        { provide: AdminUserDobCorrectionService, useValue: adminUserDobCorrectionService },
        { provide: AdminUserUsernameRevokeService, useValue: adminUserUsernameRevokeService },
        AdminRolesGuard,
      ],
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

  // B-129 (Decision Log #406 item 4): User Detail without the date of birth.
  describe('GET /admin/users/:id/summary (B-129)', () => {
    it('is closed to an editor (moderator / superadmin only, like the rest of the controller)', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/users/u1/summary').expect(403);
      expect(adminUserDetailService.getUserSummary).not.toHaveBeenCalled();
    });

    it.each(['moderator', 'superadmin'])('serves the summary to a %s, and never touches the DOB read', async (role) => {
      currentAdmin = { sub: 'admin-1', role, aud: 'admin-console' };
      adminUserDetailService.getUserSummary.mockResolvedValue({ id: 'u1', email: 'a@example.com' });
      const res = await request(app.getHttpServer()).get('/admin/users/u1/summary').expect(200);
      expect(res.body).toEqual({ id: 'u1', email: 'a@example.com' });
      expect(adminUserDetailService.getUserSummary).toHaveBeenCalledWith('u1');
      // The audited DOB read is a different route and a different method.
      expect(adminUserDetailService.getUserDetail).not.toHaveBeenCalled();
    });

    it('the full read is still its own route, still audited under the admin id', async () => {
      currentAdmin = { sub: 'admin-9', role: 'moderator', aud: 'admin-console' };
      adminUserDetailService.getUserDetail.mockResolvedValue({ id: 'u1' });
      await request(app.getHttpServer()).get('/admin/users/u1').expect(200);
      expect(adminUserDetailService.getUserDetail).toHaveBeenCalledWith('u1', 'admin-9');
      expect(adminUserDetailService.getUserSummary).not.toHaveBeenCalled();
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

  // B-109 (Decision Log #398 D4): the single-user read.
  describe('GET /admin/users/:id (B-109)', () => {
    it('rejects an editor with 403 and never reaches the service', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/users/u1').expect(403);
      expect(adminUserDetailService.getUserDetail).not.toHaveBeenCalled();
    });

    it.each(['moderator', 'superadmin'])('passes the user id and the CALLING admin id for a %s', async (role) => {
      currentAdmin = { sub: 'admin-9', role, aud: 'admin-console' };
      adminUserDetailService.getUserDetail.mockResolvedValue({ id: 'u1', dateOfBirth: '2012-03-04' });
      const res = await request(app.getHttpServer()).get('/admin/users/u1').expect(200);
      expect(res.body).toEqual({ id: 'u1', dateOfBirth: '2012-03-04' });
      expect(adminUserDetailService.getUserDetail).toHaveBeenCalledWith('u1', 'admin-9');
    });

    it('surfaces the service 404', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUserDetailService.getUserDetail.mockRejectedValue(new NotFoundException('User not found'));
      await request(app.getHttpServer()).get('/admin/users/nope').expect(404);
    });

    it('does not shadow the literal-path GETs', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUsersService.listIncorrectDetailsReports.mockResolvedValue({ items: [], truncated: false });
      adminUsersService.listStalledHolds.mockResolvedValue({ thresholdDays: 90, items: [] });
      await request(app.getHttpServer()).get('/admin/users/incorrect-details-reports').expect(200);
      await request(app.getHttpServer()).get('/admin/users/held-investigations').expect(200);
      expect(adminUserDetailService.getUserDetail).not.toHaveBeenCalled();
    });
  });

  // B-103 (Decision Log #390, #395 B4): the audited DOB correction.
  describe('POST /admin/users/:id/username-revoke (B-033)', () => {
    const valid = { reason: 'Impersonates a club account, reported twice' };

    it('rejects an editor with 403 and never reaches the service', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/users/u1/username-revoke').send(valid).expect(403);
      expect(adminUserUsernameRevokeService.revokeUsername).not.toHaveBeenCalled();
    });

    it.each(['moderator', 'superadmin'])('passes the target id, the CALLING admin id and the body for a %s, and returns 200', async (role) => {
      currentAdmin = { sub: 'admin-7', role, aud: 'admin-console' };
      adminUserUsernameRevokeService.revokeUsername.mockResolvedValue({ userId: 'u1' });
      await request(app.getHttpServer()).post('/admin/users/u1/username-revoke').send(valid).expect(200);
      expect(adminUserUsernameRevokeService.revokeUsername).toHaveBeenCalledWith('u1', 'admin-7', expect.objectContaining(valid));
    });

    it.each([
      ['no reason', {}],
      ['a too-short reason', { reason: 'bad' }],
      ['a reason over 500 characters', { reason: 'x'.repeat(501) }],
      ['an unknown field', { ...valid, username: 'someone_else' }],
    ])('rejects %s with 400', async (_label, body) => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/users/u1/username-revoke').send(body).expect(400);
      expect(adminUserUsernameRevokeService.revokeUsername).not.toHaveBeenCalled();
    });

    it('surfaces the service 404', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUserUsernameRevokeService.revokeUsername.mockRejectedValue(new NotFoundException('User not found'));
      await request(app.getHttpServer()).post('/admin/users/missing/username-revoke').send(valid).expect(404);
    });
  });

  describe('POST /admin/users/:id/dob-correction (B-103)', () => {
    const valid = { dateOfBirth: '2012-03-04', reason: 'Parent supplied a birth certificate' };

    it('rejects an editor with 403', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/users/u1/dob-correction').send(valid).expect(403);
      expect(adminUserDobCorrectionService.correctDateOfBirth).not.toHaveBeenCalled();
    });

    it('passes the target id, the CALLING admin id and the body, and returns 200', async () => {
      currentAdmin = { sub: 'admin-7', role: 'moderator', aud: 'admin-console' };
      adminUserDobCorrectionService.correctDateOfBirth.mockResolvedValue({ userId: 'u1' });
      await request(app.getHttpServer()).post('/admin/users/u1/dob-correction').send(valid).expect(200);
      expect(adminUserDobCorrectionService.correctDateOfBirth).toHaveBeenCalledWith(
        'u1',
        'admin-7',
        expect.objectContaining(valid),
      );
    });

    it.each([
      ['no reason', { dateOfBirth: '2012-03-04' }],
      ['a too-short reason', { dateOfBirth: '2012-03-04', reason: 'oops' }],
      ['a non-date', { dateOfBirth: 'yesterday', reason: 'Parent supplied a birth certificate' }],
      ['an unknown field', { ...valid, accountStatus: 'active' }],
    ])('rejects %s with 400', async (_label, body) => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      await request(app.getHttpServer()).post('/admin/users/u1/dob-correction').send(body).expect(400);
      expect(adminUserDobCorrectionService.correctDateOfBirth).not.toHaveBeenCalled();
    });

    it('validates a nested guardian (bad relationship is a 400)', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      await request(app.getHttpServer())
        .post('/admin/users/u1/dob-correction')
        .send({ ...valid, guardian: { name: 'G', email: 'g@example.com', relationship: 'Neighbour' } })
        .expect(400);
    });

    it('accepts a valid nested guardian', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      adminUserDobCorrectionService.correctDateOfBirth.mockResolvedValue({ userId: 'u1' });
      await request(app.getHttpServer())
        .post('/admin/users/u1/dob-correction')
        .send({ ...valid, guardian: { name: 'G', email: 'g@example.com', relationship: 'Parent' } })
        .expect(200);
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
