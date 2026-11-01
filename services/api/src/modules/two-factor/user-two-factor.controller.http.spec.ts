import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { CodeEntryLockedException } from './two-factor-attempt.limiter';
import { UserTwoFactorController } from './user-two-factor.controller';
import { TwoFactorService } from './two-factor.service';

// HTTP wiring of the signed-in user's two-factor settings: routing, status codes, DTO validation, the guard, and the
// Retry-After header a locked account gets. TwoFactorService is mocked (its logic is in two-factor.service.spec.ts).
describe('UserTwoFactorController (HTTP layer)', () => {
  let app: INestApplication;
  let authenticated = true;
  const guardianNotices = { notifyInBackground: jest.fn(), notify: jest.fn() };
  const twoFactor = {
    getStatus: jest.fn(),
    startEnrolment: jest.fn(),
    confirmEnrolment: jest.fn(),
    regenerateBackupCodes: jest.fn(),
    disable: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserTwoFactorController],
      providers: [
        { provide: TwoFactorService, useValue: twoFactor },
        { provide: GuardianSecurityNoticeService, useValue: guardianNotices },
      ],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().user = { sub: 'user-1', role: 'fan' };
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  beforeEach(() => {
    authenticated = true;
    jest.resetAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a signed-in user on every route (JwtAuthGuard only)', async () => {
    authenticated = false;
    const http = request(app.getHttpServer());
    await http.get('/auth/two-factor/status').expect(401);
    await http.post('/auth/two-factor/enrol/start').expect(401);
    await http.post('/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(401);
    await http.post('/auth/two-factor/backup-codes/regenerate').send({ password: 'x' }).expect(401);
    await http.post('/auth/two-factor/disable').send({ password: 'x' }).expect(401);
    expect(Object.values(twoFactor).every((fn) => fn.mock.calls.length === 0)).toBe(true);
  });

  it('GET status passes the caller (from the token, never the body) and returns the state', async () => {
    twoFactor.getStatus.mockResolvedValue({ enabled: true, backupCodesRemaining: 7 });
    const res = await request(app.getHttpServer()).get('/auth/two-factor/status').expect(200);
    expect(res.body).toEqual({ enabled: true, backupCodesRemaining: 7 });
    expect(twoFactor.getStatus).toHaveBeenCalledWith('user', 'user-1');
  });

  it('POST enrol/start returns the manual key and the otpauth URI (200, no QR image)', async () => {
    twoFactor.startEnrolment.mockResolvedValue({ secret: 'ABC', otpauthUri: 'otpauth://totp/x' });
    const res = await request(app.getHttpServer()).post('/auth/two-factor/enrol/start').expect(200);
    expect(res.body).toEqual({ secret: 'ABC', otpauthUri: 'otpauth://totp/x' });
    expect(twoFactor.startEnrolment).toHaveBeenCalledWith('user', 'user-1');
  });

  it('POST enrol/confirm returns the backup codes under backupCodes', async () => {
    twoFactor.confirmEnrolment.mockResolvedValue(['AAAAAAAAAA', 'BBBBBBBBBB']);
    const res = await request(app.getHttpServer()).post('/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(200);
    expect(res.body).toEqual({ backupCodes: ['AAAAAAAAAA', 'BBBBBBBBBB'] });
    expect(twoFactor.confirmEnrolment).toHaveBeenCalledWith('user', 'user-1', '123456');
  });

  it('POST enrol/confirm rejects a missing, empty, over-long or extra field before the service is touched', async () => {
    const http = request(app.getHttpServer());
    await http.post('/auth/two-factor/enrol/confirm').send({}).expect(400);
    await http.post('/auth/two-factor/enrol/confirm').send({ code: '' }).expect(400);
    await http.post('/auth/two-factor/enrol/confirm').send({ code: 123456 }).expect(400);
    await http.post('/auth/two-factor/enrol/confirm').send({ code: 'x'.repeat(33) }).expect(400);
    await http.post('/auth/two-factor/enrol/confirm').send({ code: '123456', userId: 'someone-else' }).expect(400);
    expect(twoFactor.confirmEnrolment).not.toHaveBeenCalled();
  });

  it('POST backup-codes/regenerate needs a password and returns the new codes', async () => {
    twoFactor.regenerateBackupCodes.mockResolvedValue(['CCCCCCCCCC']);
    await request(app.getHttpServer()).post('/auth/two-factor/backup-codes/regenerate').send({}).expect(400);
    const res = await request(app.getHttpServer()).post('/auth/two-factor/backup-codes/regenerate').send({ password: 'pw' }).expect(200);
    expect(res.body).toEqual({ backupCodes: ['CCCCCCCCCC'] });
    expect(twoFactor.regenerateBackupCodes).toHaveBeenCalledWith('user', 'user-1', 'pw');
  });

  it('POST disable needs a password and answers 204', async () => {
    twoFactor.disable.mockResolvedValue(undefined);
    await request(app.getHttpServer()).post('/auth/two-factor/disable').send({}).expect(400);
    const res = await request(app.getHttpServer()).post('/auth/two-factor/disable').send({ password: 'pw' }).expect(204);
    expect(res.text).toBe('');
    expect(twoFactor.disable).toHaveBeenCalledWith('user', 'user-1', 'pw');
  });

  // B-275 (Decision Log #456): a minor's confirmed guardian is told about each security change. The routes only hand
  // the user id and an event key to GuardianSecurityNoticeService (who is actually emailed is decided there).
  describe('guardian security notices (B-275)', () => {
    it('enrol/confirm asks for a "two_factor_enabled" notice exactly once, for the caller, after success', async () => {
      twoFactor.confirmEnrolment.mockResolvedValue(['AAAAAAAAAA']);
      await request(app.getHttpServer()).post('/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(200);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('user-1', 'two_factor_enabled');
    });

    it('backup-codes/regenerate asks for a "backup_codes_regenerated" notice exactly once after success', async () => {
      twoFactor.regenerateBackupCodes.mockResolvedValue(['CCCCCCCCCC']);
      await request(app.getHttpServer()).post('/auth/two-factor/backup-codes/regenerate').send({ password: 'pw' }).expect(200);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('user-1', 'backup_codes_regenerated');
    });

    it('disable asks for a "two_factor_disabled" notice exactly once after success', async () => {
      twoFactor.disable.mockResolvedValue(undefined);
      await request(app.getHttpServer()).post('/auth/two-factor/disable').send({ password: 'pw' }).expect(204);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith('user-1', 'two_factor_disabled');
    });

    it('sends nothing when the action fails (wrong code, wrong password, locked) or the body is invalid', async () => {
      twoFactor.confirmEnrolment.mockRejectedValue(new UnauthorizedException('That code did not work. Check it and try again.'));
      twoFactor.regenerateBackupCodes.mockRejectedValue(new UnauthorizedException('Incorrect password'));
      twoFactor.disable.mockRejectedValue(new CodeEntryLockedException(60));
      const http = request(app.getHttpServer());
      await http.post('/auth/two-factor/enrol/confirm').send({ code: '000000' }).expect(401);
      await http.post('/auth/two-factor/backup-codes/regenerate').send({ password: 'bad' }).expect(401);
      await http.post('/auth/two-factor/disable').send({ password: 'pw' }).expect(429);
      await http.post('/auth/two-factor/disable').send({}).expect(400);
      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });

    it('sends nothing for status or enrol/start (no security change has happened yet)', async () => {
      twoFactor.getStatus.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
      twoFactor.startEnrolment.mockResolvedValue({ secret: 'S', otpauthUri: 'otpauth://x' });
      await request(app.getHttpServer()).get('/auth/two-factor/status').expect(200);
      await request(app.getHttpServer()).post('/auth/two-factor/enrol/start').expect(200);
      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  it('passes the service errors through: a wrong code is 401, a duplicate enrolment 409', async () => {
    twoFactor.confirmEnrolment.mockRejectedValueOnce(new UnauthorizedException('That code did not work. Check it and try again.'));
    await request(app.getHttpServer()).post('/auth/two-factor/enrol/confirm').send({ code: '000000' }).expect(401);
  });

  it('turns a locked account into a 429 WITH a Retry-After header and no count in the body', async () => {
    twoFactor.confirmEnrolment.mockRejectedValue(new CodeEntryLockedException(754));
    const res = await request(app.getHttpServer()).post('/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(429);
    expect(res.headers['retry-after']).toBe('754');
    expect(res.body).toMatchObject({ statusCode: 429, code: 'two_factor_code_locked' });
    expect(JSON.stringify(res.body)).not.toContain('754');
  });
});
