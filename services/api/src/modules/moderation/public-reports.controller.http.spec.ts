import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { ModerationService } from './moderation.service';
import { PublicReportsController } from './public-reports.controller';

// Exercises the real HTTP layer: routing + DTO validation. No guard on
// the route besides @AuthRateLimit()'s AuthThrottlerGuard — see
// PublicReportsController's own header comment for why this route
// deliberately has no session requirement. AuthThrottlerGuard is
// overridden here (same pattern admin-auth.controller.http.spec.ts and
// password-reset/password-reset.controller.spec.ts already use for
// their own rate-limited routes) so DTO-validation tests aren't tripped
// up by the shared throttle counter — the throttle itself is proven
// behaviorally, against the real guard, in
// auth-rate-limit.decorator.spec.ts.
describe('PublicReportsController (HTTP layer)', () => {
  let app: INestApplication;
  const moderationService = {
    createPublicReport: jest.fn(),
  };

  const validBody = {
    reporterContactEmail: 'concerned-parent@example.com',
    targetType: 'post',
    targetId: '11111111-1111-4111-8111-111111111111',
    reason: 'This photo shows my child without consent.',
    concernsMinor: true,
  };

  function withoutField(field: keyof typeof validBody): Record<string, unknown> {
    const body: Record<string, unknown> = { ...validBody };
    delete body[field];
    return body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublicReportsController],
      providers: [{ provide: ModerationService, useValue: moderationService }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  describe('POST /reports/public', () => {
    it('creates a public report and forwards the full DTO, not a caller id (there is none)', async () => {
      moderationService.createPublicReport.mockResolvedValue({
        id: 'report-1',
        reporterId: null,
        status: 'open',
      });

      const res = await request(app.getHttpServer()).post('/reports/public').send(validBody).expect(201);

      expect(moderationService.createPublicReport).toHaveBeenCalledWith(validBody);
      expect(res.body.id).toBe('report-1');
      expect(res.body.reporterId).toBeNull();
    });

    it('rejects a missing reporterContactEmail', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send(withoutField('reporterContactEmail'))
        .expect(400);
      expect(moderationService.createPublicReport).not.toHaveBeenCalled();
    });

    it('rejects a malformed reporterContactEmail', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send({ ...validBody, reporterContactEmail: 'not-an-email' })
        .expect(400);
    });

    it('rejects an invalid targetType', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send({ ...validBody, targetType: 'club' })
        .expect(400);
    });

    it('rejects a non-UUID targetId', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send({ ...validBody, targetId: 'not-a-uuid' })
        .expect(400);
    });

    it('rejects an empty reason', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send({ ...validBody, reason: '' })
        .expect(400);
    });

    it('rejects a missing concernsMinor', async () => {
      await request(app.getHttpServer()).post('/reports/public').send(withoutField('concernsMinor')).expect(400);
    });

    it('rejects a non-boolean concernsMinor', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send({ ...validBody, concernsMinor: 'yes' })
        .expect(400);
    });

    it('rejects an unrecognised extra field (whitelist: true, forbidNonWhitelisted: true)', async () => {
      await request(app.getHttpServer())
        .post('/reports/public')
        .send({ ...validBody, reporterId: 'someone' })
        .expect(400);
    });
  });
});
