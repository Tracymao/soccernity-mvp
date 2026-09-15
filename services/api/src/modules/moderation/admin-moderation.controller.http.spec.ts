import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminModerationController } from './admin-moderation.controller';
import { ModerationService } from './moderation.service';

// Exercises the real HTTP layer: routing, DTO validation, AND — unlike a
// suite that overrides every guard away — the REAL AdminRolesGuard, left
// as a genuine DI-resolved instance (it only depends on the globally
// available Reflector, no mocking needed). Only AdminJwtAuthGuard is
// overridden (bypassing real token verification, matching
// contest-admin.controller.http.spec.ts's own precedent) — this suite is
// the actual proof that editor is rejected and moderator/superadmin are
// let through, not just documented as such in a comment.
describe('AdminModerationController (HTTP layer)', () => {
  let app: INestApplication;
  const moderationService = {
    listReports: jest.fn(),
    actionReport: jest.fn(),
    decideAppeal: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminModerationController],
      providers: [{ provide: ModerationService, useValue: moderationService }, AdminRolesGuard],
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
    it('rejects an editor with 403 on GET /admin/moderation/reports', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/moderation/reports').expect(403);
      expect(moderationService.listReports).not.toHaveBeenCalled();
    });

    it('rejects an editor with 403 on PATCH /admin/moderation/reports/:id', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/moderation/reports/report-1')
        .send({ action: 'dismissed' })
        .expect(403);
      expect(moderationService.actionReport).not.toHaveBeenCalled();
    });

    it('rejects an editor with 403 on PATCH /admin/moderation/reports/:id/appeal', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/moderation/reports/report-1/appeal')
        .send({ decision: 'upheld' })
        .expect(403);
      expect(moderationService.decideAppeal).not.toHaveBeenCalled();
    });

    it('allows a moderator through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
      moderationService.listReports.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/moderation/reports').expect(200);
      expect(moderationService.listReports).toHaveBeenCalledTimes(1);
    });

    it('allows a superadmin through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      moderationService.listReports.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/moderation/reports').expect(200);
      expect(moderationService.listReports).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/moderation/reports', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
    });

    it('passes the query through to the service', async () => {
      moderationService.listReports.mockResolvedValue({ items: [{ id: 'report-1' }], nextCursor: null });

      const res = await request(app.getHttpServer())
        .get('/admin/moderation/reports')
        .query({ status: 'open', limit: 10 })
        .expect(200);

      expect(moderationService.listReports).toHaveBeenCalledWith({ status: 'open', limit: 10 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an invalid status filter', async () => {
      await request(app.getHttpServer()).get('/admin/moderation/reports').query({ status: 'bogus' }).expect(400);
    });
  });

  describe('PATCH /admin/moderation/reports/:id', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };
    });

    it('actions a report, forwarding the report id and the acting admin id', async () => {
      moderationService.actionReport.mockResolvedValue({ id: 'report-1', status: 'actioned' });

      const res = await request(app.getHttpServer())
        .patch('/admin/moderation/reports/report-1')
        .send({ action: 'content_removed' })
        .expect(200);

      expect(moderationService.actionReport).toHaveBeenCalledWith('report-1', 'admin-1', {
        action: 'content_removed',
      });
      expect(res.body.status).toBe('actioned');
    });

    it('rejects an invalid action value', async () => {
      await request(app.getHttpServer())
        .patch('/admin/moderation/reports/report-1')
        .send({ action: 'delete_everything' })
        .expect(400);
    });
  });

  describe('PATCH /admin/moderation/reports/:id/appeal', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-2', role: 'superadmin', aud: 'admin-console' };
    });

    it('decides an appeal, forwarding the report id and the reviewing admin id', async () => {
      moderationService.decideAppeal.mockResolvedValue({ id: 'report-1', appealStatus: 'overturned' });

      const res = await request(app.getHttpServer())
        .patch('/admin/moderation/reports/report-1/appeal')
        .send({ decision: 'overturned' })
        .expect(200);

      expect(moderationService.decideAppeal).toHaveBeenCalledWith('report-1', 'admin-2', {
        decision: 'overturned',
      });
      expect(res.body.appealStatus).toBe('overturned');
    });

    it('rejects an invalid decision value', async () => {
      await request(app.getHttpServer())
        .patch('/admin/moderation/reports/report-1/appeal')
        .send({ decision: 'maybe' })
        .expect(400);
    });
  });
});
