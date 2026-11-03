import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ModerationService } from './moderation.service';
import { ReportsController } from './reports.controller';

// Exercises the real HTTP layer: routing + DTO validation. JwtAuthGuard
// is overridden (bypassing real token verification, same pattern as
// users.controller.http.spec.ts) — this controller deliberately declares
// NO GuardianConsentGuard at all (see reports.controller.ts's own header
// comment: a restricted-pending minor must still be able to report abuse
// directed at them), so there is nothing else to override here.
describe('ReportsController (HTTP layer)', () => {
  let app: INestApplication;
  const moderationService = {
    createReport: jest.fn(),
    appealReport: jest.fn(),
  };

  const caller = { sub: 'user-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [{ provide: ModerationService, useValue: moderationService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = caller;
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

  describe('POST /reports', () => {
    it('creates a report and forwards the caller id, not a body-supplied one', async () => {
      moderationService.createReport.mockResolvedValue({ id: 'report-1', status: 'open' });

      const res = await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: '11111111-1111-4111-8111-111111111111', reasonCategory: 'spam_or_scam', reason: 'spam' })
        .expect(201);

      expect(moderationService.createReport).toHaveBeenCalledWith('user-1', {
        targetType: 'post',
        targetId: '11111111-1111-4111-8111-111111111111',
        reasonCategory: 'spam_or_scam',
        reason: 'spam',
      });
      expect(res.body.id).toBe('report-1');
    });

    it('rejects an invalid targetType', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'club', targetId: '11111111-1111-4111-8111-111111111111', reasonCategory: 'spam_or_scam', reason: 'spam' })
        .expect(400);
      expect(moderationService.createReport).not.toHaveBeenCalled();
    });

    it('rejects a non-UUID targetId', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: 'not-a-uuid', reasonCategory: 'spam_or_scam', reason: 'spam' })
        .expect(400);
    });

    it('rejects an empty reason', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: '11111111-1111-4111-8111-111111111111', reasonCategory: 'spam_or_scam', reason: '' })
        .expect(400);
    });

    const REPORT_ID = '11111111-1111-4111-8111-111111111111';
    const ALL_CATEGORIES = [
      'harassment_or_bullying',
      'hate_or_abusive_language',
      'threats_or_violence',
      'child_safety_concern',
      'sexual_or_inappropriate_content',
      'impersonation_or_fake_account',
      'spam_or_scam',
      'privacy_or_image_misuse',
      'other',
    ];

    it('rejects a missing reasonCategory (required)', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reason: 'spam' })
        .expect(400);
      expect(moderationService.createReport).not.toHaveBeenCalled();
    });

    it('rejects an unknown reasonCategory', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reasonCategory: 'rudeness', reason: 'spam' })
        .expect(400);
      expect(moderationService.createReport).not.toHaveBeenCalled();
    });

    it.each(ALL_CATEGORIES)('accepts category %s with a description', async (category) => {
      moderationService.createReport.mockResolvedValue({ id: 'report-1', status: 'open' });
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reasonCategory: category, reason: 'details' })
        .expect(201);
      expect(moderationService.createReport).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ reasonCategory: category, reason: 'details' }),
      );
    });

    it('accepts a non-other category with NO description (reason omitted)', async () => {
      moderationService.createReport.mockResolvedValue({ id: 'report-1', status: 'open' });
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reasonCategory: 'spam_or_scam' })
        .expect(201);
      expect(moderationService.createReport.mock.calls[0][1]).not.toHaveProperty('reason');
    });

    it("passes 'other' with no description through to the service (which answers the coded 400)", async () => {
      moderationService.createReport.mockResolvedValue({ id: 'report-1', status: 'open' });
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reasonCategory: 'other' })
        .expect(201);
      expect(moderationService.createReport).toHaveBeenCalledWith('user-1', {
        targetType: 'post',
        targetId: REPORT_ID,
        reasonCategory: 'other',
      });
    });

    it('still rejects a description over 500 characters', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reasonCategory: 'other', reason: 'x'.repeat(501) })
        .expect(400);
    });

    it('accepts a description of exactly 500 characters', async () => {
      moderationService.createReport.mockResolvedValue({ id: 'report-1', status: 'open' });
      await request(app.getHttpServer())
        .post('/reports')
        .send({ targetType: 'post', targetId: REPORT_ID, reasonCategory: 'other', reason: 'x'.repeat(500) })
        .expect(201);
    });

    it('rejects an unrecognised extra field (whitelist: true, forbidNonWhitelisted: true)', async () => {
      await request(app.getHttpServer())
        .post('/reports')
        .send({
          targetType: 'post',
          targetId: '11111111-1111-4111-8111-111111111111',
          reasonCategory: 'spam_or_scam',
          reason: 'spam',
          status: 'actioned',
        })
        .expect(400);
    });
  });

  describe('POST /reports/:id/appeal', () => {
    it('appeals a report, forwarding the report id and the caller id', async () => {
      moderationService.appealReport.mockResolvedValue({ id: 'report-1', appealStatus: 'pending' });

      const res = await request(app.getHttpServer())
        .post('/reports/report-1/appeal')
        .send({ reason: 'I was misidentified' })
        .expect(201);

      expect(moderationService.appealReport).toHaveBeenCalledWith('report-1', 'user-1', {
        reason: 'I was misidentified',
      });
      expect(res.body.appealStatus).toBe('pending');
    });

    it('rejects an empty reason', async () => {
      await request(app.getHttpServer()).post('/reports/report-1/appeal').send({ reason: '' }).expect(400);
    });
  });
});
