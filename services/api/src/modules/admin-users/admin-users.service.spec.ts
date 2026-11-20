import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionSweepService } from '../account-deletion/account-deletion-sweep.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { TokenService } from '../auth/token/token.service';
import { AccountSuspensionService } from '../account-suspension/account-suspension.service';
import { AdminUsersService } from './admin-users.service';
import { encodeAdminUsersCursor } from './cursor.util';

// Mocked-Prisma unit tests, following admin-content.service.spec.ts /
// moderation.service.spec.ts's own convention. TokenService and
// AccountDeletionSweepService are mocked too (this service only ever
// calls one method on each) — real cascade-delete behaviour against
// Postgres is already proven in
// test/account-deletion-sweep.e2e-spec.ts / test/account-deletion.e2e-spec.ts;
// this file covers AdminUsersService's own branching/guard logic.
//
// feat/admin-action-log — AdminUsersService now also takes an
// AdminActionLogService, called after updateUserStatus's own write
// succeeds (both the plain accountStatus write and the immediate-delete
// branch).

function buildDeps() {
  const prisma = {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      // B-291: the shared suspend path writes with a guarded updateMany; the response row is re-read afterwards.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn(),
    },
    // backend/w12-points: a suspension revokes the account's baseline points.
    pointsLedgerEntry: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    // B-044: the immediate delete asks for an active legal / bad-faith hold first (none by default).
    accountHold: { findMany: jest.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;
  // B-291: the shared path runs inside a transaction; the fake just hands its own client to the callback.
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));

  const tokenService = {
    revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenService;

  const accountDeletionSweepService = {
    anonymizeUser: jest.fn().mockResolvedValue(undefined),
    listStalledHolds: jest.fn().mockResolvedValue([]),
  } as unknown as AccountDeletionSweepService;

  const adminActionLogService = {
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as AdminActionLogService;

  return { prisma, tokenService, accountDeletionSweepService, adminActionLogService };
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

// B-279: a no-op stand-in for GuardianSecurityNoticeService so the pre-existing cases keep their shape.
const guardianNotices = { prepare: jest.fn().mockResolvedValue(null), notifyInBackground: jest.fn() } as never;

// B-291: the REAL shared suspend / reinstate path over the same fakes, so these specs still prove the user-page
// behaviour end to end (sessions, points, status write). Email is a stand-in.
const emailStub = {
  sendAccountSuspendedEmail: jest.fn().mockResolvedValue(undefined),
  sendAccountReinstatedEmail: jest.fn().mockResolvedValue(undefined),
} as never;
function makeSuspension(prisma: unknown, tokenService: unknown) {
  return new AccountSuspensionService(prisma as never, tokenService as never, guardianNotices, emailStub);
}

describe('AdminUsersService', () => {
  // B-029 (Decision Log #372)
  describe('incorrect-details reports', () => {
    function build() {
      const deps = buildDeps();
      (deps.prisma as any).guardian = { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() };
      const service = new AdminUsersService(deps.prisma, deps.tokenService, deps.accountDeletionSweepService, deps.adminActionLogService, guardianNotices, makeSuspension(deps.prisma, deps.tokenService));
      return { ...deps, service, guardian: (deps.prisma as any).guardian };
    }

    it('lists open reports oldest-first, with who-to-contact and NO date of birth, token or minor email', async () => {
      const { service, guardian } = build();
      guardian.findMany.mockResolvedValue([
        {
          minorUserId: 'u1', name: 'Grace Parent', email: 'grace@example.com', consentStatus: 'pending',
          incorrectDetailsReportedAt: new Date('2026-10-02T00:00:00Z'),
          minorUser: { displayName: 'Ada Minor', accountStatus: 'active' },
        },
      ]);

      const out = await service.listIncorrectDetailsReports();

      expect(out).toEqual({
        items: [
          {
            userId: 'u1', minorDisplayName: 'Ada Minor', minorAccountStatus: 'active', guardianName: 'Grace Parent',
            guardianEmail: 'grace@example.com', consentStatus: 'pending', reportedAt: new Date('2026-10-02T00:00:00Z'),
          },
        ],
        truncated: false,
      });
      const arg = guardian.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ incorrectDetailsReportedAt: { not: null } });
      expect(arg.orderBy[0]).toEqual({ incorrectDetailsReportedAt: 'asc' });
      expect(JSON.stringify(arg.select)).not.toMatch(/consentToken|dateOfBirth|withdrawalToken/);
      expect(JSON.stringify(out)).not.toMatch(/dateOfBirth|consentToken/);
    });

    it('says so honestly when the cap is hit', async () => {
      const { service, guardian } = build();
      const row = (i: number) => ({
        minorUserId: `u${i}`, name: 'G', email: 'g@example.com', consentStatus: 'pending',
        incorrectDetailsReportedAt: new Date(), minorUser: { displayName: 'M', accountStatus: 'active' },
      });
      guardian.findMany.mockResolvedValue(Array.from({ length: 201 }, (_, i) => row(i)));
      const out = await service.listIncorrectDetailsReports();
      expect(out.items).toHaveLength(200);
      expect(out.truncated).toBe(true);
    });

    it('resolve clears the flag only where it is open, and writes ONE audit row naming the admin and the user', async () => {
      const { service, guardian, adminActionLogService } = build();
      guardian.updateMany.mockResolvedValue({ count: 1 });

      await expect(service.resolveIncorrectDetailsReport('u1', 'admin-1')).resolves.toEqual({ resolved: true });

      expect(guardian.updateMany).toHaveBeenCalledWith({
        where: { minorUserId: 'u1', incorrectDetailsReportedAt: { not: null } },
        data: { incorrectDetailsReportedAt: null },
      });
      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith('admin-1', 'guardian.incorrect_details_resolved', 'user', 'u1');
    });

    it('resolve is a 404 and writes NO audit row when there is nothing open (also what a lost race sees)', async () => {
      const { service, guardian, adminActionLogService } = build();
      guardian.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.resolveIncorrectDetailsReport('u1', 'admin-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });
  });

  describe('listStalledHolds', () => {
    it('defaults the threshold to 90 days and only reads', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      const out = await service.listStalledHolds();

      expect(accountDeletionSweepService.listStalledHolds).toHaveBeenCalledWith(undefined);
      expect(out).toEqual({ thresholdDays: 90, items: [] });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    // backend/b045-held-list-hold-ids: the items (incl. holdId / reportId) pass through untouched.
    it('passes the sweep items through unchanged, including holdId and reportId', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      const items = [
        { userId: 'u1', holdType: 'legal_hold', isAdminHold: true, holdId: 'h1', reportId: 'r1' },
        { userId: 'u2', holdType: 'open_report', isAdminHold: false, holdId: null, reportId: null },
      ];
      (accountDeletionSweepService.listStalledHolds as jest.Mock).mockResolvedValueOnce(items);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      const out = await service.listStalledHolds(45);

      expect(out).toEqual({ thresholdDays: 45, items });
    });
  });

  describe('listUsers', () => {
    it('applies an exact-match status filter alongside the cursor', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await service.listUsers({ status: 'suspended', limit: 10 });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ accountStatus: 'suspended' }] },
          take: 11,
        }),
      );
    });

    it('returns a nextCursor only when there are more rows than the page size', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      const rows = Array.from({ length: 3 }, (_, i) =>
        user({ id: `user-${i}`, createdAt: new Date(2026, 8, i + 1) }),
      );
      (prisma.user.findMany as jest.Mock).mockResolvedValue(rows);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      const page = await service.listUsers({ limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).not.toBeNull();
    });

    it('decodes a supplied cursor into an (createdAt, id) OR condition', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));
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
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user());
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      const result = await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended', reasonCategory: 'spam_or_scam' });

      // Guarded on the status that was read; a user-page suspension records no report link.
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', accountStatus: 'active' },
        data: { accountStatus: 'suspended' },
      });
      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
      expect(result).toEqual({ deleted: false, user: expect.objectContaining({ accountStatus: 'suspended' }) });
    });

    it('does NOT revoke sessions when moving back to active', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user({ accountStatus: 'active' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await service.updateUserStatus('user-1', 'admin-1', { status: 'active' });

      expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(prisma.pointsLedgerEntry.updateMany).not.toHaveBeenCalled();
    });

    // A deliberate, disclosed judgment call (see admin-users.service.ts's
    // own comment): an admin may move a user OUT of pending_deletion back
    // to active, undoing an accidental self-deletion request within the
    // grace window. pendingDeletionAt must be cleared in the same write
    // so AccountDeletionSweepService's own query can never pick the row
    // up again.
    it('clears a stale pendingDeletionAt when reactivating a pending_deletion user', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        user({ accountStatus: 'pending_deletion' }),
      );
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user({ accountStatus: 'active' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await service.updateUserStatus('user-1', 'admin-1', { status: 'active' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { accountStatus: 'active', pendingDeletionAt: null },
      });
    });

    it('throws NotFoundException for a non-existent user', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(
        service.updateUserStatus('missing-user', 'admin-1', { status: 'suspended', reasonCategory: 'other' }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('updateUserStatus — deleted (immediate, admin-triggered)', () => {
    it('revokes sessions and calls anonymizeUser directly, skipping the 30-day grace period', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ isMinor: true }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      const result = await service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' });

      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
      expect(accountDeletionSweepService.anonymizeUser).toHaveBeenCalledWith('user-1', true);
      // Never touches accountStatus via a plain update here -- anonymizeUser
      // owns the whole write.
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: true, id: 'user-1' });
    });

    // B-044 (Decision Log #376; veto-able default): an active admin hold protects the account from this route.
    it.each([
      ['legal_hold', 'legal hold'],
      ['bad_faith', 'bad-faith hold'],
    ])('REFUSES with a coded 409 naming the hold type while a %s is active, before revoking or changing anything', async (type, wording) => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user());
      (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([
        { id: 'h1', type, reportId: 'r1', expiresAt: type === 'legal_hold' ? null : new Date('2999-01-01T00:00:00.000Z') },
      ]);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      const promise = service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' });

      await expect(promise).rejects.toBeInstanceOf(ConflictException);
      await expect(promise).rejects.toMatchObject({
        response: expect.objectContaining({ statusCode: 409, code: 'account_hold_active', holdType: type }),
      });
      await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ message: expect.stringContaining(wording) }) });
      expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
      expect(accountDeletionSweepService.anonymizeUser).not.toHaveBeenCalled();
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('a REPORT-based hold (no AccountHold row) does NOT block it: the explicit admin choice stands, as before', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user());
      // no AccountHold rows; an open report is not even consulted by this route
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' })).resolves.toEqual({ deleted: true, id: 'user-1' });
      expect(accountDeletionSweepService.anonymizeUser).toHaveBeenCalled();
    });

    it('only the delete is refused: suspend and activate are unaffected by an admin hold', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user());
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
      (prisma.accountHold.findMany as jest.Mock).mockResolvedValue([{ id: 'h1', type: 'legal_hold', reportId: 'r1', expiresAt: null }]);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'suspended', reasonCategory: 'other' })).resolves.toMatchObject({ deleted: false });
    });

    it('rejects any status change on an already-deleted (anonymized) user with 409 -- it cannot be resurrected', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ accountStatus: 'deleted' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'active' })).rejects.toThrow(ConflictException);
      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' })).rejects.toThrow(ConflictException);
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(accountDeletionSweepService.anonymizeUser).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a non-existent user and never calls anonymizeUser', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(
        service.updateUserStatus('missing-user', 'admin-1', { status: 'deleted' }),
      ).rejects.toThrow(NotFoundException);
      expect(accountDeletionSweepService.anonymizeUser).not.toHaveBeenCalled();
    });
  });

  // ---------- AdminActionLog wiring (feat/admin-action-log) ----------

  describe('updateUserStatus — AdminActionLog wiring', () => {
    it('records an AdminActionLog row after a plain active/suspended write, with the new status as notes', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user());
      (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended', reasonCategory: 'harassment_or_bullying' });

      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith(
        'admin-1',
        'user.status_updated',
        'user',
        'user-1',
        'status=suspended; reasonCategory=harassment_or_bullying',
      );
    });

    it('records an AdminActionLog row on the immediate-delete branch too', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ isMinor: false }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await service.updateUserStatus('user-1', 'admin-1', { status: 'deleted' });

      expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
      expect(adminActionLogService.record).toHaveBeenCalledWith(
        'admin-1',
        'user.status_updated',
        'user',
        'user-1',
        'status=deleted',
      );
    });

    it('never records an AdminActionLog row for a non-existent user (404)', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(
        service.updateUserStatus('missing-user', 'admin-1', { status: 'suspended', reasonCategory: 'other' }),
      ).rejects.toThrow(NotFoundException);
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });

    it('never records an AdminActionLog row when the user is already deleted (409)', async () => {
      const { prisma, tokenService, accountDeletionSweepService, adminActionLogService } = buildDeps();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ accountStatus: 'deleted' }));
      const service = new AdminUsersService(prisma, tokenService, accountDeletionSweepService, adminActionLogService, guardianNotices, makeSuspension(prisma, tokenService));

      await expect(service.updateUserStatus('user-1', 'admin-1', { status: 'active' })).rejects.toThrow(
        ConflictException,
      );
      expect(adminActionLogService.record).not.toHaveBeenCalled();
    });
  });
});

// B-291 (Decision Log #485): the user-page suspension needs a reason category, and goes through the shared path.
describe('AdminUsersService: suspension reason category and the shared path (B-291)', () => {
  function setup(status = 'active') {
    const deps = buildDeps();
    (deps.prisma.user.findUnique as jest.Mock).mockResolvedValue(user({ accountStatus: status }));
    (deps.prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue(user({ accountStatus: 'suspended' }));
    const suspension = makeSuspension(deps.prisma, deps.tokenService);
    const service = new AdminUsersService(
      deps.prisma,
      deps.tokenService,
      deps.accountDeletionSweepService,
      deps.adminActionLogService,
      guardianNotices,
      suspension,
    );
    return { ...deps, service, suspension };
  }

  it('a suspension without a category is a 400 with the stable code, before any database work', async () => {
    const { service, prisma, tokenService, adminActionLogService } = setup();

    const err = await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended' }).catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({
      statusCode: 400,
      code: 'suspension_reason_category_required',
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect(adminActionLogService.record).not.toHaveBeenCalled();
  });

  it.each(['active', 'deleted'] as const)('a category sent with status %s is a 400 with its own stable code', async (status) => {
    const { service, prisma, adminActionLogService } = setup();

    const err = await service.updateUserStatus('user-1', 'admin-1', { status, reasonCategory: 'other' }).catch((e) => e);

    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as BadRequestException).getResponse()).toMatchObject({ code: 'suspension_reason_category_not_applicable' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(adminActionLogService.record).not.toHaveBeenCalled();
  });

  it('records the category in the existing audit-log detail string', async () => {
    const { service, adminActionLogService } = setup();
    await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended', reasonCategory: 'threats_or_violence' });
    expect(adminActionLogService.record).toHaveBeenCalledWith(
      'admin-1',
      'user.status_updated',
      'user',
      'user-1',
      'status=suspended; reasonCategory=threats_or_violence',
    );
  });

  it('goes through the shared path: sessions, points, guardian notice and the email with the chosen category', async () => {
    const { service, tokenService, prisma } = setup();
    (guardianNotices as unknown as { notifyInBackground: jest.Mock }).notifyInBackground.mockClear();
    (emailStub as unknown as { sendAccountSuspendedEmail: jest.Mock }).sendAccountSuspendedEmail.mockClear();
    await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended', reasonCategory: 'spam_or_scam' });
    await new Promise((r) => setImmediate(r));
    expect((emailStub as unknown as { sendAccountSuspendedEmail: jest.Mock }).sendAccountSuspendedEmail).toHaveBeenCalledWith(
      'ada@example.com',
      'spam_or_scam',
    );
    expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith('user-1');
    expect(prisma.pointsLedgerEntry.updateMany).toHaveBeenCalled();
    expect((guardianNotices as unknown as { notifyInBackground: jest.Mock }).notifyInBackground).toHaveBeenCalledWith(
      'user-1',
      'account_suspended',
    );
  });

  it('an already-suspended account is not suspended, emailed or reported to its guardian again, but the admin action is logged', async () => {
    const { service, prisma, tokenService, adminActionLogService } = setup('suspended');
    (guardianNotices as unknown as { notifyInBackground: jest.Mock }).notifyInBackground.mockClear();
    (emailStub as unknown as { sendAccountSuspendedEmail: jest.Mock }).sendAccountSuspendedEmail.mockClear();

    await service.updateUserStatus('user-1', 'admin-1', { status: 'suspended', reasonCategory: 'other' });
    await new Promise((r) => setImmediate(r));

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(tokenService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    expect((guardianNotices as unknown as { notifyInBackground: jest.Mock }).notifyInBackground).not.toHaveBeenCalled();
    expect((emailStub as unknown as { sendAccountSuspendedEmail: jest.Mock }).sendAccountSuspendedEmail).not.toHaveBeenCalled();
    expect(adminActionLogService.record).toHaveBeenCalledTimes(1);
  });

  it('a manual reinstatement from suspended clears the stored report link', async () => {
    const { service, prisma } = setup('suspended');
    await service.updateUserStatus('user-1', 'admin-1', { status: 'active' });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { accountStatus: 'active', suspendedByReportId: null },
    });
  });
});
