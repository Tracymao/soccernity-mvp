import { PrismaService } from '../../prisma/prisma.service';
import {
  AccountDeletionSweepService,
  DELETED_USER_DISPLAY_NAME,
  UNUSABLE_PASSWORD_HASH,
  deletedUserEmail,
} from './account-deletion-sweep.service';

function buildPrismaMock(opts: { held?: boolean } = {}) {
  const prisma = {
    user: { findMany: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    guardian: { findUnique: jest.fn(), delete: jest.fn() },
    consentAuditRecord: { create: jest.fn(), deleteMany: jest.fn() },
    like: { deleteMany: jest.fn() },
    savedPost: { deleteMany: jest.fn() },
    follow: { deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    banterRoomMember: { deleteMany: jest.fn() },
    communityGroupMember: { deleteMany: jest.fn() },
    grassrootsTeam: { updateMany: jest.fn() },
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue(opts.held ? [{ found: 1 }] : []),
  } as unknown as PrismaService;
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );
  return prisma;
}

describe('AccountDeletionSweepService', () => {
  describe('anonymizeUser membership cleanup', () => {
    it('deletes Banter/Group/Club memberships and decrements each memberCount, inside the transaction', async () => {
      const prisma = buildPrismaMock();
      const service = new AccountDeletionSweepService(prisma);

      await service.anonymizeUser('user-1', false);

      expect(prisma.banterRoomMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.communityGroupMember.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      const sql = (prisma.$executeRaw as unknown as jest.Mock).mock.calls.map((c) => (c[0] as string[]).join('?'));
      expect(sql.some((q) => q.includes('UPDATE "BanterRoom"'))).toBe(true);
      expect(sql.some((q) => q.includes('UPDATE "CommunityGroup"'))).toBe(true);
      expect(sql.some((q) => q.includes('UPDATE "ClubPage"'))).toBe(true);
      expect(sql.some((q) => q.includes('DELETE FROM "_ClubMembership"'))).toBe(true);
      // counters are decremented BEFORE the membership rows disappear
      const clubUpdate = sql.findIndex((q) => q.includes('UPDATE "ClubPage"'));
      const clubDelete = sql.findIndex((q) => q.includes('DELETE FROM "_ClubMembership"'));
      expect(clubUpdate).toBeLessThan(clubDelete);
    });
  });

  describe('listStalledHolds', () => {
    const now = new Date('2026-12-01T00:00:00.000Z');

    it('queries pending_deletion users past grace + threshold and keeps only those with an open investigation', async () => {
      const prisma = buildPrismaMock({ held: true });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'u1', displayName: 'A', email: 'a@x.com', pendingDeletionAt: new Date('2026-06-01T00:00:00.000Z') },
      ]);
      const service = new AccountDeletionSweepService(prisma);

      const out = await service.listStalledHolds(90, now);

      // cutoff = now - (30 + 90) days
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountStatus: 'pending_deletion', pendingDeletionAt: { lte: new Date('2026-08-03T00:00:00.000Z') } },
        }),
      );
      expect(out).toHaveLength(1);
      // heldSince = 2026-06-01 + 30d = 2026-07-01; 153 days before 2026-12-01
      expect(out[0]).toMatchObject({ userId: 'u1', daysHeld: 153 });
      expect(out[0].heldSince).toEqual(new Date('2026-07-01T00:00:00.000Z'));
    });

    it('omits candidates with no open investigation and never mutates anything', async () => {
      const prisma = buildPrismaMock({ held: false });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'u1', displayName: 'A', email: 'a@x.com', pendingDeletionAt: new Date('2026-01-01T00:00:00.000Z') },
      ]);
      const service = new AccountDeletionSweepService(prisma);

      expect(await service.listStalledHolds(90, now)).toEqual([]);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('sweepPendingDeletions', () => {
    it('queries only accountStatus=pending_deletion rows with pendingDeletionAt at or before a 30-day-ago cutoff', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions(new Date('2026-08-24T00:00:00.000Z'));

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          accountStatus: 'pending_deletion',
          pendingDeletionAt: { lte: new Date('2026-07-25T00:00:00.000Z') },
        },
        select: { id: true, isMinor: true },
      });
    });

    it('anonymizes a due, non-held user in place: one user.update, never a delete', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: {
          email: deletedUserEmail('user-1'),
          phone: null,
          displayName: DELETED_USER_DISPLAY_NAME,
          passwordHash: UNUSABLE_PASSWORD_HASH,
          dateOfBirth: null,
          clubAffiliationId: null,
          accountStatus: 'deleted',
          pendingDeletionAt: null,
        },
      });
      expect((prisma.user as unknown as { delete?: unknown }).delete).toBeUndefined();
      // Decision Log #349: the guardian lookup is no longer gated on isMinor
      // (a user who turned 18 may still hold a Guardian row).
      expect(prisma.guardian.findUnique).toHaveBeenCalled();
      expect(result).toEqual({ anonymizedUserIds: ['user-1'], heldUserIds: [] });
    });

    it('deletes the ephemeral rows (likes, saves, follows both directions, notifications), nulls team organiser, and never touches content tables', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions();

      expect(prisma.like.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.savedPost.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.follow.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ followerId: 'user-1' }, { followeeId: 'user-1' }] },
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
      expect(prisma.grassrootsTeam.updateMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1' },
        data: { createdById: null },
      });
      // likeCount decrement runs (raw) before the Like rows are deleted
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(5); // likeCount + 3 memberCount decrements + club membership delete
      const raw = (prisma.$executeRaw as jest.Mock).mock.invocationCallOrder[0];
      const del = (prisma.like.deleteMany as jest.Mock).mock.invocationCallOrder[0];
      expect(raw).toBeLessThan(del);
    });

    it('minor with a confirmed Guardian row: snapshots a ConsentAuditRecord, deletes Guardian, then anonymizes the User', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({
        consentStatus: 'confirmed',
        consentTimestamp: new Date('2026-01-01T00:00:00.000Z'),
        consentScreenVersion: 'v1',
        consentDeviceType: 'mobile',
        consentVerificationMethod: 'email_link_plus_card_charge',
        consentVerificationAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).toHaveBeenCalledWith({
        data: {
          minorUserId: 'minor-1',
          consentStatus: 'confirmed',
          consentConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
          consentScreenVersion: 'v1',
          deviceType: 'mobile',
          verificationMethod: 'email_link_plus_card_charge',
          verificationAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      expect(prisma.guardian.delete).toHaveBeenCalledWith({ where: { minorUserId: 'minor-1' } });
      const o = (m: unknown) => (m as jest.Mock).mock.invocationCallOrder[0];
      expect(o(prisma.consentAuditRecord.create)).toBeLessThan(o(prisma.guardian.delete));
      expect(o(prisma.guardian.delete)).toBeLessThan(o(prisma.user.update));
      expect(result.anonymizedUserIds).toEqual(['minor-1']);
    });

    it('minor with a still-pending Guardian row: snapshot has consentConfirmedAt: null', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({
        consentStatus: 'pending',
        consentTimestamp: null,
        consentScreenVersion: null,
        consentDeviceType: null,
        consentVerificationMethod: null,
        consentVerificationAt: null,
      });
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).toHaveBeenCalledWith({
        data: {
          minorUserId: 'minor-1',
          consentStatus: 'pending',
          consentConfirmedAt: null,
          consentScreenVersion: null,
          deviceType: null,
          verificationMethod: null,
          verificationAt: null,
        },
      });
    });

    it('minor with NO Guardian row: no snapshot, no Guardian delete, User still anonymized', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
      expect(result.anonymizedUserIds).toEqual(['minor-1']);
    });

    it('INVESTIGATION HOLD: a due user with an open involving report is skipped entirely -- no transaction, no writes', async () => {
      const prisma = buildPrismaMock({ held: true });
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'held-1', isMinor: true }]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(result).toEqual({ anonymizedUserIds: [], heldUserIds: ['held-1'] });
      expect((prisma as unknown as { $transaction: jest.Mock }).$transaction).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
    });

    it('a rejecting anonymization propagates (transaction rolled back) rather than being swallowed', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const boom = new Error('boom');
      (prisma.user.update as jest.Mock).mockRejectedValue(boom);
      const service = new AccountDeletionSweepService(prisma);

      await expect(service.sweepPendingDeletions()).rejects.toBe(boom);
    });

    it('returns empty results when nothing is due', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AccountDeletionSweepService(prisma);

      expect(await service.sweepPendingDeletions()).toEqual({ anonymizedUserIds: [], heldUserIds: [] });
    });
  });

  describe('purgeExpiredConsentAuditRecords', () => {
    it('deletes ConsentAuditRecord rows with createdAt at or before a 6-calendar-month-ago cutoff', async () => {
      const prisma = buildPrismaMock();
      (prisma.consentAuditRecord.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
      const service = new AccountDeletionSweepService(prisma);
      const now = new Date('2026-08-24T00:00:00.000Z');

      const result = await service.purgeExpiredConsentAuditRecords(now);

      expect(prisma.consentAuditRecord.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lte: new Date('2026-02-24T00:00:00.000Z') } },
      });
      expect(result).toEqual({ purgedCount: 3 });
    });

    it('does not touch User or Guardian at all — this timer is independent of any account-deletion state', async () => {
      const prisma = buildPrismaMock();
      (prisma.consentAuditRecord.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      const service = new AccountDeletionSweepService(prisma);

      await service.purgeExpiredConsentAuditRecords();

      expect(prisma.user.findMany).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
    });
  });

  describe('runDailySweep', () => {
    it('runs both sweepPendingDeletions and purgeExpiredConsentAuditRecords', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.consentAuditRecord.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      const service = new AccountDeletionSweepService(prisma);
      const sweepSpy = jest.spyOn(service, 'sweepPendingDeletions');
      const purgeSpy = jest.spyOn(service, 'purgeExpiredConsentAuditRecords');

      await service.runDailySweep();

      expect(sweepSpy).toHaveBeenCalledTimes(1);
      expect(purgeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
