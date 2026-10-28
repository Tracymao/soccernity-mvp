import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminMediaReviewController } from './admin-media-review.controller';
import { AdminMediaReviewService } from './admin-media-review.service';

describe('AdminMediaReviewController (HTTP layer)', () => {
  let app: INestApplication;
  const service = { list: jest.fn(), stats: jest.fn(), get: jest.fn(), approve: jest.fn(), reject: jest.fn() };
  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMediaReviewController],
      providers: [{ provide: AdminMediaReviewService, useValue: service }, AdminRolesGuard],
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

  afterAll(async () => app.close());
  beforeEach(() => {
    jest.clearAllMocks();
    currentAdmin = { sub: 'mod-1', role: 'moderator', aud: 'admin-console' };
  });

  it('is closed to an editor on every route, and open to a moderator and a superadmin', async () => {
    currentAdmin = { sub: 'e', role: 'editor', aud: 'admin-console' };
    await request(app.getHttpServer()).get('/admin/media-review').expect(403);
    await request(app.getHttpServer()).get('/admin/media-review/stats').expect(403);
    await request(app.getHttpServer()).get('/admin/media-review/m1').expect(403);
    await request(app.getHttpServer()).post('/admin/media-review/m1/approve').expect(403);
    await request(app.getHttpServer()).post('/admin/media-review/m1/reject').send({ reason: 'x' }).expect(403);
    expect(service.list).not.toHaveBeenCalled();

    service.list.mockResolvedValue({ items: [], nextCursor: null });
    currentAdmin = { sub: 'm', role: 'moderator', aud: 'admin-console' };
    await request(app.getHttpServer()).get('/admin/media-review').expect(200);
    currentAdmin = { sub: 's', role: 'superadmin', aud: 'admin-console' };
    await request(app.getHttpServer()).get('/admin/media-review').expect(200);
  });

  it('GET / validates and forwards the filters', async () => {
    service.list.mockResolvedValue({ items: [], nextCursor: null });
    await request(app.getHttpServer()).get('/admin/media-review?order=oldest&source=user_report&status=approved&limit=5&cursor=abc').expect(200);
    // The acting admin id travels with the filters (the vetting rule is applied per admin, B-258).
    expect(service.list).toHaveBeenCalledWith({ order: 'oldest', source: 'user_report', status: 'approved', limit: 5, cursor: 'abc' }, 'mod-1');
    await request(app.getHttpServer()).get('/admin/media-review?order=sideways').expect(400);
    await request(app.getHttpServer()).get('/admin/media-review?source=nope').expect(400);
    await request(app.getHttpServer()).get('/admin/media-review?status=nope').expect(400);
    await request(app.getHttpServer()).get('/admin/media-review?limit=51').expect(400);
  });

  it('GET /stats is not captured as an :id, and bounds the window', async () => {
    service.stats.mockResolvedValue({ windowDays: 14 });
    await request(app.getHttpServer()).get('/admin/media-review/stats?days=14').expect(200);
    expect(service.stats).toHaveBeenCalledWith(14);
    expect(service.get).not.toHaveBeenCalled();
    await request(app.getHttpServer()).get('/admin/media-review/stats?days=0').expect(400);
    await request(app.getHttpServer()).get('/admin/media-review/stats?days=91').expect(400);
  });

  it('POST approve passes the calling admin id', async () => {
    service.approve.mockResolvedValue({ id: 'm1', outcome: 'approved', status: 'approved' });
    await request(app.getHttpServer()).post('/admin/media-review/m1/approve').expect(200);
    expect(service.approve).toHaveBeenCalledWith('m1', 'mod-1');
  });

  it('POST reject requires a reason: trimmed, non-blank, at most 300 characters', async () => {
    service.reject.mockResolvedValue({ id: 'm1', outcome: 'rejected', status: 'rejected' });
    await request(app.getHttpServer()).post('/admin/media-review/m1/reject').send({ reason: '  Shows a private address  ' }).expect(200);
    expect(service.reject).toHaveBeenCalledWith('m1', 'mod-1', 'Shows a private address');
    await request(app.getHttpServer()).post('/admin/media-review/m1/reject').send({}).expect(400);
    await request(app.getHttpServer()).post('/admin/media-review/m1/reject').send({ reason: '   ' }).expect(400);
    await request(app.getHttpServer()).post('/admin/media-review/m1/reject').send({ reason: 'a'.repeat(301) }).expect(400);
    await request(app.getHttpServer()).post('/admin/media-review/m1/reject').send({ reason: 'ok', extra: 1 }).expect(400);
    expect(service.reject).toHaveBeenCalledTimes(1);
  });
});
