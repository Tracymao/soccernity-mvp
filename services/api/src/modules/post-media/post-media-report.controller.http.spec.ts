import { ExecutionContext, INestApplication } from '@nestjs/common';
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
    await app.init();
  });
  afterAll(async () => app.close());

  it('POST /media/:id/report passes the TOKEN subject and the item id and answers 200', async () => {
    reports.report.mockResolvedValue({ reported: true, alreadyReported: false });
    const res = await request(app.getHttpServer()).post('/media/m1/report').expect(200);
    expect(res.body).toEqual({ reported: true, alreadyReported: false });
    expect(reports.report).toHaveBeenCalledWith('me', 'm1');
  });
});
