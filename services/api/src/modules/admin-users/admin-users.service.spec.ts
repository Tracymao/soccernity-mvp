import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionSweepService } from '../account-deletion/account-deletion-sweep.service';
import { TokenService } from '../auth/token/token.service';
import { AdminUsersService } from './admin-users.service';
import { encodeAdminUsersCursor } from './cursor.util';

// Mocked-Prisma unit tests, following admin-content.service.spec.ts /
// moderation.service.spec.ts's own convention. TokenService and
// AccountDeletionSweepService are mocked too (this service only ever
// calls one method on each) — real cascade-delete behaviour against
// Postgres is already proven in
// test/account-deletion-sweep.e2e-spec.ts / test/account-deletion.e2e-spec.ts;
// this file covers AdminUsersService's own branching/guard logic.

function buildDeps() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const tokenService = {
    revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;

  const accountDeletionSweepService = {
    anonymizeUser: jest.fn().mockResolvedValue(undefined),
    listStalledHolds: jest.fn().mockResolvedValue([]),
  } as unknown as AccountDeletionSweepService;

  return { prisma, tokenService, accountDeletionSweepService };
}

function user(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'user-1',
    displayName: 'Ada Player',
    email: 'ada@example.com',
    accountStatus: 'active',
    isMinor: false,
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    ...overrides,
  };
}

describe('AdminUsersService', () => {
  describe('listStalledHolds', () => {
    it('defaults the threshold to 90 days and only reads', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      const out = await service.listStalledHolds();

      expect(accountDeletionSweepService.listStalledHolds).toHaveBeenCalledWith(undefined);
      expect(out).toEqual({ thresholdDays: 90, items: [] });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('listUsers', () => {
    it('applies an exact-match status filter alongside the cursor', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      await service.listUsers({ status: 'suspended', limit: 10 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ accountStatus: 'suspended' }] },
          take: 11,
        }),
      );
    });

    it('returns a nextCursor only when there are more rows than the page size', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      const rows = Array.from({ length: 3 }, (_, i) =>
        user({ id: `user-${i}`, createdAt: new Date(2026, 8, i + 1) }),
      );
      (prisma.user.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      const page = await service.listUsers({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it('decodes a supplied cursor into an (createdAt, id) OR condition', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);
      const cursor = encodeAdminUsersCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'user-9' });

      await service.listUsers({ cursor });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { createdAt: { lt: new Date('2026-09-01T00:00:00.000Z') } },
                  { createdAt: new Date('2026-09-01T00:00:00.000Z'), id: { lt: 'user-9' } },
                ],
              },
            ],
          },
        }),
      );
    });
  });

  describe('updateUserStatus — active/suspended transitions', () => {
    it('sets accountStatus and revokes sessions on suspend', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user());
      (prisma.user.update as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      const result = await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { accountStatus: 'suspended' },
        select: expect.any(Object),
      });
      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ deleted: false, user: expect.objectContaining({ accountStatus: 'suspended' }) });
    });

    it('does NOT revoke sessions when moving back to active', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
      (prisma.user.update as jest.Mock).mockResolvedValue(user({ accountStatus: 'active' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      await service.updateUserStatus('user-1', 'admin-1', { status: 'active' });

      expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    });

    // A deliberate, disclosed judgment call (see admin-users.service.ts's
    // own comment): an admin may move a user OUT of pending_deletion back
    // to active, undoing an accidental self-deletion request within the
    // grace window. pendingDeletionAt must be cleared in the same write
    // so AccountDeletionSweepService's own query can never pick the row
    // up again.
    it('clears a stale pendingDeletionAt when reactivating a pending_deletion user', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        user({ accountStatus: 'pending_deletion' }),
      );
      (prisma.user.update as jest.Mock).mockResolvedValue(user({ accountStatus: 'active' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      await service.updateUserStatus('user-1', 'admin-1', { status: 'active' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { accountStatus: 'active', pendingDeletionAt: null },
        select: expect.any(Object),
      });
    });

    it('throws NotFoundException for a non-existent user', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      await expect(
        service.updateUserStatus('missing-user', 'admin-1', { status: 'suspended' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateUserStatus — deleted (immediate, admin-triggered)', () => {
    it('revokes sessions and calls anonymizeUser directly, skipping the 30-day grace period', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ isMinor: true }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      const result = await service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' });

      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
      expect(accountDeletionSweepService.anonymizeUser).toHaveBeenCalledWith('user-1', true);
      // Never touches accountStatus via a plain update here -- anonymizeUser
      // owns the whole write.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, id: 'user-1' });
    });

    it('rejects any status change on an already-deleted (anonymized) user with 409 -- it cannot be resurrected', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ accountStatus: 'deleted' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'active' })).rejects.toThrow(ConflictException);
      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' })).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(accountDeletionSweepService.anonymizeUser).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a non-existent user and never calls anonymizeUser', async () => {
      const { prisma, tokenService, accountDeletionSweepService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService);

      await expect(
        service.updateUserStatus('missing-user', 'admin-1', { status: 'deleted' }),
      ).rejects.toThrow(NotFoundException);
      expect(accountDeletionSweepService.anonymizeUser).not.toHaveBeenCalled();
    });
  });
});
