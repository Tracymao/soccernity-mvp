import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PostMediaReportController } from './post-media-report.controller';
import { PostMediaReportService } from './post-media-report.service';

describe('PostMediaReportController (HTTP layer, B-037)', () => {
  let app: INestApplication;
  const reports = { report: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PostMediaReportController],
      providers: [{ provide: PostMediaReportService, useValue: reports }],
    })
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { sub: 'me', role: 'fan' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  it('POST /media/:id/report passes the TOKEN subject and the item id and answers 200', async () => {
    reports.report.mockResolvedValue({ reported: true, alreadyReported: false });
    const res = await request(app.getHttpServer()).post('/media/m1/report').expect(200);
    expect(res.body).toEqual({ reported: true, alreadyReported: false });
    expect(reports.report).toHaveBeenCalledWith('me', 'm1', undefined);
  });

  // B-259 (Decision Log #430 item 4): an optional reason, at most 500 characters.
  it('passes an optional reason to the service', async () => {
    reports.report.mockResolvedValue({ reported: true, alreadyReported: false });
    await request(app.getHttpServer()).post('/media/m1/report').send({ reason: '  looks wrong  ' }).expect(200);
    // Trimming is the service's job (it also treats a blank reason as none); the DTO only bounds the length.
    expect(reports.report).toHaveBeenCalledWith('me', 'm1', '  looks wrong  ');
  });

  it('accepts a reason of exactly 500 characters and rejects 501 (400)', async () => {
    reports.report.mockResolvedValue({ reported: true, alreadyReported: false });
    await request(app.getHttpServer()).post('/media/m1/report').send({ reason: 'x'.repeat(500) }).expect(200);
    await request(app.getHttpServer()).post('/media/m1/report').send({ reason: 'x'.repeat(501) }).expect(400);
    expect(reports.report).toHaveBeenCalledTimes(1);
  });

  it('rejects any other field and a non-string reason (400), so nothing reaches the service', async () => {
    await request(app.getHttpServer()).post('/media/m1/report').send({ reason: 5 }).expect(400);
    await request(app.getHttpServer()).post('/media/m1/report').send({ reason: 'ok', reporterId: 'someone-else' }).expect(400);
    expect(reports.report).not.toHaveBeenCalled();
  });
});
