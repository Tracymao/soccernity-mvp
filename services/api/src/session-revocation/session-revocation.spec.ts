import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as Sentry from '@sentry/nestjs';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../modules/admin/guards/admin-jwt-auth.guard';
import { AdminRefreshTokenStore } from '../modules/admin/token/admin-refresh-token.store';
import { AdminTokenService } from '../modules/admin/token/admin-token.service';
import { JwtAuthGuard } from '../modules/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../modules/auth/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../modules/auth/guards/current-user.decorator';
import { RefreshTokenStore } from '../modules/auth/token/refresh-token.store';
import { InMemoryRedisFake } from '../modules/auth/token/test-support/in-memory-redis.fake';
import { TokenService } from '../modules/auth/token/token.service';
import {
  isIssuedBeforeRevocation,
  parseRevocationMarker,
  reportRevocationCheckFailure,
  resetRevocationReportThrottle,
  revocationMarkerTtlMs,
  SESSION_REVOCATION_MARKER_MARGIN_SECONDS,
} from './session-revocation';

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }));

// B-305 (Decision Log #500): the "sessions revoked at" marker. Time is controlled by replacing Date.now, because
// both the token's `iat` (jsonwebtoken) and the marker (wholeSecondsNow) read it.
const T0 = 1_800_000_000; // whole seconds
let nowMs = T0 * 1000;
let dateNow: jest.SpyInstance;

function setNow(seconds: number, extraMs = 0) {
  nowMs = seconds * 1000 + extraMs;
}

// A redis stand-in whose reads can be made to fail.
class FlakyRedis extends InMemoryRedisFake {
  failReads = false;
  async get(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('redis down');
    return super.get(key);
  }
}

function buildUserSide(config: Record<string, unknown> = {}) {
  const redis = new FlakyRedis();
  const store = new RefreshTokenStore(redis);
  const jwt = new JwtService({ secret: 'unit-test-secret-do-not-use' });
  const service = new TokenService(jwt, store, new ConfigService(config));
  return { redis, store, jwt, service };
}

function buildAdminSide(config: Record<string, unknown> = {}) {
  const redis = new FlakyRedis();
  const store = new AdminRefreshTokenStore(redis);
  const jwt = new JwtService({ secret: 'unit-test-admin-secret-do-not-use' });
  const service = new AdminTokenService(jwt, store, new ConfigService(config));
  return { redis, store, jwt, service };
}

beforeEach(() => {
  nowMs = T0 * 1000;
  dateNow = jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
  resetRevocationReportThrottle();
  (Sentry.captureException as jest.Mock).mockClear();
});

afterEach(() => {
  dateNow.mockRestore();
});

describe('session-revocation helpers', () => {
  it('refuses only a token issued strictly before the marker second', () => {
    expect(isIssuedBeforeRevocation(T0 - 1, T0)).toBe(true);
    expect(isIssuedBeforeRevocation(T0, T0)).toBe(false); // same second: the documented one-second edge
    expect(isIssuedBeforeRevocation(T0 + 1, T0)).toBe(false);
  });

  it('no marker never refuses; a token with no readable iat is treated as issued at 0 (refused when a marker exists)', () => {
    expect(isIssuedBeforeRevocation(T0, null)).toBe(false);
    expect(isIssuedBeforeRevocation(undefined, null)).toBe(false);
    expect(isIssuedBeforeRevocation(undefined, T0)).toBe(true);
    expect(isIssuedBeforeRevocation(Number.NaN, T0)).toBe(true);
  });

  it('ignores a marker value that is not a positive number', () => {
    expect(parseRevocationMarker(null)).toBeNull();
    expect(parseRevocationMarker('abc')).toBeNull();
    expect(parseRevocationMarker('0')).toBeNull();
    expect(parseRevocationMarker('-5')).toBeNull();
    expect(parseRevocationMarker('1800000000')).toBe(1_800_000_000);
    expect(parseRevocationMarker('1800000000.9')).toBe(1_800_000_000);
  });

  it('the marker lives for the access-token lifetime plus the margin', () => {
    expect(SESSION_REVOCATION_MARKER_MARGIN_SECONDS).toBe(60);
    expect(revocationMarkerTtlMs(900)).toBe(960_000);
    expect(revocationMarkerTtlMs(120)).toBe(180_000);
  });
});

describe('TokenService: user session revocation marker', () => {
  it('writes the marker (whole seconds, user namespace) with a TTL of the access lifetime plus the margin, read from config', async () => {
    const { redis, service } = buildUserSide({ JWT_ACCESS_TTL_SECONDS: 120 });
    const setSpy = jest.spyOn(redis, 'set');
    setNow(T0 + 5, 700);

    await service.revokeAllSessionsForUser('user-1');

    expect(setSpy).toHaveBeenCalledWith('auth:revoked-at:user:user-1', String(T0 + 5), 'PX', 180_000);
  });

  it('uses the default 900s access lifetime when none is configured (TTL 960s)', async () => {
    const { redis, service } = buildUserSide();
    const setSpy = jest.spyOn(redis, 'set');

    await service.revokeAllSessionsForUser('user-1');

    expect(setSpy).toHaveBeenCalledWith('auth:revoked-at:user:user-1', String(T0), 'PX', 960_000);
  });

  it('refuses a token issued before the revocation second, but accepts one issued at or after it', async () => {
    const { service } = buildUserSide();
    const old = (await service.issueTokenPair('user-1', 'fan')).accessToken.token; // iat = T0

    setNow(T0 + 5);
    await service.revokeAllSessionsForUser('user-1');

    await expect(service.verifyActiveAccessToken(old)).rejects.toThrow('Invalid or expired access token');

    const sameSecond = (await service.issueTokenPair('user-1', 'fan')).accessToken.token; // iat = T0+5 = marker
    expect(await service.verifyActiveAccessToken(sameSecond)).toEqual({ sub: 'user-1', role: 'fan' });

    setNow(T0 + 6);
    const later = (await service.issueTokenPair('user-1', 'fan')).accessToken.token;
    expect(await service.verifyActiveAccessToken(later)).toEqual({ sub: 'user-1', role: 'fan' });
  });

  it('ONE-SECOND EDGE: a token issued in the same second just BEFORE the revocation is not refused', async () => {
    const { service } = buildUserSide();
    setNow(T0 + 5, 100);
    const token = (await service.issueTokenPair('user-1', 'fan')).accessToken.token; // iat = T0+5
    setNow(T0 + 5, 900);

    await service.revokeAllSessionsForUser('user-1'); // marker = T0+5

    expect(await service.verifyActiveAccessToken(token)).toEqual({ sub: 'user-1', role: 'fan' });
  });

  it("does not touch another user's tokens, and verifyAccessToken (the plain check) is unchanged", async () => {
    const { service } = buildUserSide();
    const mine = (await service.issueTokenPair('user-1', 'fan')).accessToken.token;
    const other = (await service.issueTokenPair('user-2', 'fan')).accessToken.token;

    setNow(T0 + 5);
    await service.revokeAllSessionsForUser('user-1');

    await expect(service.verifyActiveAccessToken(mine)).rejects.toThrow();
    expect(await service.verifyActiveAccessToken(other)).toEqual({ sub: 'user-2', role: 'fan' });
    // verifyAccessToken stays a pure signature/expiry check (logout, the rate-limit identity resolver use it).
    expect(service.verifyAccessToken(mine)).toEqual({ sub: 'user-1', role: 'fan' });
  });

  it('with no marker every valid token is accepted; a bad signature is still the same 401', async () => {
    const { service } = buildUserSide();
    const token = (await service.issueTokenPair('user-1', 'fan')).accessToken.token;
    expect(await service.verifyActiveAccessToken(token)).toEqual({ sub: 'user-1', role: 'fan' });
    await expect(service.verifyActiveAccessToken('not.a.jwt')).rejects.toThrow('Invalid or expired access token');
  });

  it('adds no claim to the token: still exactly sub, role, iat, exp', async () => {
    const { service, jwt } = buildUserSide();
    const token = (await service.issueTokenPair('user-1', 'fan')).accessToken.token;
    expect(Object.keys(jwt.decode(token) as object).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
  });

  it('Redis unreadable: accepts the token, reports to Sentry with tag session_revocation=user, never throws; reports at most once a minute', async () => {
    const { redis, service } = buildUserSide();
    const token = (await service.issueTokenPair('user-1', 'fan')).accessToken.token;
    setNow(T0 + 5);
    await service.revokeAllSessionsForUser('user-1'); // the marker exists, but the read will fail
    redis.failReads = true;

    expect(await service.verifyActiveAccessToken(token)).toEqual({ sub: 'user-1', role: 'fan' });
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { session_revocation: 'user' } });

    await service.verifyActiveAccessToken(token);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1); // throttled

    dateNow.mockImplementation(() => nowMs + 61_000);
    await service.verifyActiveAccessToken(token);
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  });

  it('a failure while WRITING the marker propagates (a half-done revocation is not reported as done)', async () => {
    const { redis, service } = buildUserSide();
    jest.spyOn(redis, 'set').mockRejectedValue(new Error('redis down'));
    await expect(service.revokeAllSessionsForUser('user-1')).rejects.toThrow('redis down');
  });
});

describe('AdminTokenService: admin session revocation marker', () => {
  it('writes the marker in the admin namespace with a TTL from ADMIN_JWT_ACCESS_TTL_SECONDS plus the margin', async () => {
    const { redis, service } = buildAdminSide({ ADMIN_JWT_ACCESS_TTL_SECONDS: 300 });
    const setSpy = jest.spyOn(redis, 'set');
    setNow(T0 + 3);

    await service.revokeAllSessionsForAdmin('admin-1');

    expect(setSpy).toHaveBeenCalledWith('admin:revoked-at:admin:admin-1', String(T0 + 3), 'PX', 360_000);
  });

  it('refuses an admin token issued before the revocation second; accepts one at or after it', async () => {
    const { service } = buildAdminSide();
    const old = (await service.issueTokenPair('admin-1', 'moderator')).accessToken.token;

    setNow(T0 + 5);
    await service.revokeAllSessionsForAdmin('admin-1');

    await expect(service.verifyActiveAccessToken(old)).rejects.toThrow('Invalid or expired admin access token');
    const fresh = (await service.issueTokenPair('admin-1', 'moderator')).accessToken.token;
    expect(await service.verifyActiveAccessToken(fresh)).toEqual({
      sub: 'admin-1',
      role: 'moderator',
      aud: 'admin-console',
    });
  });

  it('is independent of the user marker: the same id string revoked as a user does not affect an admin', async () => {
    const user = buildUserSide();
    const admin = buildAdminSide();
    const adminToken = (await admin.service.issueTokenPair('same-id', 'editor')).accessToken.token;

    setNow(T0 + 5);
    await user.service.revokeAllSessionsForUser('same-id');

    expect(await admin.service.verifyActiveAccessToken(adminToken)).toMatchObject({ sub: 'same-id' });
    expect(await user.redis.get('admin:revoked-at:admin:same-id')).toBeNull();
  });

  it('Redis unreadable: accepts, reports with tag session_revocation=admin, never throws', async () => {
    const { redis, service } = buildAdminSide();
    const token = (await service.issueTokenPair('admin-1', 'editor')).accessToken.token;
    redis.failReads = true;

    expect(await service.verifyActiveAccessToken(token)).toMatchObject({ sub: 'admin-1' });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), { tags: { session_revocation: 'admin' } });
  });

  it('reportRevocationCheckFailure never throws even if Sentry does', () => {
    (Sentry.captureException as jest.Mock).mockImplementationOnce(() => {
      throw new Error('sentry broke');
    });
    expect(() => reportRevocationCheckFailure('user', new Error('x'))).not.toThrow();
  });
});

describe('the async guards on real routes (real services, fake Redis)', () => {
  @Controller()
  class SampleController {
    @UseGuards(JwtAuthGuard)
    @Get('user')
    user(@CurrentUser() u: { sub: string }) {
      return { sub: u.sub };
    }

    @UseGuards(OptionalJwtAuthGuard)
    @Get('optional')
    optional(@CurrentUser() u?: { sub: string }) {
      return { sub: u?.sub ?? null };
    }

    @UseGuards(AdminJwtAuthGuard)
    @Get('admin')
    admin() {
      return { ok: true };
    }
  }

  let app: INestApplication;
  let userSide: ReturnType<typeof buildUserSide>;
  let adminSide: ReturnType<typeof buildAdminSide>;

  beforeEach(async () => {
    userSide = buildUserSide();
    adminSide = buildAdminSide();
    const moduleRef = await Test.createTestingModule({
      controllers: [SampleController],
      providers: [
        JwtAuthGuard,
        OptionalJwtAuthGuard,
        AdminJwtAuthGuard,
        { provide: TokenService, useValue: userSide.service },
        { provide: AdminTokenService, useValue: adminSide.service },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('JwtAuthGuard: a valid token is let through; after a revocation the earlier token is a 401 and a newer one works', async () => {
    const old = (await userSide.service.issueTokenPair('user-1', 'fan')).accessToken.token;
    await request(app.getHttpServer()).get('/user').set('Authorization', `Bearer ${old}`).expect(200, { sub: 'user-1' });

    setNow(T0 + 5);
    await userSide.service.revokeAllSessionsForUser('user-1');
    await request(app.getHttpServer()).get('/user').set('Authorization', `Bearer ${old}`).expect(401);

    const fresh = (await userSide.service.issueTokenPair('user-1', 'fan')).accessToken.token;
    await request(app.getHttpServer()).get('/user').set('Authorization', `Bearer ${fresh}`).expect(200, { sub: 'user-1' });
  });

  it('OptionalJwtAuthGuard: a revoked token is treated exactly like an invalid one (anonymous, 200), never rejected', async () => {
    const old = (await userSide.service.issueTokenPair('user-1', 'fan')).accessToken.token;
    await request(app.getHttpServer()).get('/optional').set('Authorization', `Bearer ${old}`).expect(200, { sub: 'user-1' });

    setNow(T0 + 5);
    await userSide.service.revokeAllSessionsForUser('user-1');

    await request(app.getHttpServer()).get('/optional').set('Authorization', `Bearer ${old}`).expect(200, { sub: null });
    await request(app.getHttpServer()).get('/optional').set('Authorization', 'Bearer garbage').expect(200, { sub: null });
    await request(app.getHttpServer()).get('/optional').expect(200, { sub: null });
  });

  it('AdminJwtAuthGuard: an admin token issued before the revocation is a 401; a user token is still a 401 (separate secret)', async () => {
    const old = (await adminSide.service.issueTokenPair('admin-1', 'moderator')).accessToken.token;
    await request(app.getHttpServer()).get('/admin').set('Authorization', `Bearer ${old}`).expect(200);

    setNow(T0 + 5);
    await adminSide.service.revokeAllSessionsForAdmin('admin-1');
    await request(app.getHttpServer()).get('/admin').set('Authorization', `Bearer ${old}`).expect(401);

    const userToken = (await userSide.service.issueTokenPair('user-1', 'fan')).accessToken.token;
    await request(app.getHttpServer()).get('/admin').set('Authorization', `Bearer ${userToken}`).expect(401);
  });

  it('Redis down: all three guards let a valid token through', async () => {
    const userToken = (await userSide.service.issueTokenPair('user-1', 'fan')).accessToken.token;
    const adminToken = (await adminSide.service.issueTokenPair('admin-1', 'editor')).accessToken.token;
    userSide.redis.failReads = true;
    adminSide.redis.failReads = true;

    await request(app.getHttpServer()).get('/user').set('Authorization', `Bearer ${userToken}`).expect(200);
    await request(app.getHttpServer()).get('/optional').set('Authorization', `Bearer ${userToken}`).expect(200, { sub: 'user-1' });
    await request(app.getHttpServer()).get('/admin').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });
});
