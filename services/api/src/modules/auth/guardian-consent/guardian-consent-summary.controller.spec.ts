import { BadRequestException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../rate-limit/auth-throttler.guard';
import { GuardianConsentSummaryController } from './guardian-consent-summary.controller';
import { GuardianConsentSummaryService, SUMMARY_REJECTION_MESSAGE } from './guardian-consent-summary.service';

describe('GuardianConsentSummaryController (B-021) HTTP layer', () => {
  let app: INestApplication;
  const service = { getSummary: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GuardianConsentSummaryController],
      providers: [{ provide: GuardianConsentSummaryService, useValue: service }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());
  afterEach(() => jest.clearAllMocks());

  const SUMMARY = { minorName: 'Ada Minor', dateOfBirth: '2015-03-09' };

  it('passes the X-Consent-Token header to the service and returns its summary', async () => {
    service.getSummary.mockResolvedValueOnce(SUMMARY);
    const res = await request(app.getHttpServer())
      .get('/auth/guardian-consent/request-summary')
      .set('X-Consent-Token', 'the-token')
      .expect(200);
    expect(res.body).toEqual(SUMMARY);
    expect(service.getSummary).toHaveBeenCalledWith('the-token');
  });

  it('does NOT read the credential from the URL (so it never reaches access logs)', async () => {
    service.getSummary.mockRejectedValueOnce(new BadRequestException(SUMMARY_REJECTION_MESSAGE));
    await request(app.getHttpServer()).get('/auth/guardian-consent/request-summary?token=in-the-url').expect(400);
    expect(service.getSummary).toHaveBeenCalledWith(undefined);
  });

  it('is uncacheable on success', async () => {
    service.getSummary.mockResolvedValueOnce(SUMMARY);
    const res = await request(app.getHttpServer())
      .get('/auth/guardian-consent/request-summary')
      .set('X-Consent-Token', 't')
      .expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['expires']).toBe('0');
  });

  it('is uncacheable on the rejection too, and the rejection body is the single generic one', async () => {
    service.getSummary.mockRejectedValueOnce(new BadRequestException(SUMMARY_REJECTION_MESSAGE));
    const res = await request(app.getHttpServer())
      .get('/auth/guardian-consent/request-summary')
      .set('X-Consent-Token', 'bad')
      .expect(400);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.body).toEqual({ statusCode: 400, message: SUMMARY_REJECTION_MESSAGE, error: 'Bad Request' });
  });

  it('carries the auth rate limit (the throttle guard is attached to the route)', () => {
    const guards = Reflect.getMetadata('__guards__', GuardianConsentSummaryController.prototype.requestSummary) ?? [];
    expect(guards).toContain(AuthThrottlerGuard);
  });
});
