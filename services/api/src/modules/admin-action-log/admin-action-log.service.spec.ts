import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from './admin-action-log.constants';
import { AdminActionLogService } from './admin-action-log.service';

// Mocked-Prisma unit test, following moderation.service.spec.ts /
// admin-staff-vetting.service.spec.ts's own convention.
function buildPrismaMock() {
  const prisma = {
    adminActionLog: {
      create: jest.fn(),
    },
  } as unknown as PrismaService;

  return prisma;
}

describe('AdminActionLogService', () => {
  describe('record', () => {
    it('writes a log row with the given adminId/action/targetType/targetId, and null notes when omitted', async () => {
      const prisma = buildPrismaMock();
      const created = {
        id: 'log-1',
        adminId: 'admin-1',
        action: ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
        targetType: ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
        targetId: 'report-1',
        notes: null,
        createdAt: new Date('2026-09-27T00:00:00.000Z'),
      };
      (prisma.adminActionLog.create as jest.Mock).mockResolvedValue(created);
      const service = new AdminActionLogService(prisma);

      const result = await service.record(
        'admin-1',
        ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
        ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
        'report-1',
      );

      expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-1',
          action: ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
          targetId: 'report-1',
          notes: null,
        },
      });
      expect(result).toEqual(created);
    });

    it('passes notes through verbatim when supplied', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminActionLog.create as jest.Mock).mockResolvedValue({});
      const service = new AdminActionLogService(prisma);

      await service.record(
        'admin-2',
        ADMIN_ACTION_LOG_ACTIONS.REPORT_ESCALATED,
        ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
        'report-2',
        'escalatedToAuthority=true',
      );

      expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-2',
          action: ADMIN_ACTION_LOG_ACTIONS.REPORT_ESCALATED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
          targetId: 'report-2',
          notes: 'escalatedToAuthority=true',
        },
      });
    });

    it('propagates a failed write rather than swallowing it', async () => {
      const prisma = buildPrismaMock();
      (prisma.adminActionLog.create as jest.Mock).mockRejectedValue(new Error('db down'));
      const service = new AdminActionLogService(prisma);

      await expect(
        service.record(
          'admin-1',
          ADMIN_ACTION_LOG_ACTIONS.USER_STATUS_UPDATED,
          ADMIN_ACTION_LOG_TARGET_TYPES.USER,
          'user-1',
        ),
      ).rejects.toThrow('db down');
    });
  });
});
