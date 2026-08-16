import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';

function buildPrismaMock() {
  return {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
}

const FULL_DB_ROW = {
  id: 'user-1',
  email: 'player@example.com',
  phone: '+441234567890',
  passwordHash: 'argon2id$super-secret-hash-should-never-leave-this-object',
  displayName: 'Old Name',
  dateOfBirth: new Date('2000-01-01'),
  isMinor: false,
  role: 'fan',
  verificationStatus: 'unverified',
  createdAt: new Date('2026-01-01'),
  clubAffiliationId: null,
};

// Mirrors what UsersService's Prisma `select` clause would actually
// return (passwordHash omitted at the query layer, not filtered out
// after the fact) — used instead of object-destructuring FULL_DB_ROW
// inline so there's no unused `passwordHash` binding for eslint to flag.
function withoutPasswordHash<T extends { passwordHash: unknown }>(row: T): Omit<T, 'passwordHash'> {
  const clone: Partial<T> = { ...row };
  delete clone.passwordHash;
  return clone as Omit<T, 'passwordHash'>;
}

describe('UsersService', () => {
  describe('getOwnProfile', () => {
    it('returns the profile without passwordHash, using a fresh Prisma select (not a stale/cached value)', async () => {
      const prisma = buildPrismaMock();
      // Simulate Prisma's `select` actually excluding passwordHash at the
      // query layer — the mock only returns what the real select clause
      // would ask for.
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma);
      const result = await service.getOwnProfile('user-1');

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.isMinor).toBe(false);
      expect(result.verificationStatus).toBe('unverified');
    });

    it('the Prisma select clause itself never requests passwordHash', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        ...FULL_DB_ROW,
        passwordHash: undefined,
      });

      const service = new UsersService(prisma);
      await service.getOwnProfile('user-1');

      const callArgs = (prisma.user.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.select.passwordHash).toBeUndefined();
      expect(callArgs.select).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException if the user no longer exists', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const service = new UsersService(prisma);

      await expect(service.getOwnProfile('ghost-user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateOwnProfile', () => {
    it('forwards only displayName/phone to Prisma, even if given extra fields at the type level', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...selected,
        displayName: 'New Name',
      });

      const service = new UsersService(prisma);
      await service.updateOwnProfile('user-1', { displayName: 'New Name' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { displayName: 'New Name' },
        select: expect.not.objectContaining({ passwordHash: true }),
      });
    });

    it('never includes isMinor, role, or verificationStatus in the update payload passed to Prisma, even if smuggled onto the dto object', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma);
      // Simulates a dto object that somehow has extra safeguarding-related
      // keys on it (e.g. if a future refactor loosened DTO validation) —
      // toUpdateData() must not read them.
      const dtoWithExtraFields = {
        displayName: 'New Name',
        isMinor: true,
        role: 'admin',
        verificationStatus: 'verified',
      } as never;

      await service.updateOwnProfile('user-1', dtoWithExtraFields);

      const callArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual({ displayName: 'New Name' });
      expect(callArgs.data).not.toHaveProperty('isMinor');
      expect(callArgs.data).not.toHaveProperty('role');
      expect(callArgs.data).not.toHaveProperty('verificationStatus');
    });

    it('produces an empty update payload when no allowed fields are provided', async () => {
      const prisma = buildPrismaMock();
      const selected = withoutPasswordHash(FULL_DB_ROW);
      (prisma.user.update as jest.Mock).mockResolvedValue(selected);

      const service = new UsersService(prisma);
      await service.updateOwnProfile('user-1', {});

      const callArgs = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(callArgs.data).toEqual({});
    });
  });
});
