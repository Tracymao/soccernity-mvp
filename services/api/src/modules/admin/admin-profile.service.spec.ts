import { NotFoundException } from '@nestjs/common';
import { AdminProfileService } from './admin-profile.service';

// Minimal fake standing in for PrismaService's `adminUser` delegate only,
// mirroring the same pattern users.service.spec.ts / admin-auth.service.spec.ts
// already establish.
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

class FakePrismaAdmins {
  private adminsById = new Map<string, FakeAdminRecord>();

  adminUser = {
    findUnique: async ({ where: { id } }: { where: { id: string } }) =>
      this.adminsById.get(id) ?? null,
    update: async ({ where: { id }, data }: { where: { id: string }; data: Partial<FakeAdminRecord> }) => {
      const existing = this.adminsById.get(id);
      if (!existing) {
        throw new Error(`FakePrismaAdmins.update: no seeded admin with id ${id}`);
      }
      const updated: FakeAdminRecord = { ...existing, ...data };
      this.adminsById.set(id, updated);
      return updated;
    },
  };

  seed(record: FakeAdminRecord) {
    this.adminsById.set(record.id, record);
  }
}

const BASE_RECORD: FakeAdminRecord = {
  id: 'admin-1',
  email: 'admin@example.com',
  passwordHash: 'irrelevant-hash',
  fullName: 'Original Name',
  phone: null,
  role: 'moderator',
  accountStatus: 'active',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

function buildHarness() {
  const prisma = new FakePrismaAdmins();
  const service = new AdminProfileService(prisma as never);
  return { prisma, service };
}

describe('AdminProfileService', () => {
  describe('getOwnProfile', () => {
    it('returns the admin summary, never including passwordHash', async () => {
      const { prisma, service } = buildHarness();
      prisma.seed(BASE_RECORD);

      const result = await service.getOwnProfile('admin-1');

      expect(result).toEqual({
        id: 'admin-1',
        email: 'admin@example.com',
        fullName: 'Original Name',
        phone: null,
        role: 'moderator',
        accountStatus: 'active',
        createdAt: BASE_RECORD.createdAt,
        updatedAt: BASE_RECORD.updatedAt,
      });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException for a valid-token-but-since-removed admin id', async () => {
      const { service } = buildHarness();

      await expect(service.getOwnProfile('does-not-exist')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOwnProfile', () => {
    it('updates fullName and phone', async () => {
      const { prisma, service } = buildHarness();
      prisma.seed(BASE_RECORD);

      const result = await service.updateOwnProfile('admin-1', {
        fullName: 'Updated Name',
        phone: '+2348012345678',
      });

      expect(result.fullName).toBe('Updated Name');
      expect(result.phone).toBe('+2348012345678');
      // role/email/accountStatus untouched.
      expect(result.role).toBe('moderator');
      expect(result.email).toBe('admin@example.com');
      expect(result.accountStatus).toBe('active');
    });

    it('leaves fields not present in the DTO untouched', async () => {
      const { prisma, service } = buildHarness();
      prisma.seed(BASE_RECORD);

      const result = await service.updateOwnProfile('admin-1', { fullName: 'Only Name Changed' });

      expect(result.fullName).toBe('Only Name Changed');
      expect(result.phone).toBeNull();
    });

    // Defense-in-depth proof, mirroring UsersService.toUpdateData's own
    // equivalent test intent: even a DTO-shaped object that somehow carried
    // extra keys (bypassing the controller's ValidationPipe entirely, e.g.
    // a direct service-level call) cannot reach Prisma's `data`, because
    // toUpdateData() only ever reads `fullName`/`phone` off the DTO.
    it('never forwards role, email, or accountStatus to Prisma even if present on the object passed in', async () => {
      const { prisma, service } = buildHarness();
      prisma.seed(BASE_RECORD);

      // Deliberately simulating a bypassed/loosened DTO (e.g. a direct
      // service-level call, not going through the controller's
      // ValidationPipe) — built as a loosely-typed object first and cast
      // once, rather than fighting TypeScript's excess-property checking
      // on an inline literal.
      const tamperedDto = {
        fullName: 'Still Just The Name',
        role: 'superadmin',
        email: 'hijacked@example.com',
        accountStatus: 'deactivated',
      } as unknown as Parameters<typeof service.updateOwnProfile>[1];

      const result = await service.updateOwnProfile('admin-1', tamperedDto);

      expect(result.role).toBe('moderator');
      expect(result.email).toBe('admin@example.com');
      expect(result.accountStatus).toBe('active');
    });
  });
});
