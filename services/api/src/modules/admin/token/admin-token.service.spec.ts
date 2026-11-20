import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisFake } from '../../auth/token/test-support/in-memory-redis.fake';
import { AdminRefreshTokenStore } from './admin-refresh-token.store';
import { AdminTokenService } from './admin-token.service';

// `new ConfigService(overrides)` reading `overrides` correctly (rather
// than losing to process.env) is already proven safe by @nestjs/config v4
// per token.service.spec.ts's own header comment / sprint-2/
// nestjs-11-upgrade's report — no withClearedProcessEnv() wrapper needed
// here, mirroring that file's own conclusion rather than re-litigating it.
function buildAdminTokenService(configOverrides: Record<string, unknown> = {}) {
  const jwtService = new JwtService({ secret: 'unit-test-admin-secret-do-not-use-in-real-env' });
  const refreshTokenStore = new AdminRefreshTokenStore(new InMemoryRedisFake());
  const configService = new ConfigService(configOverrides);
  return new AdminTokenService(jwtService, refreshTokenStore, configService);
}

describe('AdminTokenService', () => {
  it('issues an access token whose decoded payload is exactly { sub, role, aud } plus standard JWT claims', () => {
    const tokenService = buildAdminTokenService();
    const jwtService = new JwtService({ secret: 'unit-test-admin-secret-do-not-use-in-real-env' });

    return tokenService.issueTokenPair('admin-42', 'moderator').then((pair) => {
      const decoded = jwtService.decode(pair.accessToken.token) as Record<string, unknown>;

      const keys = Object.keys(decoded).sort();
      expect(keys).toEqual(['aud', 'exp', 'iat', 'role', 'sub'].sort());
      expect(decoded.sub).toBe('admin-42');
      expect(decoded.role).toBe('moderator');
      expect(decoded.aud).toBe('admin-console');
      // Same non-negotiable this file's User-facing sibling enforces —
      // nothing safety/state-sensitive (e.g. accountStatus) ever appears
      // inside the token itself.
      expect(decoded).not.toHaveProperty('accountStatus');
      expect(decoded).not.toHaveProperty('email');
      expect(decoded).not.toHaveProperty('fullName');
    });
  });

  it('verifies a token it just issued', async () => {
    const tokenService = buildAdminTokenService();
    const pair = await tokenService.issueTokenPair('admin-1', 'editor');

    const payload = tokenService.verifyAccessToken(pair.accessToken.token);

    expect(payload).toEqual({ sub: 'admin-1', role: 'editor', aud: 'admin-console' });
  });

  it('rejects a tampered access token', async () => {
    const tokenService = buildAdminTokenService();
    const pair = await tokenService.issueTokenPair('admin-1', 'editor');
    const tampered =
      pair.accessToken.token.slice(0, -2) + (pair.accessToken.token.endsWith('a') ? 'b' : 'a');

    expect(() => tokenService.verifyAccessToken(tampered)).toThrow(UnauthorizedException);
  });

  it('rejects an access token signed with a different secret', () => {
    const tokenService = buildAdminTokenService();
    const otherJwt = new JwtService({ secret: 'a-completely-different-secret' });
    const foreignToken = otherJwt.sign(
      { sub: 'admin-1', role: 'editor', aud: 'admin-console' },
      { expiresIn: '15m' },
    );

    expect(() => tokenService.verifyAccessToken(foreignToken)).toThrow(UnauthorizedException);
  });

  // The core isolation proof at this layer: AdminTokenService must never
  // accept a token signed by the User-facing TokenService/JwtService, even
  // though both happen to share the same { sub, role, ...(iat/exp) } shape
  // minus the `aud` claim — the separate signing secret alone already
  // guarantees this (jsonwebtoken fails signature verification before this
  // class's own `aud` check ever runs), proven directly here rather than
  // only at the guard/e2e layer.
  it('rejects a well-formed token that simply lacks the admin-console audience claim (wrong secret AND missing aud)', () => {
    const tokenService = buildAdminTokenService();
    const userStyleJwt = new JwtService({ secret: 'user-facing-secret-not-the-admin-one' });
    const userStyleToken = userStyleJwt.sign({ sub: 'user-1', role: 'fan' }, { expiresIn: '15m' });

    expect(() => tokenService.verifyAccessToken(userStyleToken)).toThrow(UnauthorizedException);
  });

  // Even if, hypothetically, ADMIN_JWT_SECRET and JWT_SECRET were ever
  // accidentally set to the same value, the `aud` claim is the second,
  // independent layer that still stops a User token from passing here.
  it('rejects a token signed with the SAME secret but missing the admin-console audience claim', () => {
    const sharedSecret = 'hypothetically-shared-secret';
    const tokenService = new AdminTokenService(
      new JwtService({ secret: sharedSecret }),
      new AdminRefreshTokenStore(new InMemoryRedisFake()),
      new ConfigService({}),
    );
    const userStyleJwt = new JwtService({ secret: sharedSecret });
    const userStyleToken = userStyleJwt.sign({ sub: 'user-1', role: 'admin' }, { expiresIn: '15m' });

    expect(() => tokenService.verifyAccessToken(userStyleToken)).toThrow(UnauthorizedException);
  });

  it('rejects an expired access token', async () => {
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const tokenService = buildAdminTokenService({ ADMIN_JWT_ACCESS_TTL_SECONDS: -1 });
      const pair = await tokenService.issueTokenPair('admin-1', 'editor');

      expect(() => tokenService.verifyAccessToken(pair.accessToken.token)).toThrow(UnauthorizedException);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rotates a refresh token: old token stops working, new pair works', async () => {
    const tokenService = buildAdminTokenService();
    const original = await tokenService.issueTokenPair('admin-7', 'moderator');

    const rotated = await tokenService.rotateRefreshToken(original.refreshToken.token);

    expect(rotated.refreshToken.token).not.toEqual(original.refreshToken.token);
    await expect(tokenService.rotateRefreshToken(original.refreshToken.token)).rejects.toThrow();
    const payload = tokenService.verifyAccessToken(rotated.accessToken.token);
    expect(payload).toEqual({ sub: 'admin-7', role: 'moderator', aud: 'admin-console' });
  });

  it('revokeRefreshToken invalidates that session', async () => {
    const tokenService = buildAdminTokenService();
    const pair = await tokenService.issueTokenPair('admin-9', 'editor');

    await tokenService.revokeRefreshToken(pair.refreshToken.token);

    await expect(tokenService.rotateRefreshToken(pair.refreshToken.token)).rejects.toThrow();
  });

  it('revokeAllSessionsForAdmin invalidates every session for that admin', async () => {
    const tokenService = buildAdminTokenService();
    const sessionA = await tokenService.issueTokenPair('admin-10', 'editor');
    const sessionB = await tokenService.issueTokenPair('admin-10', 'editor');

    await tokenService.revokeAllSessionsForAdmin('admin-10');

    await expect(tokenService.rotateRefreshToken(sessionA.refreshToken.token)).rejects.toThrow();
    await expect(tokenService.rotateRefreshToken(sessionB.refreshToken.token)).rejects.toThrow();
  });
});
