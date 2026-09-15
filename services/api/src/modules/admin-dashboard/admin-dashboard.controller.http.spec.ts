import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';

describe('AdminDashboardController (HTTP layer)', () => {
  let app: INestApplication;
  const adminDashboardService = { getStats: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminDashboardController],
      providers: [{ provide: AdminDashboardService, useValue: adminDashboardService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  it('is reachable by ANY admin role (no AdminRolesGuard) — this test uses "editor"', async () => {
    adminDashboardService.getStats.mockResolvedValue({
      newUsersThisMonth: 4,
      totalArticlesPublished: 12,
      communityUsersTotal: 250,
      totalVisits: null,
    });

    const res = await request(app.getHttpServer()).get('/admin/dashboard/stats').expect(200);

    expect(adminDashboardService.getStats).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      newUsersThisMonth: 4,
      totalArticlesPublished: 12,
      communityUsersTotal: 250,
      totalVisits: null,
    });
  });
});
