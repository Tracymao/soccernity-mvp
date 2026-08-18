import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisFake } from './token/test-support/in-memory-redis.fake';
import { RefreshTokenStore } from './token/refresh-token.store';
import { TokenService } from './token/token.service';
import { PasswordService } from './password/password.service';
import { AuthService } from './auth.service';

// Minimal fake standing in for PrismaService — only the one method
// AuthService actually calls. Keeps this a fast unit test while still
// exercising AuthService's real logic (including the real PasswordService
// and a real TokenService/RefreshTokenStore pair, same as
// token.service.spec.ts's pattern) rather than mocking those away too.
class FakePrismaUsers {
  private usersByEmail = new Map<string, { id: string; role: string; passwordHash: string }>();

  user = {
    findUnique: async ({ where: { email } }: { where: { email: string } }) => {
      return this.usersByEmail.get(email) ?? null;
    },
  };

  seed(email: string, record: { id: string; role: string; passwordHash: string }) {
    this.usersByEmail.set(email, record);
  }
}

async function buildHarness() {
  const passwordService = new PasswordService();
  const jwtService = new JwtService({ secret: 'unit-test-secret-do-not-use-in-real-env' });
  const refreshTokenStore = new RefreshTokenStore(new InMemoryRedisFake());
  const configService = new ConfigService({});
  const tokenService = new TokenService(jwtService, refreshTokenStore, configService);
  const prisma = new FakePrismaUsers();

  const authService = new AuthService(prisma as never, passwordService, tokenService);
  await authService.onModuleInit();

  return { authService, prisma, passwordService, tokenService };
}

describe('AuthService', () => {
  describe('login', () => {
    it('issues a token pair on correct credentials', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('player@example.com', { id: 'user-1', role: 'fan', passwordHash });

      const result = await authService.login('player@example.com', 'correct-horse-battery-staple');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.accessTokenExpiresIn).toBeGreaterThan(0);
    });

    it('never includes isMinor or consentStatus in the response, in any shape', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('player@example.com', { id: 'user-1', role: 'fan', passwordHash });

      const result = await authService.login('player@example.com', 'correct-horse-battery-staple');

      const serialized = JSON.stringify(result).toLowerCase();
      expect(serialized).not.toContain('isminor');
      expect(serialized).not.toContain('is_minor');
      expect(serialized).not.toContain('consentstatus');
      expect(serialized).not.toContain('consent_status');
      expect(Object.keys(result).sort()).toEqual(
        ['accessToken', 'accessTokenExpiresIn', 'refreshToken', 'refreshTokenExpiresAt'].sort(),
      );
    });

    it('rejects a wrong password with a generic message', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('player@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await expect(authService.login('player@example.com', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.login('player@example.com', 'wrong-password')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('rejects an unknown email with the exact same generic message (no enumeration)', async () => {
      const { authService } = await buildHarness();

      await expect(authService.login('nobody@example.com', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.login('nobody@example.com', 'whatever')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    // Decision Log #16 (Build Plan Section 9): email is stored lowercase
    // on write, so login must normalize the same way for matching to be
    // case-insensitive.
    it.each(['Player@Example.com', 'PLAYER@EXAMPLE.COM', 'player@EXAMPLE.com'])(
      'logs in a user stored as "player@example.com" when the email is typed as %s',
      async (typedEmail) => {
        const { authService, prisma, passwordService } = await buildHarness();
        const passwordHash = await passwordService.hash('correct-horse-battery-staple');
        prisma.seed('player@example.com', { id: 'user-1', role: 'fan', passwordHash });

        const result = await authService.login(typedEmail, 'correct-horse-battery-staple');

        expect(result.accessToken).toEqual(expect.any(String));
      },
    );
  });

  describe('refresh', () => {
    it('rotates a valid refresh token into a new pair', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const first = await authService.login('a@example.com', 'pw');

      const rotated = await authService.refresh(first.refreshToken);

      // The refresh token is always a fresh opaque value (that's the
      // rotation contract). The access token is a JWT over {sub, role,
      // iat, exp} — if rotation happens within the same wall-clock second
      // as the original issue, iat/exp are identical and so is the
      // resulting token string; that's expected determinism, not a bug,
      // so this deliberately doesn't assert the access token differs.
      expect(rotated.refreshToken).not.toEqual(first.refreshToken);
      expect(rotated.accessToken).toEqual(expect.any(String));
    });

    it('rejects reuse of an already-rotated token and leaves the family dead', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const first = await authService.login('a@example.com', 'pw');
      const rotated = await authService.refresh(first.refreshToken);

      // Replay the original (already-consumed) refresh token.
      await expect(authService.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(authService.refresh(first.refreshToken)).rejects.toThrow(/reuse detected/i);

      // The legitimately rotated token is now also dead — the whole
      // family was revoked by the reuse detection, not just the replayed one.
      await expect(authService.refresh(rotated.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a malformed/unknown refresh token', async () => {
      const { authService } = await buildHarness();

      await expect(authService.refresh('not-a-real-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes only the presented refresh token by default', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const sessionA = await authService.login('a@example.com', 'pw');
      const sessionB = await authService.login('a@example.com', 'pw');

      await authService.logout(sessionA.refreshToken, false);

      await expect(authService.refresh(sessionA.refreshToken)).rejects.toThrow(UnauthorizedException);
      // Session B is untouched.
      await expect(authService.refresh(sessionB.refreshToken)).resolves.toBeDefined();
    });

    it('allSessions=true with a valid access token revokes every session for that user', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const sessionA = await authService.login('a@example.com', 'pw');
      const sessionB = await authService.login('a@example.com', 'pw');

      await authService.logout(sessionA.refreshToken, true, sessionA.accessToken);

      await expect(authService.refresh(sessionA.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(authService.refresh(sessionB.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('allSessions=true without an access token is rejected', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const session = await authService.login('a@example.com', 'pw');

      await expect(authService.logout(session.refreshToken, true, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
