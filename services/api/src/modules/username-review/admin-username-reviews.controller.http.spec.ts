import { ExecutionContext, ForbiddenException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminUsernameReviewsController } from './admin-username-reviews.controller';
import { AdminUsernameReviewsService } from './admin-username-reviews.service';

// HTTP layer of the two admin routes: the role matrix (moderator and superadmin in, editor out, no token out), the
// DTO, and what is handed to the service. The rules that depend on WHO is asking (revoker exclusion, the
// child-safety rule) live in the service and are tested there and against real Postgres in the e2e spec.
describe('AdminUsernameReviewsController (HTTP layer)', () => {
  let app: INestApplication;
  const service = { list: jest.fn(), decide: jest.fn() };
  let admin: { sub: string; role: string; aud: string } | null;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminUsernameReviewsController],
      providers: [{ provide: AdminUsernameReviewsService, useValue: service }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!admin) throw new ForbiddenException('no token');
          ctx.switchToHttp().getRequest().admin = admin;
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

  beforeEach(() => {
    admin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
    service.list.mockResolvedValue({ items: [], nextCursor: null });
    service.decide.mockResolvedValue({ id: 'req-1', status: 'reinstated', decidedAt: new Date('2026-11-03T12:00:00.000Z') });
  });
  afterEach(() => jest.clearAllMocks());

  const reason = 'Reviewed the account history and the report.';

  describe('roles', () => {
    it.each(['moderator', 'superadmin'])('a %s may list and decide', async (role) => {
      admin = { sub: 'admin-1', role, aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/username-reviews').expect(200);
      await request(app.getHttpServer()).post('/admin/username-reviews/req-1/decide').send({ decision: 'reinstate', reason }).expect(200);
    });

    it('an editor gets a 403 on both routes and the service is never reached', async () => {
      admin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      await request(app.getHttpServer()).get('/admin/username-reviews').expect(403);
      await request(app.getHttpServer()).post('/admin/username-reviews/req-1/decide').send({ decision: 'decline', reason }).expect(403);
      expect(service.list).not.toHaveBeenCalled();
      expect(service.decide).not.toHaveBeenCalled();
    });

    it('no admin token: refused before anything runs', async () => {
      admin = null;
      await request(app.getHttpServer()).get('/admin/username-reviews').expect(403);
      await request(app.getHttpServer()).post('/admin/username-reviews/req-1/decide').send({ decision: 'decline', reason }).expect(403);
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('passes the paging, the status filter and the CALLER (from the token) to the service', async () => {
      await request(app.getHttpServer()).get('/admin/username-reviews?limit=5&status=pending&cursor=abc').expect(200);
      expect(service.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5, status: 'pending', cursor: 'abc' }),
        expect.objectContaining({ sub: 'admin-1', role: 'moderator' }),
      );
    });

    it.each(['status=maybe', 'limit=0', 'limit=51', 'limit=abc', 'unknown=1'])('rejects ?%s with a 400', async (qs) => {
      await request(app.getHttpServer()).get(`/admin/username-reviews?${qs}`).expect(400);
      expect(service.list).not.toHaveBeenCalled();
    });

    it('accepts each of the three statuses', async () => {
      for (const status of ['pending', 'reinstated', 'declined']) {
        await request(app.getHttpServer()).get(`/admin/username-reviews?status=${status}`).expect(200);
      }
    });
  });

  describe('decide', () => {
    it('is a 200 with the result, and hands the id, the body and the caller to the service', async () => {
      const res = await request(app.getHttpServer())
        .post('/admin/username-reviews/req-1/decide')
        .send({ decision: 'reinstate', reason })
        .expect(200);
      expect(res.body).toEqual({ id: 'req-1', status: 'reinstated', decidedAt: '2026-11-03T12:00:00.000Z' });
      expect(service.decide).toHaveBeenCalledWith(
        'req-1',
        { decision: 'reinstate', reason },
        expect.objectContaining({ sub: 'admin-1' }),
      );
    });

    it.each([
      ['no decision', { reason }],
      ['an unknown decision', { decision: 'maybe', reason }],
      ['no reason', { decision: 'decline' }],
      ['a reason that is not a string', { decision: 'decline', reason: 12345678901 }],
      ['an unknown field', { decision: 'decline', reason, extra: true }],
    ])('rejects %s with a 400', async (_label, body) => {
      await request(app.getHttpServer()).post('/admin/username-reviews/req-1/decide').send(body).expect(400);
      expect(service.decide).not.toHaveBeenCalled();
    });

    it('the 10 to 500 character rule on the reason is the service\'s (it trims first), not the pipe\'s', async () => {
      await request(app.getHttpServer()).post('/admin/username-reviews/req-1/decide').send({ decision: 'decline', reason: 'short' }).expect(200);
      expect(service.decide).toHaveBeenCalledTimes(1);
    });
  });
});
