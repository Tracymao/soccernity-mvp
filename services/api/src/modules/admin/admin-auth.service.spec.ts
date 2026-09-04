import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { InMemoryRedisFake } from '../auth/token/test-support/in-memory-redis.fake';
import { PasswordService } from '../auth/password/password.service';
import { AdminAuthService } from './admin-auth.service';
import { AdminRefreshTokenStore } from './token/admin-refresh-token.store';
import { AdminTokenService } from './token/admin-token.service';

// Minimal fake standing in for PrismaService's `adminUser` delegate only
// — mirrors auth.service.spec.ts's own FakePrismaUsers pattern exactly,
// scoped to AdminUser instead of User.
interface FakeAdminRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  phone: string | null;
  role: string;
  accountStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_SEED_FIELDS = {
  phone: null,
  fullName: 'Test Admin',
  accountStatus: 'active',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

class FakePrismaAdmins {
  private adminsByEmail = new Map<string, FakeAdminRecord>();
  private adminsById = new Map<string, FakeAdminRecord>();

  adminUser = {
    findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
      if (where.email !== undefined) return this.adminsByEmail.get(where.email) ?? null;
      if (where.id !== undefined) return this.adminsById.get(where.id) ?? null;
      return null;
    },
    update: async ({
      where: { id },
      data,
    }: {
      where: { id: string };
      data: Partial<FakeAdminRecord>;
    }) => {
      const existing = this.adminsById.get(id);
      if (!existing) {
        throw new Error(`FakePrismaAdmins.update: no seeded admin with id ${id}`);
      }
      const updated: FakeAdminRecord = { ...existing, ...data };
      this.adminsById.set(id, updated);
      this.adminsByEmail.set(updated.email, updated);
      return updated;
    },
  };

  seed(
    email: string,
    record: { id: string; role: string; passwordHash: string } & Partial<
      Omit<FakeAdminRecord, 'id' | 'role' | 'passwordHash'>
    >,
  ) {
    const full: FakeAdminRecord = { email, ...DEFAULT_SEED_FIELDS, ...record };
    this.adminsByEmail.set(email, full);
    this.adminsById.set(full.id, full);
  }
}

async function buildHarness() {
  const passwordService = new PasswordService();
  const jwtService = new JwtService({ secret: 'unit-test-admin-secret-do-not-use-in-real-env' });
  const refreshTokenStore = new AdminRefreshTokenStore(new InMemoryRedisFake());
  const configService = new ConfigService({});
  const adminTokenService = new AdminTokenService(jwtService, refreshTokenStore, configService);
  const prisma = new FakePrismaAdmins();

  const adminAuthService = new AdminAuthService(prisma as never, passwordService, adminTokenService);
  await adminAuthService.onModuleInit();

  return { adminAuthService, prisma, passwordService, adminTokenService };
}

describe('AdminAuthService', () => {
  describe('login', () => {
    it('issues a token pair and admin summary on correct credentials', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('admin@example.com', { id: 'admin-1', role: 'superadmin', passwordHash });

      const result = await adminAuthService.login('admin@example.com', 'correct-horse-battery-staple');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.accessTokenExpiresIn).toBeGreaterThan(0);
      expect(result.admin).toEqual({
        id: 'admin-1',
        email: 'admin@example.com',
        fullName: 'Test Admin',
        phone: null,
        role: 'superadmin',
        accountStatus: 'active',
        createdAt: DEFAULT_SEED_FIELDS.createdAt,
        updatedAt: DEFAULT_SEED_FIELDS.updatedAt,
      });
      expect(result.admin).not.toHaveProperty('passwordHash');
    });

    // The non-negotiable this test guards, mirroring auth.service.spec.ts's
    // own equivalent: the JWT *payload* itself must stay minimal, even
    // though the surrounding HTTP response includes a fuller `admin`
    // object.
    it('never puts fullName, email, or accountStatus inside the access token payload itself', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('admin@example.com', { id: 'admin-1', role: 'superadmin', passwordHash });

      const result = await adminAuthService.login('admin@example.com', 'correct-horse-battery-staple');

      const payload = JSON.parse(
        Buffer.from(result.accessToken.split('.')[1], 'base64').toString('utf8'),
      );
      expect(Object.keys(payload).sort()).toEqual(['aud', 'exp', 'iat', 'role', 'sub'].sort());
      expect(payload.aud).toBe('admin-console');
    });

    it('rejects a wrong password with a generic message', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('admin@example.com', { id: 'admin-1', role: 'superadmin', passwordHash });

      await expect(
        adminAuthService.login('admin@example.com', 'wrong-password'),
      ).rejects.toThrow(UnauthorizedException);
      await expect(
        adminAuthService.login('admin@example.com', 'wrong-password'),
      ).rejects.toThrow('Invalid credentials');
    });

    it('rejects an unknown email with the exact same generic message (no enumeration)', async () => {
      const { adminAuthService } = await buildHarness();

      await expect(adminAuthService.login('nobody@example.com', 'whatever')).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(adminAuthService.login('nobody@example.com', 'whatever')).rejects.toThrow(
        'Invalid credentials',
      );
    });

    it('logs in an admin stored as lowercase when the email is typed with different casing', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('admin@example.com', { id: 'admin-1', role: 'superadmin', passwordHash });

      const result = await adminAuthService.login('Admin@Example.COM', 'correct-horse-battery-staple');

      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('rejects login for a deactivated admin account with the same generic message', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('correct-horse-battery-staple');
      prisma.seed('admin@example.com', {
        id: 'admin-1',
        role: 'superadmin',
        passwordHash,
        accountStatus: 'deactivated',
      });

      await expect(
        adminAuthService.login('admin@example.com', 'correct-horse-battery-staple'),
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token into a new pair', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });
      const first = await adminAuthService.login('a@example.com', 'pw');

      const rotated = await adminAuthService.refresh(first.refreshToken);

      expect(rotated.refreshToken).not.toEqual(first.refreshToken);
      expect(rotated.accessToken).toEqual(expect.any(String));
    });

    it('rejects reuse of an already-rotated token and leaves the family dead', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });
      const first = await adminAuthService.login('a@example.com', 'pw');
      const rotated = await adminAuthService.refresh(first.refreshToken);

      await expect(adminAuthService.refresh(first.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(adminAuthService.refresh(first.refreshToken)).rejects.toThrow(/reuse detected/i);
      await expect(adminAuthService.refresh(rotated.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a malformed/unknown refresh token', async () => {
      const { adminAuthService } = await buildHarness();

      await expect(adminAuthService.refresh('not-a-real-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes only the presented refresh token by default', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });
      const sessionA = await adminAuthService.login('a@example.com', 'pw');
      const sessionB = await adminAuthService.login('a@example.com', 'pw');

      await adminAuthService.logout(sessionA.refreshToken, false);

      await expect(adminAuthService.refresh(sessionA.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(adminAuthService.refresh(sessionB.refreshToken)).resolves.toBeDefined();
    });

    it('allSessions=true with a valid access token revokes every session for that admin', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });
      const sessionA = await adminAuthService.login('a@example.com', 'pw');
      const sessionB = await adminAuthService.login('a@example.com', 'pw');

      await adminAuthService.logout(sessionA.refreshToken, true, sessionA.accessToken);

      await expect(adminAuthService.refresh(sessionA.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(adminAuthService.refresh(sessionB.refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('allSessions=true without an access token is rejected', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('pw');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });
      const session = await adminAuthService.login('a@example.com', 'pw');

      await expect(adminAuthService.logout(session.refreshToken, true, undefined)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('changes the password on a correct current password, and the new one works on a subsequent login', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('old-password-123');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });

      await adminAuthService.changePassword('admin-1', 'old-password-123', 'new-password-456');

      const result = await adminAuthService.login('a@example.com', 'new-password-456');
      expect(result.accessToken).toEqual(expect.any(String));
      await expect(adminAuthService.login('a@example.com', 'old-password-123')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong current password and leaves the stored hash untouched', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('old-password-123');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });

      await expect(
        adminAuthService.changePassword('admin-1', 'totally-wrong-password', 'new-password-456'),
      ).rejects.toThrow('Current password is incorrect');

      const result = await adminAuthService.login('a@example.com', 'old-password-123');
      expect(result.accessToken).toEqual(expect.any(String));
    });

    it('revokes every existing refresh-token session on a successful change', async () => {
      const { adminAuthService, prisma, passwordService } = await buildHarness();
      const passwordHash = await passwordService.hash('old-password-123');
      prisma.seed('a@example.com', { id: 'admin-1', role: 'editor', passwordHash });
      const sessionA = await adminAuthService.login('a@example.com', 'old-password-123');
      const sessionB = await adminAuthService.login('a@example.com', 'old-password-123');

      await adminAuthService.changePassword('admin-1', 'old-password-123', 'new-password-456');

      await expect(adminAuthService.refresh(sessionA.refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(adminAuthService.refresh(sessionB.refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });
});
