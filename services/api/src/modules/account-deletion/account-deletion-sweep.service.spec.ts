import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionSweepService } from './account-deletion-sweep.service';

function buildPrismaMock() {
  const prisma = {
    user: {
      findMany: jest.fn(),
      delete: jest.fn(),
    },
    guardian: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    consentAuditRecord: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
  } as unknown as PrismaService;

  // Same interactive-transaction mock shape as feed.service.spec.ts's own
  // buildPrismaMock — the callback form (not the array form) needs to
  // actually run top-to-bottom with real await/throw semantics for these
  // tests to be meaningful, since hardDeleteUser's ordering (snapshot,
  // then Guardian delete, then User delete) is the entire point being
  // tested here.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) =>
    fn(prisma),
  );

  return prisma;
}

function fkRestrictError() {
  return new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
    code: 'P2003',
    clientVersion: '5.0.0',
  });
}

describe('AccountDeletionSweepService', () => {
  describe('sweepPendingDeletions', () => {
    it('queries only accountStatus=pending_deletion rows with pendingDeletionAt at or before a 30-day-ago cutoff', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AccountDeletionSweepService(prisma);
      const now = new Date('2026-08-24T00:00:00.000Z');

      await service.sweepPendingDeletions(now);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          accountStatus: 'pending_deletion',
          pendingDeletionAt: { lte: new Date('2026-07-25T00:00:00.000Z') },
        },
        select: { id: true, isMinor: true },
      });
    });

    it('hard-deletes a non-minor due user via a single tx.user.delete call: no Guardian lookup, no ConsentAuditRecord, and no per-table content deletion of any kind', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
      expect(prisma.consentAuditRecord.create).not.toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
      expect(result.hardDeletedUserIds).toEqual(['user-1']);
      expect(result.blockedUserIds).toEqual([]);
    });

    // sprint-2/account-deletion-cascade (Decision Log #44) -- a mock
    // can't exercise real ON DELETE CASCADE (that's a database-level
    // concern, proven for real in account-deletion-sweep.e2e-spec.ts's
    // cross-user cascade test), but the important behavioral claim at
    // THIS layer is structural: hardDeleteUser issues exactly one
    // tx.user.delete call and nothing else for a non-minor -- no
    // per-table Post/Comment/Follow/Like/etc. deletion code exists to
    // simulate or assert on, because none should exist. The service
    // relies entirely on the schema's own cascade behavior, proven at
    // the e2e layer, not on any application-level fan-out here.
    it('does not attempt any per-table content deletion for Post/Comment/Follow/Like/etc. -- that is left entirely to the database\'s own ON DELETE CASCADE', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-with-content', isMinor: false }]);
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions();

      // The mock only ever defines user/guardian/consentAuditRecord
      // methods (see buildPrismaMock) -- there is no post/comment/follow/
      // like/etc. mock to call in the first place, which is itself part
      // of the proof: nothing in AccountDeletionSweepService references
      // those models at all.
      expect(prisma.user.delete).toHaveBeenCalledTimes(1);
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'user-with-content' } });
    });

    it('minor with a confirmed Guardian row: snapshots a ConsentAuditRecord, deletes Guardian, then deletes User', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({
        consentStatus: 'confirmed',
        consentTimestamp: new Date('2026-01-01T00:00:00.000Z'),
      });
      const callOrder: string[] = [];
      (prisma.consentAuditRecord.create as jest.Mock).mockImplementation(() => {
        callOrder.push('consentAuditRecord.create');
        return Promise.resolve({});
      });
      (prisma.guardian.delete as jest.Mock).mockImplementation(() => {
        callOrder.push('guardian.delete');
        return Promise.resolve({});
      });
      (prisma.user.delete as jest.Mock).mockImplementation(() => {
        callOrder.push('user.delete');
        return Promise.resolve({});
      });
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).toHaveBeenCalledWith({
        data: {
          minorUserId: 'minor-1',
          consentStatus: 'confirmed',
          consentConfirmedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      });
      expect(prisma.guardian.delete).toHaveBeenCalledWith({ where: { minorUserId: 'minor-1' } });
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'minor-1' } });
      // Ordering matters: the audit snapshot and the Guardian delete must
      // both happen before the User row is gone, not after.
      expect(callOrder).toEqual(['consentAuditRecord.create', 'guardian.delete', 'user.delete']);
      expect(result.hardDeletedUserIds).toEqual(['minor-1']);
    });

    it('minor with a still-pending (never confirmed) Guardian row: snapshot has consentConfirmedAt: null', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue({
        consentStatus: 'pending',
        consentTimestamp: null,
      });
      const service = new AccountDeletionSweepService(prisma);

      await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).toHaveBeenCalledWith({
        data: { minorUserId: 'minor-1', consentStatus: 'pending', consentConfirmedAt: null },
      });
    });

    it('minor with NO Guardian row at all: no snapshot, no Guardian delete, User row still deleted', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'minor-1', isMinor: true }]);
      (prisma.guardian.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(prisma.consentAuditRecord.create).not.toHaveBeenCalled();
      expect(prisma.guardian.delete).not.toHaveBeenCalled();
      expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'minor-1' } });
      expect(result.hardDeletedUserIds).toEqual(['minor-1']);
    });

    // sprint-2/account-deletion-cascade (Decision Log #44) -- this used
    // to be the EXPECTED, routine outcome for any user with related
    // content (PR #88's original "leave RESTRICT in place" default).
    // Post-cascade, every FK into User except Guardian.minorUserId is
    // ON DELETE CASCADE, so a real P2003 here should never actually
    // happen in normal operation -- this test now proves the DEFENSIVE
    // FALLBACK still works (schema drift / a future RESTRICT relation
    // added without updating this service fails safe: the account stays
    // in pending_deletion, nothing is silently lost, the sweep doesn't
    // crash), not that blocking is an expected result.
    it('DEFENSIVE FALLBACK ONLY (schema-drift scenario, not expected in normal operation): a foreign-key-restrict error (P2003) on the User delete is still caught, and the account is reported as blocked rather than crashing the sweep', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'unexpectedly-blocked-1', isMinor: false }]);
      (prisma.user.delete as jest.Mock).mockRejectedValue(fkRestrictError());
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(result.blockedUserIds).toEqual(['unexpectedly-blocked-1']);
      expect(result.hardDeletedUserIds).toEqual([]);
    });

    it('DEFENSIVE FALLBACK ONLY: one account unexpectedly hitting P2003 does not stop the rest of the sweep from processing other due accounts', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([
        { id: 'unexpectedly-blocked-1', isMinor: false },
        { id: 'eligible-1', isMinor: false },
      ]);
      (prisma.user.delete as jest.Mock).mockImplementation(({ where: { id } }: { where: { id: string } }) => {
        if (id === 'unexpectedly-blocked-1') {
          return Promise.reject(fkRestrictError());
        }
        return Promise.resolve({});
      });
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(result.blockedUserIds).toEqual(['unexpectedly-blocked-1']);
      expect(result.hardDeletedUserIds).toEqual(['eligible-1']);
    });

    it('rethrows a Prisma error that is NOT a P2003 foreign-key-restrict violation, rather than silently treating it as blocked', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'user-1', isMinor: false }]);
      const otherError = new Prisma.PrismaClientKnownRequestError('Something else entirely', {
        code: 'P2025',
        clientVersion: '5.0.0',
      });
      (prisma.user.delete as jest.Mock).mockRejectedValue(otherError);
      const service = new AccountDeletionSweepService(prisma);

      await expect(service.sweepPendingDeletions()).rejects.toBe(otherError);
    });

    it('returns empty results when nothing is due', async () => {
      const prisma = buildPrismaMock();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AccountDeletionSweepService(prisma);

      const result = await service.sweepPendingDeletions();

      expect(result).toEqual({ hardDeletedUserIds: [], blockedUserIds: [] });
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
      expect(prisma.user.delete).not.toHaveBeenCalled();
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
