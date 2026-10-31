import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { CodeEntryLockedException } from '../two-factor/two-factor-attempt.limiter';
import { TwoFactorService } from '../two-factor/two-factor.service';
import { AdminTwoFactorController } from './admin-two-factor.controller';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';

describe('AdminTwoFactorController (HTTP layer)', () => {
  let app: INestApplication;
  let authenticated = true;
  let enforced = false;
  const twoFactor = {
    getStatus: jest.fn(),
    startEnrolment: jest.fn(),
    confirmEnrolment: jest.fn(),
    regenerateBackupCodes: jest.fn(),
    disable: jest.fn(),
    isAdminEnforced: jest.fn(() => enforced),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminTwoFactorController],
      providers: [{ provide: TwoFactorService, useValue: twoFactor }],
    })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!authenticated) throw new UnauthorizedException('Missing bearer token');
          context.switchToHttp().getRequest().admin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
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
    enforced = false;
    jest.clearAllMocks();
    twoFactor.isAdminEnforced.mockImplementation(() => enforced);
  });

  afterAll(async () => {
    await app.close();
  });

  it('every route needs an ADMIN token (AdminJwtAuthGuard, the separate admin domain)', async () => {
    authenticated = false;
    const http = request(app.getHttpServer());
    await http.get('/admin/auth/two-factor/status').expect(401);
    await http.post('/admin/auth/two-factor/enrol/start').expect(401);
    await http.post('/admin/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(401);
    await http.post('/admin/auth/two-factor/backup-codes/regenerate').send({ password: 'x' }).expect(401);
    await http.post('/admin/auth/two-factor/disable').send({ password: 'x' }).expect(401);
  });

  it('routes the calls to the ADMIN audience with the admin id from the token', async () => {
    twoFactor.getStatus.mockResolvedValue({ enabled: false, backupCodesRemaining: 0 });
    twoFactor.startEnrolment.mockResolvedValue({ secret: 'S', otpauthUri: 'u' });
    twoFactor.confirmEnrolment.mockResolvedValue(['AAAAAAAAAA']);
    twoFactor.regenerateBackupCodes.mockResolvedValue(['BBBBBBBBBB']);
    const http = request(app.getHttpServer());

    await http.get('/admin/auth/two-factor/status').expect(200);
    await http.post('/admin/auth/two-factor/enrol/start').expect(200);
    const confirm = await http.post('/admin/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(200);
    const regen = await http.post('/admin/auth/two-factor/backup-codes/regenerate').send({ password: 'pw' }).expect(200);

    expect(confirm.body).toEqual({ backupCodes: ['AAAAAAAAAA'] });
    expect(regen.body).toEqual({ backupCodes: ['BBBBBBBBBB'] });
    expect(twoFactor.getStatus).toHaveBeenCalledWith('admin', 'admin-1');
    expect(twoFactor.startEnrolment).toHaveBeenCalledWith('admin', 'admin-1');
    expect(twoFactor.confirmEnrolment).toHaveBeenCalledWith('admin', 'admin-1', '123456');
    expect(twoFactor.regenerateBackupCodes).toHaveBeenCalledWith('admin', 'admin-1', 'pw');
  });

  describe('disable: an admin cannot turn off their own two-factor while ADMIN_2FA_ENFORCED is "true"', () => {
    it('is refused with 403 and a code, and the service is never reached (so the password is not even checked)', async () => {
      enforced = true;
      const res = await request(app.getHttpServer()).post('/admin/auth/two-factor/disable').send({ password: 'pw' }).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403, code: 'admin_two_factor_required' });
      expect(twoFactor.disable).not.toHaveBeenCalled();
    });

    it('is allowed (with the password) when enforcement is off', async () => {
      enforced = false;
      twoFactor.disable.mockResolvedValue(undefined);
      await request(app.getHttpServer()).post('/admin/auth/two-factor/disable').send({ password: 'pw' }).expect(204);
      expect(twoFactor.disable).toHaveBeenCalledWith('admin', 'admin-1', 'pw');
    });

    it('still validates the body when enforcement is off', async () => {
      await request(app.getHttpServer()).post('/admin/auth/two-factor/disable').send({}).expect(400);
    });
  });

  it('a locked account is a 429 with Retry-After', async () => {
    twoFactor.confirmEnrolment.mockRejectedValue(new CodeEntryLockedException(900));
    const res = await request(app.getHttpServer()).post('/admin/auth/two-factor/enrol/confirm').send({ code: '123456' }).expect(429);
    expect(res.headers['retry-after']).toBe('900');
  });
});
