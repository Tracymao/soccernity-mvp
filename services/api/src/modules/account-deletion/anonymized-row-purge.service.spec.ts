import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { userForeignKeyRelations } from './anonymized-row-purge.references';
import {
  ANONYMIZED_PURGE_MAX_PER_RUN,
  ANONYMIZED_ROW_RETENTION_DAYS,
  AnonymizedRowPurgeService,
} from './anonymized-row-purge.service';

// backend/w6-purge-anonymised-rows (B-043; Decision Log #375).

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-12-01T03:30:00.000Z');
const CUTOFF = new Date(NOW.getTime() - 30 * DAY);

interface TxOpts {
  user?: { accountStatus: string; anonymizedAt: Date | null; isMinor: boolean } | null;
  confirmedConsent?: boolean;
}

function buildPrisma(opts: TxOpts = {}) {
  const user =
    opts.user === undefined
      ? { accountStatus: 'deleted', anonymizedAt: new Date(CUTOFF.getTime() - DAY), isMinor: false }
      : opts.user;

  // A transaction client where every model finds nothing, plus the user/consent calls the service makes.
  const tx: Record<string, any> = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  for (const m of Prisma.dmmf.datamodel.models) {
    const d = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    if (!tx[d]) tx[d] = {};
    tx[d].findFirst = jest.fn().mockResolvedValue(null);
  }
  tx.revokedUsername.deleteMany = jest.fn().mockResolvedValue({ count: 0 });
  tx.consentAuditRecord.findFirst = jest.fn().mockResolvedValue(opts.confirmedConsent ? { id: 'c1' } : null);
  tx.consentAuditRecord.create = jest.fn();
  tx.consentAuditRecord.deleteMany = jest.fn();

  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue([{ id: 'u1' }]) },
    // B-139 cleanup: the SQL join selects due record ids; each is then deleted on its own.
    $queryRaw: jest.fn().mockResolvedValue([]),
    revokedUsername: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    $transaction: jest.fn((fn: (t: unknown) => unknown, _o?: unknown) => fn(tx)),
  };
  return { prisma: prisma as unknown as PrismaService, mock: prisma, tx };
}

describe('AnonymizedRowPurgeService', () => {
  it('uses a 30-day retention and a per-run cap', () => {
    expect(ANONYMIZED_ROW_RETENTION_DAYS).toBe(30);
    expect(ANONYMIZED_PURGE_MAX_PER_RUN).toBe(200);
  });

  describe('selection', () => {
    it("selects only 'deleted' rows anonymised at or before now minus 30 days (a null anonymizedAt never matches `lte`)", async () => {
      const { prisma, mock } = buildPrisma();
      mock.user.findMany.mockResolvedValue([]);

      await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(mock.user.findMany).toHaveBeenCalledWith({
        where: { accountStatus: 'deleted', anonymizedAt: { lte: CUTOFF } },
        select: { id: true },
        orderBy: { anonymizedAt: 'asc' },
        take: ANONYMIZED_PURGE_MAX_PER_RUN + 1,
      });
    });

    it('caps a run at the maximum and reports that more are due (the rest wait for the next run)', async () => {
      const { prisma, mock, tx } = buildPrisma();
      mock.user.findMany.mockResolvedValue(
        Array.from({ length: ANONYMIZED_PURGE_MAX_PER_RUN + 1 }, (_, i) => ({ id: `u${i}` })),
      );

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(r.capped).toBe(true);
      expect(r.purgedUserIds).toHaveLength(ANONYMIZED_PURGE_MAX_PER_RUN);
      expect(r.purgedUserIds).not.toContain(`u${ANONYMIZED_PURGE_MAX_PER_RUN}`);
      expect(tx.user.deleteMany).toHaveBeenCalledTimes(ANONYMIZED_PURGE_MAX_PER_RUN);
    });

    it('is not capped when exactly the maximum is due', async () => {
      const { prisma, mock } = buildPrisma();
      mock.user.findMany.mockResolvedValue(
        Array.from({ length: ANONYMIZED_PURGE_MAX_PER_RUN }, (_, i) => ({ id: `u${i}` })),
      );
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.capped).toBe(false);
      expect(r.purgedUserIds).toHaveLength(ANONYMIZED_PURGE_MAX_PER_RUN);
    });
  });

  describe('the 30-day boundary (re-checked inside the transaction)', () => {
    it('29 days 23 hours after anonymisation: NOT purged', async () => {
      const anonymizedAt = new Date(NOW.getTime() - (30 * DAY - 60 * 60 * 1000));
      const { prisma, tx } = buildPrisma({ user: { accountStatus: 'deleted', anonymizedAt, isMinor: false } });

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(r.purgedUserIds).toEqual([]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('exactly 30 days after anonymisation: purged', async () => {
      const { prisma, tx } = buildPrisma({ user: { accountStatus: 'deleted', anonymizedAt: CUTOFF, isMinor: false } });

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(r.purgedUserIds).toEqual(['u1']);
      expect(tx.user.deleteMany).toHaveBeenCalledWith({
        where: { id: 'u1', accountStatus: 'deleted', anonymizedAt: { lte: CUTOFF } },
      });
    });

    it('30 days and one hour: purged', async () => {
      const anonymizedAt = new Date(CUTOFF.getTime() - 60 * 60 * 1000);
      const { prisma } = buildPrisma({ user: { accountStatus: 'deleted', anonymizedAt, isMinor: false } });
      expect((await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW)).purgedUserIds).toEqual(['u1']);
    });

    it('a row with a null anonymizedAt is never purged, even if it somehow reaches the transaction', async () => {
      const { prisma, tx } = buildPrisma({ user: { accountStatus: 'deleted', anonymizedAt: null, isMinor: false } });
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.purgedUserIds).toEqual([]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('a row that is no longer in the deleted state is skipped', async () => {
      const { prisma, tx } = buildPrisma({
        user: { accountStatus: 'active', anonymizedAt: new Date(CUTOFF.getTime() - DAY), isMinor: false },
      });
      expect((await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW)).purgedUserIds).toEqual([]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('a row that vanished between the selection and the transaction is skipped', async () => {
      const { prisma, tx } = buildPrisma({ user: null });
      expect((await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW)).purgedUserIds).toEqual([]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('does not report a purge when the guarded DELETE removed nothing', async () => {
      const { prisma, tx } = buildPrisma();
      tx.user.deleteMany.mockResolvedValue({ count: 0 });
      expect((await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW)).purgedUserIds).toEqual([]);
    });
  });

  describe('what blocks a purge', () => {
    // One test per model in the DERIVED list of relations to User: the row survives, and nothing is deleted.
    // The CASCADE foreign keys are the ones a plain DELETE would have silently destroyed.
    it.each(userForeignKeyRelations().map((r) => [r.key, r] as const))('%s still present: not purged', async (_k, r) => {
      const { prisma, tx } = buildPrisma();
      tx[r.delegate].findFirst.mockImplementation(async (args: { where: Record<string, string> }) =>
        args.where[r.fkField] === 'u1' ? { [r.fkField]: 'u1' } : null,
      );

      const result = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(result.purgedUserIds).toEqual([]);
      expect(result.keptUserIds).toEqual([{ userId: 'u1', blocker: r.key, kind: expect.stringMatching(/content|anomaly/) }]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('a Report filed against the user between the work list and the delete stops the purge', async () => {
      const { prisma, mock, tx } = buildPrisma();
      // The work list was built with no reports; by the time the transaction looks, one exists.
      tx.$queryRaw.mockImplementation(async (s: TemplateStringsArray) => (s.join('?').includes('FROM "Report"') ? [{ found: 1 }] : []));

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(mock.user.findMany).toHaveBeenCalledTimes(1);
      expect(r.purgedUserIds).toEqual([]);
      expect(r.keptUserIds).toEqual([{ userId: 'u1', blocker: 'Report.targetId', kind: 'content' }]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it.each([
      ['RevokedUsername', 'revokedUsername'],
      ['AdminActionLog', 'adminActionLog'],
      ['ContestVoteEvent', 'contestVoteEvent'],
      ['AgeReclassificationLog', 'ageReclassificationLog'],
      ['BanterRoom', 'banterRoom'],
      ['Conversation', 'conversation'],
    ])('a %s record naming the user stops the purge', async (_n, delegate) => {
      const { prisma, tx } = buildPrisma();
      tx[delegate].findFirst.mockResolvedValue({ id: 'x' });
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.purgedUserIds).toEqual([]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('a leftover club-membership row stops the purge (the join table CASCADEs)', async () => {
      const { prisma, tx } = buildPrisma();
      tx.$queryRaw.mockImplementation(async (s: TemplateStringsArray) => (s.join('?').includes('"_ClubMembership"') ? [{ found: 1 }] : []));
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.keptUserIds).toEqual([{ userId: 'u1', blocker: '_ClubMembership', kind: 'anomaly' }]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('revoked-username records (B-139)', () => {
    it("purge: deletes the row's expired-hold records inside the transaction BEFORE it looks for blockers", async () => {
      const { prisma, tx } = buildPrisma();
      const order: string[] = [];
      tx.revokedUsername.deleteMany.mockImplementation(async () => (order.push('deleteExpired'), { count: 1 }));
      tx.revokedUsername.findFirst.mockImplementation(async () => (order.push('lookup'), null));

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(tx.revokedUsername.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', holdUntil: { lte: NOW } } });
      expect(order).toEqual(['deleteExpired', 'lookup']);
      expect(r.purgedUserIds).toEqual(['u1']);
    });

    it('purge: a record whose hold is STILL RUNNING blocks this run (the row is kept, retried next run)', async () => {
      const { prisma, tx } = buildPrisma();
      // The expired-hold delete matches nothing; the running hold is still there for the lookup.
      tx.revokedUsername.findFirst.mockResolvedValue({ id: 'r1' });

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(r.purgedUserIds).toEqual([]);
      expect(r.keptUserIds).toEqual([{ userId: 'u1', blocker: 'RevokedUsername.userId', kind: 'content' }]);
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });

    it('cleanup: selects only records of ANONYMISED users whose hold has passed, oldest first, and deletes each', async () => {
      const { prisma, mock } = buildPrisma();
      mock.$queryRaw.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);

      const r = await new AnonymizedRowPurgeService(prisma).cleanupRevokedUsernames(NOW);

      const sql = (mock.$queryRaw.mock.calls[0][0] as string[]).join('?');
      expect(sql).toContain(`u."accountStatus" = 'deleted'`);
      expect(sql).toContain('u."anonymizedAt" IS NOT NULL');
      expect(sql).toContain('r."holdUntil" <=');
      expect(sql).toContain('ORDER BY r."holdUntil" ASC');
      expect(mock.revokedUsername.deleteMany).toHaveBeenCalledWith({ where: { id: 'r1', holdUntil: { lte: NOW } } });
      expect(mock.revokedUsername.deleteMany).toHaveBeenCalledWith({ where: { id: 'r2', holdUntil: { lte: NOW } } });
      expect(r).toEqual({ deletedIds: ['r1', 'r2'], erroredIds: [], capped: false });
    });

    it('cleanup: never touches a record when nothing is due (non-anonymised users are filtered out in the SQL)', async () => {
      const { prisma, mock } = buildPrisma();
      const r = await new AnonymizedRowPurgeService(prisma).cleanupRevokedUsernames(NOW);
      expect(mock.revokedUsername.deleteMany).not.toHaveBeenCalled();
      expect(r).toEqual({ deletedIds: [], erroredIds: [], capped: false });
    });

    it('cleanup: caps a run at the maximum, reports it, and leaves the rest for the next run', async () => {
      const { prisma, mock } = buildPrisma();
      mock.$queryRaw.mockResolvedValue(
        Array.from({ length: ANONYMIZED_PURGE_MAX_PER_RUN + 1 }, (_, i) => ({ id: `r${i}` })),
      );
      const r = await new AnonymizedRowPurgeService(prisma).cleanupRevokedUsernames(NOW);
      expect(r.capped).toBe(true);
      expect(r.deletedIds).toHaveLength(ANONYMIZED_PURGE_MAX_PER_RUN);
      expect(r.deletedIds).not.toContain(`r${ANONYMIZED_PURGE_MAX_PER_RUN}`);
      expect(mock.revokedUsername.deleteMany).toHaveBeenCalledTimes(ANONYMIZED_PURGE_MAX_PER_RUN);
    });

    it('cleanup: one failing delete is reported and does not stop the others; a re-run is idempotent (count 0 is not reported)', async () => {
      const { prisma, mock } = buildPrisma();
      mock.$queryRaw.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
      mock.revokedUsername.deleteMany
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce({ count: 1 })
        .mockResolvedValueOnce({ count: 0 }); // already gone (a concurrent run)

      const r = await new AnonymizedRowPurgeService(prisma).cleanupRevokedUsernames(NOW);

      expect(r.erroredIds).toEqual(['r1']);
      expect(r.deletedIds).toEqual(['r2']);
    });

    it('the daily job runs the cleanup BEFORE the purge, and a cleanup failure does not stop the purge', async () => {
      const { prisma, mock } = buildPrisma();
      const order: string[] = [];
      mock.$queryRaw.mockImplementation(async () => {
        order.push('cleanup');
        throw new Error('db down');
      });
      mock.user.findMany.mockImplementation(async () => (order.push('purge'), []));

      await expect(new AnonymizedRowPurgeService(prisma).runDailyPurge()).resolves.toBeUndefined();

      expect(order).toEqual(['cleanup', 'purge']);
    });
  });

  describe('which rule applied (#375 (a) / (b))', () => {
    it('(a) a minor with NO confirmed consent record is purged as a never-approved minor', async () => {
      const { prisma, tx } = buildPrisma({
        user: { accountStatus: 'deleted', anonymizedAt: new Date(CUTOFF.getTime() - DAY), isMinor: true },
        confirmedConsent: false,
      });
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.purgedUserIds).toEqual(['u1']);
      expect(r.purgedReasons).toEqual({ u1: 'never_approved_minor' });
      expect(tx.consentAuditRecord.findFirst).toHaveBeenCalledWith({
        where: { minorUserId: 'u1', consentStatus: 'confirmed' },
        select: { id: true },
      });
    });

    it('a minor WITH a confirmed consent record is purged only under (b), no content', async () => {
      const { prisma } = buildPrisma({
        user: { accountStatus: 'deleted', anonymizedAt: new Date(CUTOFF.getTime() - DAY), isMinor: true },
        confirmedConsent: true,
      });
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.purgedReasons).toEqual({ u1: 'no_content' });
    });

    it('an adult is purged under (b) and the consent record is not even looked up', async () => {
      const { prisma, tx } = buildPrisma();
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.purgedReasons).toEqual({ u1: 'no_content' });
      expect(tx.consentAuditRecord.findFirst).not.toHaveBeenCalled();
    });

    it('(a) does not force a purge: a never-approved minor who still has content is kept', async () => {
      const { prisma, tx } = buildPrisma({
        user: { accountStatus: 'deleted', anonymizedAt: new Date(CUTOFF.getTime() - DAY), isMinor: true },
        confirmedConsent: false,
      });
      tx.report.findFirst.mockImplementation(async (args: { where: Record<string, string> }) =>
        args.where.reporterId === 'u1' ? { reporterId: 'u1' } : null,
      );
      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(r.purgedUserIds).toEqual([]);
      expect(r.keptUserIds[0]).toMatchObject({ userId: 'u1', blocker: 'Report.reporter' });
      expect(tx.user.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('safety', () => {
    it('never touches ConsentAuditRecord (it runs on its own 6-month clock)', async () => {
      const { prisma, tx } = buildPrisma({
        user: { accountStatus: 'deleted', anonymizedAt: new Date(CUTOFF.getTime() - DAY), isMinor: true },
      });
      await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(tx.consentAuditRecord.create).not.toHaveBeenCalled();
      expect(tx.consentAuditRecord.deleteMany).not.toHaveBeenCalled();
    });

    it('runs each row in its own Serializable transaction', async () => {
      const { prisma, mock } = buildPrisma();
      mock.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);
      expect(mock.$transaction).toHaveBeenCalledTimes(2);
      for (const call of mock.$transaction.mock.calls) {
        expect(call[1]).toMatchObject({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      }
    });

    it('one row failing (e.g. a serialization conflict) is reported and does not stop the others', async () => {
      const { prisma, mock, tx } = buildPrisma();
      mock.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);
      mock.$transaction.mockImplementationOnce(async () => {
        throw new Error('could not serialize access');
      });

      const r = await new AnonymizedRowPurgeService(prisma).purgeAnonymizedRows(NOW);

      expect(r.erroredUserIds).toEqual(['u1']);
      expect(r.purgedUserIds).toEqual(['u2']);
      expect(tx.user.deleteMany).toHaveBeenCalledTimes(1);
    });

    it('is a cron job, not an HTTP endpoint', async () => {
      const { prisma, mock } = buildPrisma();
      mock.user.findMany.mockResolvedValue([]);
      await expect(new AnonymizedRowPurgeService(prisma).runDailyPurge()).resolves.toBeUndefined();
    });
  });
});
