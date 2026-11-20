import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { SuspectedIllegalMediaController } from './suspected-illegal-media.controller';
import { SuspectedIllegalMediaService } from './suspected-illegal-media.service';

describe('SuspectedIllegalMediaController (HTTP layer, B-206)', () => {
  let app: INestApplication;
  const service = {
    setAside: jest.fn(),
    list: jest.fn(),
    get: jest.fn(),
    recordFiled: jest.fn(),
    recordNotFiled: jest.fn(),
  };
  let currentAdmin: { sub: string; role: string; aud: string };
  const REPORT = '3b241101-e2bb-4255-8caf-4136c566a962';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SuspectedIllegalMediaController],
      providers: [{ provide: SuspectedIllegalMediaService, useValue: service }, AdminRolesGuard],
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

  it('is closed to an editor on every route', async () => {
    currentAdmin = { sub: 'e', role: 'editor', aud: 'admin-console' };
    const http = app.getHttpServer();
    await request(http).post('/admin/media-review/m1/suspected-illegal').send({ reason: 'x' }).expect(403);
    await request(http).get('/admin/suspected-illegal-media').expect(403);
    await request(http).get('/admin/suspected-illegal-media/r1').expect(403);
    await request(http)
      .post('/admin/suspected-illegal-media/r1/filed')
      .send({ bodyKey: 'iwf', reference: 'x' })
      .expect(403);
    await request(http)
      .post('/admin/suspected-illegal-media/r1/not-filed')
      .send({ reason: 'long enough reason' })
      .expect(403);
    expect(service.setAside).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
  });

  it('POST set-aside forwards id, calling admin and a trimmed reason, with an optional report id; answers 201', async () => {
    service.setAside.mockResolvedValue({ id: 'r1' });
    await request(app.getHttpServer())
      .post('/admin/media-review/m1/suspected-illegal')
      .send({ reason: '  looks wrong  ', reportId: REPORT })
      .expect(201);
    expect(service.setAside).toHaveBeenCalledWith('m1', 'mod-1', { reason: 'looks wrong', reportId: REPORT });
  });

  it('POST set-aside validates the body', async () => {
    const http = app.getHttpServer();
    const url = '/admin/media-review/m1/suspected-illegal';
    await request(http).post(url).send({}).expect(400);
    await request(http).post(url).send({ reason: '   ' }).expect(400);
    await request(http).post(url).send({ reason: 'x'.repeat(1001) }).expect(400);
    await request(http).post(url).send({ reason: 'x', reportId: 'nope' }).expect(400);
    await request(http).post(url).send({ reason: 'x', extra: 1 }).expect(400);
    expect(service.setAside).not.toHaveBeenCalled();
  });

  it('GET list validates status and limit and forwards the admin id', async () => {
    service.list.mockResolvedValue({ items: [], nextCursor: null });
    const http = app.getHttpServer();
    await request(http).get('/admin/suspected-illegal-media?status=filed&limit=5&cursor=abc').expect(200);
    expect(service.list).toHaveBeenCalledWith({ status: 'filed', limit: 5, cursor: 'abc' }, 'mod-1');
    await request(http).get('/admin/suspected-illegal-media?status=nope').expect(400);
    await request(http).get('/admin/suspected-illegal-media?limit=51').expect(400);
  });

  it('GET :id and the two decision routes pass the calling admin', async () => {
    service.get.mockResolvedValue({ id: 'r1' });
    service.recordFiled.mockResolvedValue({ id: 'r1' });
    service.recordNotFiled.mockResolvedValue({ id: 'r1' });
    const http = app.getHttpServer();
    await request(http).get('/admin/suspected-illegal-media/r1').expect(200);
    expect(service.get).toHaveBeenCalledWith('r1', 'mod-1');
    await request(http)
      .post('/admin/suspected-illegal-media/r1/filed')
      .send({ bodyKey: 'iwf', reference: ' ABC-1 ', note: 'n' })
      .expect(200);
    expect(service.recordFiled).toHaveBeenCalledWith('r1', 'mod-1', { bodyKey: 'iwf', reference: 'ABC-1', note: 'n' });
    await request(http)
      .post('/admin/suspected-illegal-media/r1/not-filed')
      .send({ reason: 'Counsel advised no filing here' })
      .expect(200);
    expect(service.recordNotFiled).toHaveBeenCalledWith('r1', 'mod-1', { reason: 'Counsel advised no filing here' });
  });

  it('validates the filing bodies: known body key, reference required, not-filed reason at least 10 characters', async () => {
    const http = app.getHttpServer();
    const filed = '/admin/suspected-illegal-media/r1/filed';
    await request(http).post(filed).send({ bodyKey: 'fbi', reference: 'x' }).expect(400);
    await request(http).post(filed).send({ bodyKey: 'iwf' }).expect(400);
    await request(http).post(filed).send({ bodyKey: 'iwf', reference: 'x', filedAt: 'yesterday' }).expect(400);
    await request(http).post('/admin/suspected-illegal-media/r1/not-filed').send({ reason: 'short' }).expect(400);
    expect(service.recordFiled).not.toHaveBeenCalled();
    expect(service.recordNotFiled).not.toHaveBeenCalled();
  });
});
