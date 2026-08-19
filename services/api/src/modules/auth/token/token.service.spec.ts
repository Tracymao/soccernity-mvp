import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisFake } from './test-support/in-memory-redis.fake';
import { RefreshTokenStore } from './refresh-token.store';
import { TokenService } from './token.service';

function buildTokenService(configOverrides: Record<string, unknown> = {}) {
  const jwtService = new JwtService({ secret: 'unit-test-secret-do-not-use-in-real-env' });
  const refreshTokenStore = new RefreshTokenStore(new InMemoryRedisFake());
  const configService = new ConfigService(configOverrides);
  return new TokenService(jwtService, refreshTokenStore, configService);
}

describe('TokenService', () => {
  it('issues an access token whose decoded payload is exactly { sub, role } plus standard JWT claims', () => {
    const tokenService = buildTokenService();
    const jwtService = new JwtService({ secret: 'unit-test-secret-do-not-use-in-real-env' });

    return tokenService.issueTokenPair('user-42', 'fan').then((pair) => {
      const decoded = jwtService.decode(pair.accessToken.token) as Record<string, unknown>;

      // The non-negotiable from CLAUDE.md / Build Plan Section 5.7: no
      // isMinor, no consentStatus, no other field — just identity + role
      // (plus jsonwebtoken's own iat/exp).
      const keys = Object.keys(decoded).sort();
      expect(keys).toEqual(['exp', 'iat', 'role', 'sub'].sort());
      expect(decoded.sub).toBe('user-42');
      expect(decoded.role).toBe('fan');
      expect(decoded).not.toHaveProperty('isMinor');
      expect(decoded).not.toHaveProperty('is_minor');
      expect(decoded).not.toHaveProperty('consentStatus');
      expect(decoded).not.toHaveProperty('consent_status');
    });
  });

  it('verifies a token it just issued', async () => {
    const tokenService = buildTokenService();
    const pair = await tokenService.issueTokenPair('user-1', 'player');

    const payload = tokenService.verifyAccessToken(pair.accessToken.token);

    expect(payload).toEqual({ sub: 'user-1', role: 'player' });
  });

  it('rejects a tampered access token', async () => {
    const tokenService = buildTokenService();
    const pair = await tokenService.issueTokenPair('user-1', 'player');
    const tampered = pair.accessToken.token.slice(0, -2) + (pair.accessToken.token.endsWith('a') ? 'b' : 'a');

    expect(() => tokenService.verifyAccessToken(tampered)).toThrow(UnauthorizedException);
  });

  it('rejects an access token signed with a different secret', () => {
    const tokenService = buildTokenService();
    const otherJwt = new JwtService({ secret: 'a-completely-different-secret' });
    const foreignToken = otherJwt.sign({ sub: 'user-1', role: 'player' }, { expiresIn: '15m' });

    expect(() => tokenService.verifyAccessToken(foreignToken)).toThrow(UnauthorizedException);
  });

  it('rejects an expired access token', async () => {
    // Was previously `JWT_ACCESS_TTL_SECONDS: -1` against the real clock:
    // signing and verifying both read Date.now(), so "already expired"
    // depended on the two calls landing in the same wall-clock second —
    // true almost always, but not guaranteed under CI/full-suite load, which
    // made this test flaky (confirmed 5/5 pass in isolation, intermittent
    // failures alongside the full suite). Freezing the clock removes the
    // race entirely: sign and verify now read the identical fake "now", so
    // exp = iat - 1 is deterministically in the past every run.
    jest.useFakeTimers();
    try {
      jest.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
      const tokenService = buildTokenService({ JWT_ACCESS_TTL_SECONDS: -1 });
      const pair = await tokenService.issueTokenPair('user-1', 'player');

      expect(() => tokenService.verifyAccessToken(pair.accessToken.token)).toThrow(UnauthorizedException);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rotates a refresh token: old token stops working, new pair works', async () => {
    const tokenService = buildTokenService();
    const original = await tokenService.issueTokenPair('user-7', 'fan');

    const rotated = await tokenService.rotateRefreshToken(original.refreshToken.token);

    expect(rotated.refreshToken.token).not.toEqual(original.refreshToken.token);
    // Old refresh token is now dead.
    await expect(tokenService.rotateRefreshToken(original.refreshToken.token)).rejects.toThrow();
    // New one works and reflects the same identity.
    const payload = tokenService.verifyAccessToken(rotated.accessToken.token);
    expect(payload).toEqual({ sub: 'user-7', role: 'fan' });
  });

  it('revokeRefreshToken invalidates that session', async () => {
    const tokenService = buildTokenService();
    const pair = await tokenService.issueTokenPair('user-9', 'fan');

    await tokenService.revokeRefreshToken(pair.refreshToken.token);

    await expect(tokenService.rotateRefreshToken(pair.refreshToken.token)).rejects.toThrow();
  });

  it('revokeAllSessionsForUser invalidates every session for that user', async () => {
    const tokenService = buildTokenService();
    const sessionA = await tokenService.issueTokenPair('user-10', 'fan');
    const sessionB = await tokenService.issueTokenPair('user-10', 'fan');

    await tokenService.revokeAllSessionsForUser('user-10');

    await expect(tokenService.rotateRefreshToken(sessionA.refreshToken.token)).rejects.toThrow();
    await expect(tokenService.rotateRefreshToken(sessionB.refreshToken.token)).rejects.toThrow();
  });
});
