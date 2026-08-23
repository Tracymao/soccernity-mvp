import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisFake } from './token/test-support/in-memory-redis.fake';
import { RefreshTokenStore } from './token/refresh-token.store';
import { TokenService } from './token/token.service';
import { PasswordService } from './password/password.service';
import { AuthService } from './auth.service';

// Minimal fake standing in for PrismaService — only the methods AuthService
// actually calls. Keeps this a fast unit test while still exercising
// AuthService's real logic (including the real PasswordService and a real
// TokenService/RefreshTokenStore pair, same as token.service.spec.ts's
// pattern) rather than mocking those away too.
//
// The seeded record now carries the full set of fields
// auth-response.mapper.ts's toAuthUserSummary() reads (email, phone,
// displayName, dateOfBirth, isMinor, verificationStatus, createdAt), not
// just the {id, role, passwordHash} login previously needed — since login()
// now shapes a `user` object into its response too.
//
// sprint-1/f5-f6-missing-endpoints added accountStatus (defaulting to
// 'active', matching prisma/schema.prisma's own column default) plus a
// findUnique-by-id path and a real update() -- changePassword/
// deactivateAccount/deleteAccount/reactivateAccount all read/write a user
// by id, not just by email the way login() alone needed.
interface FakeUserRecord {
  id: string;
  role: string;
  passwordHash: string;
  email: string;
  phone: string | null;
  displayName: string;
  dateOfBirth: Date;
  isMinor: boolean;
  verificationStatus: string;
  createdAt: Date;
  accountStatus: string;
}

const DEFAULT_SEED_FIELDS = {
  phone: null,
  displayName: 'Test Player',
  dateOfBirth: new Date('1995-01-01'),
  isMinor: false,
  verificationStatus: 'unverified',
  createdAt: new Date('2026-08-16T00:00:00.000Z'),
  accountStatus: 'active',
};

class FakePrismaUsers {
  private usersByEmail = new Map<string, FakeUserRecord>();
  private usersById = new Map<string, FakeUserRecord>();

  user = {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.email !== undefined) return this.usersByEmail.get(where.email) ?? null;
      if (where.id !== undefined) return this.usersById.get(where.id) ?? null;
      return null;
    },
    update: async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeUserRecord>;
    }) => {
      const existing = this.usersById.get(id);
      if (!existing) {
        throw new Error(`FakePrismaUsers.update: no seeded user with id ${id}`);
      }
      const updated: FakeUserRecord = { ...existing, ...data };
      this.usersById.set(id, updated);
      this.usersByEmail.set(updated.email, updated);
      return updated;
    },
  };

  seed(
    email: string,
    record: { id: string; role: string; passwordHash: string } & Partial<
      Omit<FakeUserRecord, 'id' | 'role' | 'passwordHash'>
    >,
  ) {
    const full: FakeUserRecord = { email, ...DEFAULT_SEED_FIELDS, ...record };
    this.usersByEmail.set(email, full);
    this.usersById.set(full.id, full);
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

    // sprint-2/auth-response-shape-reconciliation: login's response now
    // also carries a `user` summary (auth-response.mapper.ts's
    // toAuthUserSummary/AuthResponse), matching /auth/register's shape.
    // isMinor/verificationStatus are DELIBERATELY present here -- this is
    // a fresh HTTP response reading the caller's own current state back to
    // them, not the JWT payload. See auth-response.mapper.ts's
    // TokenPairResponse/AuthResponse comments for the distinction.
    it('includes a real, correctly-shaped user object (including isMinor/verificationStatus)', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('player@example.com', {
        id: 'user-1',
        role: 'fan',
        passwordHash,
        isMinor: true,
        verificationStatus: 'verified',
        displayName: 'Player One',
      });

      const result = await authService.login('player@example.com', 'correct-horse-battery-staple');

      expect(Object.keys(result).sort()).toEqual(
        ['accessToken', 'accessTokenExpiresIn', 'refreshToken', 'refreshTokenExpiresAt', 'user'].sort(),
      );
      expect(result.user).toEqual({
        id: 'user-1',
        email: 'player@example.com',
        phone: null,
        displayName: 'Player One',
        dateOfBirth: new Date('1995-01-01'),
        isMinor: true,
        role: 'fan',
        verificationStatus: 'verified',
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      });
      expect(result.user).not.toHaveProperty('passwordHash');
      // consentStatus is a Guardian-row field, never part of the User
      // summary at all -- must never appear anywhere in the response.
      expect(JSON.stringify(result).toLowerCase()).not.toContain('consentstatus');
      expect(JSON.stringify(result).toLowerCase()).not.toContain('consent_status');
    });

    // The non-negotiable this test guards is about the JWT *payload*
    // specifically (Build Plan Section 5.7): TokenService must keep
    // putting only { sub, role } in the access token, regardless of what
    // the surrounding HTTP response now includes.
    it('still never puts isMinor or consentStatus inside the access token payload itself', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('player@example.com', {
        id: 'user-1',
        role: 'fan',
        passwordHash,
        isMinor: true,
      });

      const result = await authService.login('player@example.com', 'correct-horse-battery-staple');

      const payload = JSON.parse(
        Buffer.from(result.accessToken.split('.')[1], 'base64').toString('utf8'),
      );
      const serializedPayload = JSON.stringify(payload).toLowerCase();
      expect(serializedPayload).not.toContain('isminor');
      expect(serializedPayload).not.toContain('is_minor');
      expect(serializedPayload).not.toContain('consentstatus');
      expect(serializedPayload).not.toContain('consent_status');
      expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub'].sort());
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

  describe('changePassword', () => {
    it('changes the password on a correct current password, and the new one works on a subsequent login', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('old-password-123');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await authService.changePassword('user-1', 'old-password-123', 'new-password-456');

      // The new password now works...
      const result = await authService.login('a@example.com', 'new-password-456');
      expect(result.accessToken).toEqual(expect.any(String));
      // ...and the old one no longer does.
      await expect(authService.login('a@example.com', 'old-password-123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong current password and leaves the stored hash untouched', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('old-password-123');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await expect(
        authService.changePassword('user-1', 'totally-wrong-password', 'new-password-456'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        authService.changePassword('user-1', 'totally-wrong-password', 'new-password-456'),
      ).rejects.toThrow('Current password is incorrect');

      // Old password still works -- nothing was written.
      const result = await authService.login('a@example.com', 'old-password-123');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    // Revoking other sessions on a successful password change is a
    // deliberate decision (see auth.service.ts's comment on
    // changePassword) -- proven here, not just asserted in a comment.
    it('revokes every existing refresh-token session on a successful change', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('old-password-123');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const sessionA = await authService.login('a@example.com', 'old-password-123');
      const sessionB = await authService.login('a@example.com', 'old-password-123');

      await authService.changePassword('user-1', 'old-password-123', 'new-password-456');

      await expect(authService.refresh(sessionA.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(authService.refresh(sessionB.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('deactivateAccount / login interaction', () => {
    it('deactivates on a correct password, and a subsequent login is rejected with a distinct message', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await authService.deactivateAccount('user-1', 'the-real-password');

      await expect(authService.login('a@example.com', 'the-real-password')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(authService.login('a@example.com', 'the-real-password')).rejects.toThrow(
        /deactivated/i,
      );
    });

    it('rejects a wrong password and does not deactivate the account', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await expect(authService.deactivateAccount('user-1', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );

      // Still active -- login still works normally.
      const result = await authService.login('a@example.com', 'the-real-password');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('revokes every existing refresh-token session on deactivation', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const session = await authService.login('a@example.com', 'the-real-password');

      await authService.deactivateAccount('user-1', 'the-real-password');

      await expect(authService.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('reactivateAccount', () => {
    it('flips a deactivated account back to active and returns a working token pair', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      await authService.deactivateAccount('user-1', 'the-real-password');
      // Deactivated -- normal login is currently rejected.
      await expect(authService.login('a@example.com', 'the-real-password')).rejects.toThrow(
        UnauthorizedException,
      );

      const result = await authService.reactivateAccount('a@example.com', 'the-real-password');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.user.id).toBe('user-1');

      // Reactivated -- a normal login now works again too.
      const loginResult = await authService.login('a@example.com', 'the-real-password');
      expect(loginResult.accessToken).toEqual(expect.any(String));
    });

    it('treats an already-active account with correct credentials as a plain login, not an error', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      const result = await authService.reactivateAccount('a@example.com', 'the-real-password');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.user.id).toBe('user-1');
    });

    it('rejects wrong credentials with the same generic message login() uses', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await expect(authService.reactivateAccount('a@example.com', 'wrong-password')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    // The explicit exclusion this PR's brief calls out: a pending_deletion
    // account must NOT be reactivated by this endpoint, even with fully
    // correct credentials -- see auth.service.ts's own comment on why.
    it('does NOT reactivate a pending_deletion account, even with correct credentials', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      await authService.deleteAccount('user-1', 'the-real-password');

      await expect(authService.reactivateAccount('a@example.com', 'the-real-password')).rejects.toThrow(
        'Invalid credentials',
      );
    });
  });

  describe('deleteAccount', () => {
    it('sets accountStatus to pending_deletion on a correct password, without deleting the User row', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await authService.deleteAccount('user-1', 'the-real-password');

      // The row still exists and is still findable by email -- a hard
      // requirement from this PR's brief (no hard delete in this PR).
      const stillExists = await prisma.user.findUnique({ where: { email: 'a@example.com' } });
      expect(stillExists).not.toBeNull();
      expect(stillExists!.accountStatus).toBe('pending_deletion');

      // Login is rejected (generic message, not a distinct one -- see
      // login()'s own comment on why pending_deletion doesn't get the
      // distinct "deactivated" message).
      await expect(authService.login('a@example.com', 'the-real-password')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('rejects a wrong password and does not touch accountStatus', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });

      await expect(authService.deleteAccount('user-1', 'wrong-password')).rejects.toThrow(
        UnauthorizedException,
      );

      const stillActive = await prisma.user.findUnique({ where: { email: 'a@example.com' } });
      expect(stillActive).not.toBeNull();
      expect(stillActive!.accountStatus).toBe('active');
    });

    it('revokes every existing refresh-token session on a delete request', async () => {
      const { authService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('the-real-password');
      prisma.seed('a@example.com', { id: 'user-1', role: 'fan', passwordHash });
      const session = await authService.login('a@example.com', 'the-real-password');

      await authService.deleteAccount('user-1', 'the-real-password');

      await expect(authService.refresh(session.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
