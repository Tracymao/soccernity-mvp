import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminStaffVettingService } from './admin-staff-vetting.service';

// Mocked-Prisma unit tests, following moderation.service.spec.ts /
// admin-users.service.spec.ts's own convention.
function buildPrismaMock() {
  const prisma = {
    adminUser: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  return prisma;
}

describe('AdminStaffVettingService', () => {
  describe('setChildSafetyVetting', () => {
    it('404s when the target AdminUser does not exist, and never writes', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminStaffVettingService(prisma);

      await expect(
        service.setChildSafetyVetting('missing', 'superadmin-1', { childSafetyVetted: true }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
    });

    it('setting true: writes childSafetyVetted true, vettedAt = now, and vettedByAdminId = the CALLING superadmin (not the target)', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'target-admin-1' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue({
        id: 'target-admin-1',
        email: 'mod@example.com',
        fullName: 'A Moderator',
        role: 'moderator',
        childSafetyVetted: true,
        vettedAt: new Date('2026-09-27T00:00:00.000Z'),
        vettedByAdminId: 'superadmin-1',
      });
      const service = new AdminStaffVettingService(prisma);

      const result = await service.setChildSafetyVetting('target-admin-1', 'superadmin-1', {
        childSafetyVetted: true,
      });

      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'target-admin-1' },
        data: {
          childSafetyVetted: true,
          vettedAt: expect.any(Date),
          vettedByAdminId: 'superadmin-1',
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          childSafetyVetted: true,
          vettedAt: true,
          vettedByAdminId: true,
        },
      });
      expect(result.childSafetyVetted).toBe(true);
      expect(result.vettedByAdminId).toBe('superadmin-1');
    });

    it('setting false: clears vettedAt and vettedByAdminId back to null alongside childSafetyVetted', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'target-admin-1' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue({
        id: 'target-admin-1',
        email: 'mod@example.com',
        fullName: 'A Moderator',
        role: 'moderator',
        childSafetyVetted: false,
        vettedAt: null,
        vettedByAdminId: null,
      });
      const service = new AdminStaffVettingService(prisma);

      const result = await service.setChildSafetyVetting('target-admin-1', 'superadmin-1', {
        childSafetyVetted: false,
      });

      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'target-admin-1' },
        data: {
          childSafetyVetted: false,
          vettedAt: null,
          vettedByAdminId: null,
        },
        select: expect.any(Object),
      });
      expect(result.childSafetyVetted).toBe(false);
      expect(result.vettedAt).toBeNull();
      expect(result.vettedByAdminId).toBeNull();
    });

    it('a superadmin may vet themselves (no self-vetting restriction imposed)', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'superadmin-1' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue({
        id: 'superadmin-1',
        childSafetyVetted: true,
        vettedByAdminId: 'superadmin-1',
      });
      const service = new AdminStaffVettingService(prisma);

      const result = await service.setChildSafetyVetting('superadmin-1', 'superadmin-1', {
        childSafetyVetted: true,
      });

      expect(result.vettedByAdminId).toBe('superadmin-1');
    });
  });
});
