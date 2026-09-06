import {
  ConflictException,
  ExecutionContext,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { ContestAdminController } from './contest-admin.controller';
import { ContestService } from './contest.service';

describe('ContestAdminController (HTTP layer)', () => {
  let app: INestApplication;
  const contestService = {
    createCycle: jest.fn(),
    recordRoundResults: jest.fn(),
    openFinal: jest.fn(),
    crownCycle: jest.fn(),
    listCyclesForAdmin: jest.fn(),
    getCycleByIdForAdmin: jest.fn(),
    getCurrentContestForAdmin: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContestAdminController],
      providers: [{ provide: ContestService, useValue: contestService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
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

  // ---- read surface (sprint-2/admin-contest-read-endpoints, DL #241) ----

  it('GET /admin/contest/cycles returns the service list', async () => {
    contestService.listCyclesForAdmin.mockResolvedValue({ items: [{ cycle: { id: 'cyc-1' }, phase: 'week_1' }] });
    const res = await request(app.getHttpServer()).get('/admin/contest/cycles').expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(contestService.listCyclesForAdmin).toHaveBeenCalledTimes(1);
  });

  it('GET /admin/contest/current returns the service response, no :id collision', async () => {
    contestService.getCurrentContestForAdmin.mockResolvedValue({ cycle: null, phase: null, rounds: [] });
    await request(app.getHttpServer()).get('/admin/contest/current').expect(200);
    expect(contestService.getCurrentContestForAdmin).toHaveBeenCalledTimes(1);
    expect(contestService.getCycleByIdForAdmin).not.toHaveBeenCalled();
  });

  it('GET /admin/contest/cycles/:id forwards the id and does not hit the list handler', async () => {
    contestService.getCycleByIdForAdmin.mockResolvedValue({ cycle: { id: 'cyc-7' }, phase: 'crowned', rounds: [] });
    await request(app.getHttpServer()).get('/admin/contest/cycles/cyc-7').expect(200);
    expect(contestService.getCycleByIdForAdmin).toHaveBeenCalledWith('cyc-7');
    expect(contestService.listCyclesForAdmin).not.toHaveBeenCalled();
  });

  it('GET /admin/contest/cycles/:id propagates a 404 from the service', async () => {
    contestService.getCycleByIdForAdmin.mockRejectedValue(new NotFoundException('Contest cycle not found'));
    await request(app.getHttpServer()).get('/admin/contest/cycles/missing').expect(404);
  });

  it('POST /admin/contest/cycles validates the DTO (missing title -> 400)', async () => {
    await request(app.getHttpServer())
      .post('/admin/contest/cycles')
      .send({ startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-28T00:00:00.000Z' })
      .expect(400);
    expect(contestService.createCycle).not.toHaveBeenCalled();
  });

  it('POST /admin/contest/cycles passes a valid DTO through', async () => {
    contestService.createCycle.mockResolvedValue({ cycle: { id: 'cyc-1' }, phase: 'vacant' });
    await request(app.getHttpServer())
      .post('/admin/contest/cycles')
      .send({ title: 'Sept', startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-09-28T00:00:00.000Z' })
      .expect(201);
    expect(contestService.createCycle).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sept' }),
    );
  });

  it('POST .../rounds/:week/results parses :week as an int and forwards winners', async () => {
    contestService.recordRoundResults.mockResolvedValue({ cycle: { id: 'cyc-1' }, phase: 'week_1' });
    await request(app.getHttpServer())
      .post('/admin/contest/cycles/cyc-1/rounds/2/results')
      .send({ winners: [{ entryId: '11111111-1111-4111-8111-111111111111', position: 1 }] })
      .expect(201);
    expect(contestService.recordRoundResults).toHaveBeenCalledWith('cyc-1', 2, {
      winners: [{ entryId: '11111111-1111-4111-8111-111111111111', position: 1 }],
    });
  });

  it('POST .../rounds/:week/results rejects a non-integer :week with 400', async () => {
    await request(app.getHttpServer())
      .post('/admin/contest/cycles/cyc-1/rounds/abc/results')
      .send({ winners: [] })
      .expect(400);
  });

  it('POST .../rounds/:week/results rejects position out of 1..3', async () => {
    await request(app.getHttpServer())
      .post('/admin/contest/cycles/cyc-1/rounds/1/results')
      .send({ winners: [{ entryId: '11111111-1111-4111-8111-111111111111', position: 4 }] })
      .expect(400);
  });

  it('POST .../final/open forwards and propagates a 409', async () => {
    contestService.openFinal.mockRejectedValue(new ConflictException('All three weekly rounds must be judged'));
    await request(app.getHttpServer()).post('/admin/contest/cycles/cyc-1/final/open').expect(409);
    expect(contestService.openFinal).toHaveBeenCalledWith('cyc-1');
  });

  it('POST .../crown requires at least one standing', async () => {
    await request(app.getHttpServer())
      .post('/admin/contest/cycles/cyc-1/crown')
      .send({ standings: [] })
      .expect(400);
  });

  it('POST .../crown forwards a valid standings payload', async () => {
    contestService.crownCycle.mockResolvedValue({ cycle: { id: 'cyc-1' }, phase: 'crowned' });
    await request(app.getHttpServer())
      .post('/admin/contest/cycles/cyc-1/crown')
      .send({ standings: [{ userId: '11111111-1111-4111-8111-111111111111', position: 1 }] })
      .expect(201);
    expect(contestService.crownCycle).toHaveBeenCalledWith('cyc-1', {
      standings: [{ userId: '11111111-1111-4111-8111-111111111111', position: 1 }],
    });
  });
});

// The read routes are AdminJwtAuthGuard-protected via the class decorator
// — proven here by denying the guard and asserting every GET is 403,
// service untouched (sprint-2/admin-contest-read-endpoints, DL #241).
describe('ContestAdminController — read routes are guarded', () => {
  let app: INestApplication;
  const contestService = {
    listCyclesForAdmin: jest.fn(),
    getCycleByIdForAdmin: jest.fn(),
    getCurrentContestForAdmin: jest.fn(),
    createCycle: jest.fn(),
    recordRoundResults: jest.fn(),
    openFinal: jest.fn(),
    crownCycle: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContestAdminController],
      providers: [{ provide: ContestService, useValue: contestService }],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({ canActivate: () => false })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/admin/contest/cycles'],
    ['/admin/contest/current'],
    ['/admin/contest/cycles/cyc-1'],
  ])('GET %s is 403 when the admin guard denies, service never called', async (path) => {
    await request(app.getHttpServer()).get(path).expect(403);
    expect(contestService.listCyclesForAdmin).not.toHaveBeenCalled();
    expect(contestService.getCycleByIdForAdmin).not.toHaveBeenCalled();
    expect(contestService.getCurrentContestForAdmin).not.toHaveBeenCalled();
  });
});
