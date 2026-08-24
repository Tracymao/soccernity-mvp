import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for AccountDeletionSweepService (Build Plan
// Section 9, Decision Log #42) — the same category (2)/(3)
// "transaction/isolation-level reasoning" and "genuinely novel Prisma
// relation/constraint" test/README.md's guiding principle calls out for
// e2e coverage. This one specifically needed real Postgres, not a mock:
// the entire point of hardDeleteUser's transaction ordering is that
// Guardian.minorUserId is a real ON DELETE RESTRICT foreign key against
// User (confirmed against the real migration SQL before writing any
// code) — a mocked PrismaService would happily let a User delete
// "succeed" regardless of ordering, telling you nothing about whether
// the real constraint is actually satisfied.
describe('AccountDeletionSweepService e2e: 30-day hard-delete + 6-month consent-audit purge, against real Postgres', () => {
  let app: INestApplication;
  let sweepService: AccountDeletionSweepService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    sweepService = app.get(AccountDeletionSweepService);
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function uniqueEmail(label: string): string {
    return `e2e-deletion-sweep-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  function daysAgo(n: number): Date {
    return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  }

  async function seedPendingDeletionUser(
    label: string,
    overrides: { pendingDeletionAt: Date; isMinor?: boolean },
  ) {
    const prisma = getTestPrismaClient();
    return prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Deletion Sweep User ${label}`,
        dateOfBirth: overrides.isMinor ? new Date('2015-01-01') : new Date('1998-07-04'),
        isMinor: overrides.isMinor ?? false,
        accountStatus: 'pending_deletion',
        pendingDeletionAt: overrides.pendingDeletionAt,
      },
    });
  }

  describe('sweepPendingDeletions — the 30-day grace period boundary', () => {
    it('does NOT hard-delete an account that has not yet reached its 30-day mark', async () => {
      const notYetDue = await seedPendingDeletionUser('not-yet-due', { pendingDeletionAt: daysAgo(29) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).not.toContain(notYetDue.id);
      const prisma = getTestPrismaClient();
      const stillThere = await prisma.user.findUnique({ where: { id: notYetDue.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.accountStatus).toBe('pending_deletion');
    });

    it('hard-deletes an account past its 30-day mark that has no related content', async () => {
      const pastDue = await seedPendingDeletionUser('past-due', { pendingDeletionAt: daysAgo(31) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toContain(pastDue.id);
      const prisma = getTestPrismaClient();
      const gone = await prisma.user.findUnique({ where: { id: pastDue.id } });
      expect(gone).toBeNull();
    });

    it('a single sweep run correctly separates a not-yet-due account from a past-due one, side by side', async () => {
      const notYetDue = await seedPendingDeletionUser('boundary-not-due', { pendingDeletionAt: daysAgo(1) });
      const pastDue = await seedPendingDeletionUser('boundary-past-due', { pendingDeletionAt: daysAgo(30) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toContain(pastDue.id);
      expect(result.hardDeletedUserIds).not.toContain(notYetDue.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: pastDue.id } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: notYetDue.id } })).not.toBeNull();
    });

    it('leaves active and deactivated accounts alone regardless of how old they are', async () => {
      const prisma = getTestPrismaClient();
      const active = await prisma.user.create({
        data: {
          email: uniqueEmail('active'),
          passwordHash: 'unused',
          displayName: 'Still Active',
          dateOfBirth: new Date('1998-07-04'),
          accountStatus: 'active',
        },
      });
      const deactivated = await prisma.user.create({
        data: {
          email: uniqueEmail('deactivated'),
          passwordHash: 'unused',
          displayName: 'Deactivated Only',
          dateOfBirth: new Date('1998-07-04'),
          accountStatus: 'deactivated',
        },
      });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).toHaveLength(0);
      expect(await prisma.user.findUnique({ where: { id: active.id } })).not.toBeNull();
      expect(await prisma.user.findUnique({ where: { id: deactivated.id } })).not.toBeNull();
    });
  });

  describe('sweepPendingDeletions — minors with a Guardian row: ConsentAuditRecord survives the User hard-delete', () => {
    async function seedMinorWithGuardian(
      label: string,
      guardianOverrides: { consentStatus: 'pending' | 'confirmed'; consentTimestamp: Date | null },
    ) {
      const prisma = getTestPrismaClient();
      const minor = await seedPendingDeletionUser(label, { pendingDeletionAt: daysAgo(31), isMinor: true });
      await prisma.guardian.create({
        data: {
          minorUserId: minor.id,
          name: 'Real Guardian Name',
          email: 'real-guardian-email@example.com',
          relationship: 'parent',
          consentStatus: guardianOverrides.consentStatus,
          consentToken: randomUUID(),
          consentTokenExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
          consentTimestamp: guardianOverrides.consentTimestamp,
        },
      });
      return minor;
    }

    it('confirmed consent: hard-deletes User and Guardian, and a ConsentAuditRecord survives with the confirmed snapshot', async () => {
      const confirmedAt = new Date('2026-06-01T12:00:00.000Z');
      const minor = await seedMinorWithGuardian('confirmed', {
        consentStatus: 'confirmed',
        consentTimestamp: confirmedAt,
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.hardDeletedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: minor.id } })).toBeNull();
      expect(await prisma.guardian.findUnique({ where: { minorUserId: minor.id } })).toBeNull();

      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(1);
      const record = auditRecords[0]!;
      expect(record.consentStatus).toBe('confirmed');
      expect(record.consentConfirmedAt).toEqual(confirmedAt);
      expect(record.consentMethod).toBe('guardian-consent-link');

      // No more PII than necessary — Decision Log #42 explicitly rules
      // out a full Guardian mirror. Structural proof, not just "we didn't
      // populate it": the model itself has no name/email/relationship
      // columns for this to even leak through.
      expect(Object.keys(record).sort()).toEqual(
        ['id', 'minorUserId', 'consentStatus', 'consentConfirmedAt', 'consentMethod', 'createdAt'].sort(),
      );
      expect(JSON.stringify(record)).not.toContain('Real Guardian Name');
      expect(JSON.stringify(record)).not.toContain('real-guardian-email@example.com');
    });

    it('pending (never-confirmed) consent: still hard-deletes and still snapshots — consentConfirmedAt is null', async () => {
      const minor = await seedMinorWithGuardian('pending', { consentStatus: 'pending', consentTimestamp: null });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.hardDeletedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: minor.id } })).toBeNull();

      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(1);
      expect(auditRecords[0]!.consentStatus).toBe('pending');
      expect(auditRecords[0]!.consentConfirmedAt).toBeNull();
    });

    it('a minor past due with no Guardian row at all is hard-deleted with no ConsentAuditRecord created', async () => {
      const minor = await seedPendingDeletionUser('minor-no-guardian', {
        pendingDeletionAt: daysAgo(31),
        isMinor: true,
      });

      const result = await sweepService.sweepPendingDeletions();
      expect(result.hardDeletedUserIds).toContain(minor.id);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.findUnique({ where: { id: minor.id } })).toBeNull();
      const auditRecords = await prisma.consentAuditRecord.findMany({ where: { minorUserId: minor.id } });
      expect(auditRecords).toHaveLength(0);
    });
  });

  describe('sweepPendingDeletions — the RESTRICT/related-content gap (Decision Log #44 candidate, not resolved by this PR)', () => {
    it('a past-due account with a real Post is left in pending_deletion, not hard-deleted, and is reported as blocked', async () => {
      const prisma = getTestPrismaClient();
      const author = await seedPendingDeletionUser('has-post', { pendingDeletionAt: daysAgo(31) });
      await prisma.post.create({
        data: { authorId: author.id, contentText: 'A real post that should block a hard-delete today' },
      });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.hardDeletedUserIds).not.toContain(author.id);
      expect(result.blockedUserIds).toContain(author.id);

      const stillThere = await prisma.user.findUnique({ where: { id: author.id } });
      expect(stillThere).not.toBeNull();
      expect(stillThere!.accountStatus).toBe('pending_deletion');
    });

    it('one blocked account does not prevent an unrelated eligible account from being hard-deleted in the same sweep run', async () => {
      const prisma = getTestPrismaClient();
      const blocked = await seedPendingDeletionUser('blocked-sibling', { pendingDeletionAt: daysAgo(31) });
      await prisma.post.create({ data: { authorId: blocked.id, contentText: 'blocks hard-delete' } });
      const eligible = await seedPendingDeletionUser('eligible-sibling', { pendingDeletionAt: daysAgo(31) });

      const result = await sweepService.sweepPendingDeletions();

      expect(result.blockedUserIds).toContain(blocked.id);
      expect(result.hardDeletedUserIds).toContain(eligible.id);
      expect(await prisma.user.findUnique({ where: { id: blocked.id } })).not.toBeNull();
      expect(await prisma.user.findUnique({ where: { id: eligible.id } })).toBeNull();
    });
  });

  describe('purgeExpiredConsentAuditRecords — independent 6-month timer', () => {
    async function seedAuditRecord(createdAt: Date) {
      const prisma = getTestPrismaClient();
      return prisma.consentAuditRecord.create({
        data: {
          minorUserId: randomUUID(),
          consentStatus: 'confirmed',
          consentConfirmedAt: createdAt,
          createdAt,
        },
      });
    }

    it('purges a record whose createdAt is past the 6-month mark', async () => {
      const sevenMonthsAgo = new Date();
      sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
      const old = await seedAuditRecord(sevenMonthsAgo);

      const result = await sweepService.purgeExpiredConsentAuditRecords();

      expect(result.purgedCount).toBe(1);
      const prisma = getTestPrismaClient();
      expect(await prisma.consentAuditRecord.findUnique({ where: { id: old.id } })).toBeNull();
    });

    it('does NOT purge a record still inside its 6-month window', async () => {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      const recent = await seedAuditRecord(oneMonthAgo);

      const result = await sweepService.purgeExpiredConsentAuditRecords();

      expect(result.purgedCount).toBe(0);
      const prisma = getTestPrismaClient();
      expect(await prisma.consentAuditRecord.findUnique({ where: { id: recent.id } })).not.toBeNull();
    });

    // The core claim of this describe block: this timer runs entirely off
    // ConsentAuditRecord.createdAt, with no dependency whatsoever on any
    // User row (there isn't one — minorUserId here doesn't reference a
    // real, currently-existing user, deliberately, since the record's
    // whole design point is to survive independently of one) or on
    // whether a sweepPendingDeletions() run has ever happened at all.
    it('fires independently of any User/pending_deletion state — no live User row is involved anywhere in this test', async () => {
      const eightMonthsAgo = new Date();
      eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);
      const old = await seedAuditRecord(eightMonthsAgo);

      const prisma = getTestPrismaClient();
      expect(await prisma.user.count()).toBe(0);

      const result = await sweepService.purgeExpiredConsentAuditRecords();

      expect(result.purgedCount).toBe(1);
      expect(await prisma.consentAuditRecord.findUnique({ where: { id: old.id } })).toBeNull();
    });
  });
});
