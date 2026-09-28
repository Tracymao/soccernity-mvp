import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminStaffRolesService } from './admin-staff-roles.service';
import { encodeAdminStaffRolesCursor } from './cursor.util';

// Mocked-Prisma unit tests, following admin-users.service.spec.ts /
// admin-staff-vetting.service.spec.ts's own convention.
const passwordServiceMock = { hash: jest.fn().mockResolvedValue('hashed-pw') };

function buildPrismaMock() {
  const prisma = {
    adminUser: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
  } as unknown as PrismaService;

  return prisma;
}

function buildAdminActionLogServiceMock() {
  return {
    record: jest.fn().mockResolvedValue(undefined),
  };
}

function admin(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'admin-1',
    email: 'mod@example.com',
    fullName: 'A Moderator',
    role: 'moderator',
    accountStatus: 'active',
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    // Vetting fields — not written by this service, only read back (see
    // ADMIN_STAFF_SELECT's own header comment on why they were added).
    childSafetyVetted: false,
    vettedAt: null,
    vettedByAdminId: null,
    ...overrides,
  };
}

describe('AdminStaffRolesService', () => {
  describe('listStaff', () => {
    it('applies an exact-match role filter alongside the cursor', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await service.listStaff({ role: 'moderator', limit: 10 });

      expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ role: 'moderator' }] },
          take: 11,
        }),
      );
    });

    it('returns a nextCursor only when there are more rows than the page size', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      const rows = Array.from({ length: 3 }, (_, i) =>
        admin({ id: `admin-${i}`, createdAt: new Date(2026, 8, i + 1) }),
      );
      (prisma.adminUser.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      const page = await service.listStaff({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it('returns no nextCursor when there are exactly as many rows as the page size', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      const rows = Array.from({ length: 2 }, (_, i) =>
        admin({ id: `admin-${i}`, createdAt: new Date(2026, 8, i + 1) }),
      );
      (prisma.adminUser.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      const page = await service.listStaff({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('decodes a supplied cursor into an (createdAt, id) OR condition', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);
      const cursor = encodeAdminStaffRolesCursor({ createdAt: new Date('2026-09-01T00:00:00.000Z'), id: 'admin-9' });

      await service.listStaff({ cursor });

      expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              {
                OR: [
                  { createdAt: { lt: new Date('2026-09-01T00:00:00.000Z') } },
                  { createdAt: new Date('2026-09-01T00:00:00.000Z'), id: { lt: 'admin-9' } },
                ],
              },
            ],
          },
        }),
      );
    });

    it('never leaks passwordHash — the select clause is an explicit allowlist', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await service.listStaff({});

      expect(prisma.adminUser.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            email: true,
            fullName: true,
            role: true,
            accountStatus: true,
            createdAt: true,
            childSafetyVetted: true,
            vettedAt: true,
            vettedByAdminId: true,
          },
        }),
      );
    });

    it('passes through the vetting fields (read-only here — this module never writes them)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findMany as jest.Mock).mockResolvedValue([
        admin({ childSafetyVetted: true, vettedAt: new Date('2026-09-20T00:00:00.000Z'), vettedByAdminId: 'superadmin-1' }),
      ]);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      const page = await service.listStaff({});

      expect(page.items[0]).toMatchObject({
        childSafetyVetted: true,
        vettedByAdminId: 'superadmin-1',
      });
    });
  });

  describe('updateAdminRole', () => {
    it('404s when the target AdminUser does not exist, and never writes', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await expect(
        service.updateAdminRole('missing', 'superadmin-1', { role: 'moderator' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('promotes an editor to moderator', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'editor' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(admin({ role: 'moderator' }));
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      const result = await service.updateAdminRole('admin-1', 'superadmin-1', { role: 'moderator' });

      expect(prisma.adminUser.update).toHaveBeenCalledWith({
        where: { id: 'admin-1' },
        data: { role: 'moderator' },
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          accountStatus: true,
          createdAt: true,
          childSafetyVetted: true,
          vettedAt: true,
          vettedByAdminId: true,
        },
      });
      // Not a superadmin -> superadmin change, so the last-superadmin
      // guard's COUNT query is never even attempted.
      expect(prisma.adminUser.count).not.toHaveBeenCalled();
      expect(result.role).toBe('moderator');
      // The write's own select is the same widened ADMIN_STAFF_SELECT —
      // an existing vetting record survives a role change untouched.
      expect(result.childSafetyVetted).toBe(false);
    });

    it('promotes a moderator to superadmin (no guard needed on a promotion)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'moderator' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(admin({ role: 'superadmin' }));
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      const result = await service.updateAdminRole('admin-1', 'superadmin-1', { role: 'superadmin' });

      expect(prisma.adminUser.count).not.toHaveBeenCalled();
      expect(result.role).toBe('superadmin');
    });

    it('demotes a superadmin when other active superadmins remain', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'superadmin' });
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(1);
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(admin({ role: 'editor' }));
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      const result = await service.updateAdminRole('admin-1', 'superadmin-1', { role: 'editor' });

      expect(prisma.adminUser.count).toHaveBeenCalledWith({
        where: { role: 'superadmin', accountStatus: 'active', id: { not: 'admin-1' } },
      });
      expect(prisma.adminUser.update).toHaveBeenCalled();
      expect(result.role).toBe('editor');
    });

    it('rejects demoting the LAST active superadmin with 409, and never writes', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'superadmin' });
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(0);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await expect(
        service.updateAdminRole('admin-1', 'admin-1', { role: 'editor' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.adminUser.update).not.toHaveBeenCalled();
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('a superadmin may re-assign themselves to superadmin (a no-op write, not a demotion) without tripping the guard', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'superadmin-1', role: 'superadmin' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(admin({ id: 'superadmin-1', role: 'superadmin' }));
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await service.updateAdminRole('superadmin-1', 'superadmin-1', { role: 'superadmin' });

      expect(prisma.adminUser.count).not.toHaveBeenCalled();
    });

    it('the last-superadmin count excludes the target itself (so a genuinely sole superadmin cannot demote themselves)', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'superadmin-1', role: 'superadmin' });
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(0);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await expect(
        service.updateAdminRole('superadmin-1', 'superadmin-1', { role: 'moderator' }),
      ).rejects.toThrow(ConflictException);
    });

    // ---------- AdminActionLog wiring (feat/admin-action-log) ----------

    it('records an AdminActionLog row after a successful write, with the CALLER as adminId and the TARGET admin as targetId', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'editor' });
      (prisma.adminUser.update as jest.Mock).mockResolvedValue(admin({ role: 'moderator' }));
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await service.updateAdminRole('admin-1', 'superadmin-1', { role: 'moderator' });

      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith(
        'superadmin-1',
        'admin_user.role_changed',
        'admin_user',
        'admin-1',
        'role=moderator',
      );
    });

    it('never records an AdminActionLog row on the last-superadmin rejection', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'admin-1', role: 'superadmin' });
      (prisma.adminUser.count as jest.Mock).mockResolvedValue(0);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await expect(
        service.updateAdminRole('admin-1', 'superadmin-1', { role: 'editor' }),
      ).rejects.toThrow(ConflictException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row for a non-existent target', async () => {
      const prisma = buildPrismaMock();
      const adminActionLogService = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminStaffRolesService(prisma, adminActionLogService as never, passwordServiceMock as never);

      await expect(
        service.updateAdminRole('missing', 'superadmin-1', { role: 'editor' }),
      ).rejects.toThrow(NotFoundException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });
  });

  describe('createStaff', () => {
    function setup() {
      const prisma = buildPrismaMock();
      const log = buildAdminActionLogServiceMock();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.adminUser.create as jest.Mock).mockImplementation(async ({ data }) =>
        admin({ id: 'new-admin', email: data.email, fullName: data.fullName, role: data.role }),
      );
      const service = new AdminStaffRolesService(prisma, log as never, passwordServiceMock as never);
      return { prisma, log, service };
    }

    beforeEach(() => passwordServiceMock.hash.mockClear());

    it('creates the account with a normalised email and hashed admin-set password, and does not echo the password', async () => {
      const { prisma, log, service } = setup();

      const res = await service.createStaff('super-1', {
        email: '  New.Mod@Example.com ',
        fullName: ' New Mod ',
        role: 'moderator',
        temporaryPassword: 'admin-chosen-pw',
      });

      expect(passwordServiceMock.hash).toHaveBeenCalledWith('admin-chosen-pw');
      expect(prisma.adminUser.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { email: 'new.mod@example.com', fullName: 'New Mod', role: 'moderator', passwordHash: 'hashed-pw' },
        }),
      );
      expect(res.temporaryPassword).toBeUndefined();
      expect((res as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
      expect(log.record).toHaveBeenCalledWith('super-1', 'admin_user.created', 'admin_user', 'new-admin', 'role=moderator');
    });

    it('generates a password when none is supplied, hashes it, and returns it once', async () => {
      const { service, log } = setup();

      const res = await service.createStaff('super-1', { email: 'a@b.com', fullName: 'A', role: 'editor' });

      expect(res.temporaryPassword).toEqual(expect.any(String));
      expect(res.temporaryPassword!.length).toBeGreaterThanOrEqual(16);
      expect(passwordServiceMock.hash).toHaveBeenCalledWith(res.temporaryPassword);
      // The password never reaches the audit log.
      expect(JSON.stringify(log.record.mock.calls)).not.toContain(res.temporaryPassword);
    });

    it('rejects a duplicate email with 409 before creating anything', async () => {
      const { prisma, log, service } = setup();
      (prisma.adminUser.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        service.createStaff('super-1', { email: 'A@b.com', fullName: 'A', role: 'editor' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'a@b.com' } }));
      expect(prisma.adminUser.create).not.toHaveBeenCalled();
      expect(log.record).not.toHaveBeenCalled();
    });

    it('maps a P2002 race on create to 409 and logs nothing', async () => {
      const { prisma, log, service } = setup();
      (prisma.adminUser.create as jest.Mock).mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
      );

      await expect(
        service.createStaff('super-1', { email: 'a@b.com', fullName: 'A', role: 'editor' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(log.record).not.toHaveBeenCalled();
    });
  });
});
