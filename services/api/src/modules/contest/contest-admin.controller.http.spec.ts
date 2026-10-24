import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { ContestAdminController } from './contest-admin.controller';
import { ContestAdminService } from './contest-admin.service';

// HTTP-layer coverage of the Admin Console's Contest endpoints (backend/w7-contest, B-091): the DTO
// validation ranges of docs/contest-spec.md section 4 / Decision Log #399 E5, and the removal of the
// admin-judging endpoints. The locking rules themselves are in contest-admin.service.spec.ts.
describe('ContestAdminController (HTTP layer)', () => {
  let app: INestApplication;
  const service = {
    listCyclesForAdmin: jest.fn(),
    getCurrentContestForAdmin: jest.fn(),
    getCycleByIdForAdmin: jest.fn(),
    createCycle: jest.fn(),
    updateCycle: jest.fn(),
  };
  const ADMIN = { sub: 'admin-1', role: 'superadmin' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContestAdminController],
      providers: [{ provide: ContestAdminService, useValue: service }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = ADMIN;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });
  afterEach(() => jest.clearAllMocks());

  const valid = () => ({
    month: '2026-11',
    title: 'November Challenge',
    description: 'Show us your best skill.',
    weeks: [
      { weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
      { weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
      { weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
    ],
    finalTask: 'Your best goal',
    minimumTally: 5,
  });

  describe('reads', () => {
    it('GET cycles / current / cycles/:id, with "current" not swallowed by :id', async () => {
      service.listCyclesForAdmin.mockResolvedValue({ items: [] });
      service.getCurrentContestForAdmin.mockResolvedValue({ cycle: null });
      service.getCycleByIdForAdmin.mockResolvedValue({});
      await request(app.getHttpServer()).get('/admin/contest/cycles').expect(200);
      await request(app.getHttpServer()).get('/admin/contest/current').expect(200);
      await request(app.getHttpServer()).get('/admin/contest/cycles/abc').expect(200);
      expect(service.getCycleByIdForAdmin).toHaveBeenCalledWith('abc');
      expect(service.getCurrentContestForAdmin).toHaveBeenCalledTimes(1);
    });
  });

  describe('the admin-judging endpoints are gone (contests are not admin-judged, spec section 3)', () => {
    it.each([
      ['POST', '/admin/contest/cycles/c1/rounds/1/results'],
      ['POST', '/admin/contest/cycles/c1/final/open'],
      ['POST', '/admin/contest/cycles/c1/crown'],
    ])('%s %s -> 404', async (method, path) => {
      const server = app.getHttpServer();
      const res = method === 'POST' ? await request(server).post(path).send({}) : await request(server).get(path);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /admin/contest/cycles', () => {
    it('creates with the admin id and the DTO', async () => {
      service.createCycle.mockResolvedValue({ cycle: { id: 'c1' } });
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(valid()).expect(201);
      expect(service.createCycle).toHaveBeenCalledWith('admin-1', expect.objectContaining({ month: '2026-11', minimumTally: 5 }));
    });

    it('requires the minimum tally (no default) and it must be at least 1', async () => {
      const without: Record<string, unknown> = { ...valid() };
      delete without.minimumTally;
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(without).expect(400);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), minimumTally: 0 }).expect(400);
    });

    it('title is required and at most 80 characters (#399 E1)', async () => {
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), title: '' }).expect(400);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), title: 'x'.repeat(81) }).expect(400);
      service.createCycle.mockResolvedValue({});
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), title: 'x'.repeat(80) }).expect(201);
    });

    it('the watch limit is required per week and must be 3-120 seconds (#399 E5)', async () => {
      const bad = (limit: unknown) => ({
        ...valid(),
        weeks: valid().weeks.map((w, i) => (i === 0 ? { ...w, viewWatchLimitSeconds: limit } : w)),
      });
      service.createCycle.mockResolvedValue({});
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(bad(2)).expect(400);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(bad(121)).expect(400);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(bad(undefined)).expect(400);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(bad(3)).expect(201);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send(bad(120)).expect(201);
    });

    it('needs exactly three weeks, each with a task', async () => {
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), weeks: valid().weeks.slice(0, 2) }).expect(400);
      await request(app.getHttpServer())
        .post('/admin/contest/cycles')
        .send({ ...valid(), weeks: valid().weeks.map((w, i) => (i === 1 ? { ...w, task: '' } : w)) })
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/contest/cycles')
        .send({ ...valid(), weeks: [...valid().weeks, { weekNumber: 4, task: 'x', viewWatchLimitSeconds: 5 }] })
        .expect(400);
    });

    it('the week-4 settings have ranges 1-50 (tolerance, per-viewer cap)', async () => {
      service.createCycle.mockResolvedValue({});
      for (const field of ['exposureTolerancePercent', 'exposureViewerDailyCap']) {
        await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), [field]: 0 }).expect(400);
        await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), [field]: 51 }).expect(400);
        await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), [field]: 1 }).expect(201);
        await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), [field]: 50 }).expect(201);
      }
    });

    it('placement points are three non-negative integers each', async () => {
      service.createCycle.mockResolvedValue({});
      await request(app.getHttpServer())
        .post('/admin/contest/cycles')
        .send({ ...valid(), placementPoints: { weekly: [500, 300], monthly: [1, 2, 3] } })
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/contest/cycles')
        .send({ ...valid(), placementPoints: { weekly: [500, -1, 150] } })
        .expect(400);
      await request(app.getHttpServer())
        .post('/admin/contest/cycles')
        .send({ ...valid(), placementPoints: { weekly: [100, 50, 25], monthly: [400, 200, 100] } })
        .expect(201);
    });

    it('the month must be YYYY-MM; there is no date field (dates are derived, never editable)', async () => {
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), month: '2026-13' }).expect(400);
      await request(app.getHttpServer()).post('/admin/contest/cycles').send({ ...valid(), month: 'November' }).expect(400);
      await request(app.getHttpServer())
        .post('/admin/contest/cycles')
        .send({ ...valid(), startsAt: '2026-11-01T00:00:00Z' })
        .expect(400);
    });
  });

  describe('PATCH /admin/contest/cycles/:id', () => {
    it('passes the admin id, the cycle and the changes through', async () => {
      service.updateCycle.mockResolvedValue({});
      await request(app.getHttpServer())
        .patch('/admin/contest/cycles/c1')
        .send({ description: 'New text', weeks: [{ weekNumber: 2, task: 'Better task' }] })
        .expect(200);
      expect(service.updateCycle).toHaveBeenCalledWith(
        'admin-1',
        'c1',
        expect.objectContaining({ description: 'New text' }),
      );
    });

    it('rejects any attempt to change a date or the month', async () => {
      for (const field of ['month', 'startsAt', 'endsAt', 'monthKey']) {
        await request(app.getHttpServer()).patch('/admin/contest/cycles/c1').send({ [field]: '2026-12' }).expect(400);
      }
      expect(service.updateCycle).not.toHaveBeenCalled();
    });

    it('applies the same ranges on edit', async () => {
      await request(app.getHttpServer())
        .patch('/admin/contest/cycles/c1')
        .send({ weeks: [{ weekNumber: 1, viewWatchLimitSeconds: 500 }] })
        .expect(400);
      await request(app.getHttpServer()).patch('/admin/contest/cycles/c1').send({ exposureTolerancePercent: 99 }).expect(400);
      await request(app.getHttpServer()).patch('/admin/contest/cycles/c1').send({ minimumTally: 0 }).expect(400);
    });
  });
});
