import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

describe('GET /admin/dashboard/latest-posts (HTTP layer)', () => {
  let app: INestApplication;
  let allow = true;
  let role = 'editor';
  const service = { getLatestPosts: jest.fn().mockResolvedValue([]), getStats: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [{ provide: AdminDashboardService, useValue: service }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          if (!allow) throw new UnauthorizedException();
          ctx.switchToHttp().getRequest().admin = { sub: 'a1', role, aud: 'admin-console' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => {
    allow = true;
    role = 'editor';
    jest.clearAllMocks();
  });

  it('401 without a valid admin token', async () => {
    allow = false;
    await request(app.getHttpServer()).get('/admin/dashboard/latest-posts').expect(401);
    expect(service.getLatestPosts).not.toHaveBeenCalled();
  });

  it.each(['editor', 'moderator', 'superadmin'])('is reachable by the %s role, like stats', async (r) => {
    role = r;
    await request(app.getHttpServer()).get('/admin/dashboard/latest-posts').expect(200);
  });

  it('uses the same guard as stats: AdminJwtAuthGuard only, no AdminRolesGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, AdminDashboardController) as unknown[];
    expect(guards).toEqual([AdminJwtAuthGuard]);
    expect(guards).not.toContain(AdminRolesGuard);
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminDashboardController.prototype.latestPosts)).toBeUndefined();
  });

  it('returns a bare array and passes an undefined limit when none is given', async () => {
    const items = [{ id: 'p1' }];
    service.getLatestPosts.mockResolvedValueOnce(items);
    const res = await request(app.getHttpServer()).get('/admin/dashboard/latest-posts').expect(200);
    expect(res.body).toEqual(items);
    expect(service.getLatestPosts).toHaveBeenCalledWith(undefined);
  });

  it('passes a valid limit as a number', async () => {
    await request(app.getHttpServer()).get('/admin/dashboard/latest-posts?limit=3').expect(200);
    expect(service.getLatestPosts).toHaveBeenCalledWith(3);
  });

  it.each(['0', '6', '-1', 'abc', '2.5'])('rejects limit=%s with 400', async (v) => {
    await request(app.getHttpServer()).get(`/admin/dashboard/latest-posts?limit=${v}`).expect(400);
    expect(service.getLatestPosts).not.toHaveBeenCalled();
  });

  it('rejects an unknown query parameter', async () => {
    await request(app.getHttpServer()).get('/admin/dashboard/latest-posts?cursor=x').expect(400);
  });
});
