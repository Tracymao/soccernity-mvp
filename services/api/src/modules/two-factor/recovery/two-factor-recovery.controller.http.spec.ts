import { BadRequestException, INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthLimitExceeded } from '../../auth/rate-limit/auth-limits/auth-limits.service';
import { AuthThrottlerGuard } from '../../auth/rate-limit/auth-throttler.guard';
import { TwoFactorRecoveryController } from './two-factor-recovery.controller';
import { TwoFactorRecoveryService } from './two-factor-recovery.service';

// HTTP wiring of the user two-factor recovery routes (B-276): routing, status codes, DTO validation, that NO sign-in is
// required, the Retry-After header on a limit, and the shape of a rejected link action. The service is mocked (its
// rules are in two-factor-recovery.service.spec.ts).
describe('TwoFactorRecoveryController (HTTP layer)', () => {
  let app: INestApplication;
  const recovery = {
    request: jest.fn(),
    describeLink: jest.fn(),
    confirm: jest.fn(),
    cancel: jest.fn(),
    approve: jest.fn(),
    decline: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TwoFactorRecoveryController],
      providers: [{ provide: TwoFactorRecoveryService, useValue: recovery }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  beforeEach(() => jest.resetAllMocks());
  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('POST request', () => {
    it('is reachable with NO Authorization header and answers 202 with the audience', async () => {
      recovery.request.mockResolvedValue({ audience: 'guardian' });

      const res = await http().post('/auth/two-factor/recovery/request').send({ email: 'kid@example.com', password: 'pw' }).expect(202);

      expect(res.body).toEqual({ audience: 'guardian' });
      expect(recovery.request).toHaveBeenCalledWith('kid@example.com', 'pw', expect.any(String));
    });

    it.each([
      [{}],
      [{ email: 'not-an-email', password: 'pw' }],
      [{ email: 'kid@example.com' }],
      [{ email: 'kid@example.com', password: '' }],
      [{ email: 'kid@example.com', password: 'pw', extra: 1 }],
      [{ email: 'kid@example.com', password: 'x'.repeat(1025) }],
    ])('rejects a malformed body %j with 400 before the service is reached', async (body) => {
      await http().post('/auth/two-factor/recovery/request').send(body).expect(400);
      expect(recovery.request).not.toHaveBeenCalled();
    });

    it('a limit is the standard 429 with Retry-After', async () => {
      recovery.request.mockRejectedValue(new AuthLimitExceeded(42));

      const res = await http().post('/auth/two-factor/recovery/request').send({ email: 'kid@example.com', password: 'pw' }).expect(429);

      expect(res.headers['retry-after']).toBe('42');
      expect(res.body).toEqual({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' });
    });

    it('an unavailable Redis is a 503 with a code', async () => {
      recovery.request.mockRejectedValue(
        new ServiceUnavailableException({
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'two_factor_recovery_unavailable',
          message: 'Two-factor recovery is not available right now. Try again in a few minutes.',
        }),
      );

      const res = await http().post('/auth/two-factor/recovery/request').send({ email: 'kid@example.com', password: 'pw' }).expect(503);

      expect(res.body.code).toBe('two_factor_recovery_unavailable');
    });
  });

  describe('GET link/:token', () => {
    it('answers the state, is not cacheable and passes the token through', async () => {
      recovery.describeLink.mockResolvedValue({ state: 'valid', kind: 'adult' });

      const res = await http().get('/auth/two-factor/recovery/link/abc.def').expect(200);

      expect(res.body).toEqual({ state: 'valid', kind: 'adult' });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(recovery.describeLink).toHaveBeenCalledWith('abc.def');
    });

    it('an invalid token is still a 200 with state "invalid" (a page renders it, a scanner learns nothing)', async () => {
      recovery.describeLink.mockResolvedValue({ state: 'invalid', kind: null });
      const res = await http().get('/auth/two-factor/recovery/link/junk').expect(200);
      expect(res.body).toEqual({ state: 'invalid', kind: null });
    });
  });

  describe('POST confirm / cancel / guardian approve / guardian decline', () => {
    it('confirm: 200 with the waiting state, the execute time and the cancel token', async () => {
      recovery.confirm.mockResolvedValue({ state: 'waiting', executeAt: '2030-01-02T10:00:00.000Z', cancelToken: 'id.cancel' });
      const res = await http().post('/auth/two-factor/recovery/confirm').send({ token: 'id.secret' }).expect(200);
      expect(res.body).toEqual({ state: 'waiting', executeAt: '2030-01-02T10:00:00.000Z', cancelToken: 'id.cancel' });
      expect(recovery.confirm).toHaveBeenCalledWith('id.secret');
    });

    it('cancel: 200 { state: "cancelled" }, body field is cancelToken', async () => {
      recovery.cancel.mockResolvedValue({ state: 'cancelled' });
      const res = await http().post('/auth/two-factor/recovery/cancel').send({ cancelToken: 'id.cancel' }).expect(200);
      expect(res.body).toEqual({ state: 'cancelled' });
      expect(recovery.cancel).toHaveBeenCalledWith('id.cancel');
      await http().post('/auth/two-factor/recovery/cancel').send({ token: 'id.cancel' }).expect(400);
    });

    it('guardian approve and decline: 200 with the new state', async () => {
      recovery.approve.mockResolvedValue({ state: 'done' });
      recovery.decline.mockResolvedValue({ state: 'declined' });
      expect((await http().post('/auth/two-factor/recovery/guardian/approve').send({ token: 'id.secret' }).expect(200)).body).toEqual({ state: 'done' });
      expect((await http().post('/auth/two-factor/recovery/guardian/decline').send({ token: 'id.secret' }).expect(200)).body).toEqual({
        state: 'declined',
      });
    });

    it.each([
      ['/auth/two-factor/recovery/confirm'],
      ['/auth/two-factor/recovery/guardian/approve'],
      ['/auth/two-factor/recovery/guardian/decline'],
    ])('%s needs a token string (400 otherwise)', async (url) => {
      await http().post(url).send({}).expect(400);
      await http().post(url).send({ token: 5 }).expect(400);
      await http().post(url).send({ token: 'x'.repeat(201) }).expect(400);
    });

    it('a rejected link action is a 400 carrying the state a page needs and a stable code', async () => {
      recovery.confirm.mockRejectedValue(
        new BadRequestException({ statusCode: 400, error: 'Bad Request', code: 'two_factor_recovery_link_used', state: 'used', message: 'This link has already been used.' }),
      );

      const res = await http().post('/auth/two-factor/recovery/confirm').send({ token: 'id.secret' }).expect(400);

      expect(res.body).toEqual({
        statusCode: 400,
        error: 'Bad Request',
        code: 'two_factor_recovery_link_used',
        state: 'used',
        message: 'This link has already been used.',
      });
    });
  });
});
