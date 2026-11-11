import { AdminUserUsernameRevokeService } from './admin-user-username-revoke.service';
import { AccountSuspensionService } from '../account-suspension/account-suspension.service';
import { AdminUsersService } from './admin-users.service';

// backend/b279-guardian-safety-notices (B-279; Decision Log #456 A): the admin-users hooks. When Soccernity
// suspends, reinstates or removes an account, or removes a username, the guardian of a MINOR is told the kind of
// action. The notice service decides whether the user is a minor with a confirmed guardian; these specs check
// WHEN admin-users asks it, with which event, and that nothing is asked when the action did not happen.

const LISTED = { id: 'u-1', displayName: 'Sam', username: null, email: 's@example.com', accountStatus: 'active', createdAt: new Date() };

function buildUsers(current: { isMinor: boolean; accountStatus: string }) {
  const order: string[] = [];
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'u-1', ...current }),
      update: jest.fn().mockResolvedValue(LISTED),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(LISTED),
    },
    accountHold: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
    // A suspension revokes the account's baseline points (backend/w12-points).
    pointsLedgerEntry: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const tokenService = { revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined) };
  const sweep = {
    anonymizeUser: jest.fn().mockImplementation(async () => {
      order.push('anonymize');
    }),
  };
  const log = { record: jest.fn().mockResolvedValue(undefined) };
  const notices = {
    prepare: jest.fn().mockImplementation(async () => {
      order.push('prepare');
      return { to: 'parent@example.com', displayName: 'Sam' };
    }),
    notifyInBackground: jest.fn(),
  };
  (prisma as unknown as { $transaction: jest.Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  const email = { sendAccountSuspendedEmail: jest.fn().mockResolvedValue(undefined), sendAccountReinstatedEmail: jest.fn().mockResolvedValue(undefined) };
  const suspension = new AccountSuspensionService(prisma as never, tokenService as never, notices as never, email as never);
  const service = new AdminUsersService(prisma as never, tokenService as never, sweep as never, log as never, notices as never, suspension);
  return { service, prisma, sweep, notices, order };
}

describe('AdminUsersService: guardian notices (B-279)', () => {
  it('suspending a user asks for an account_suspended notice, once', async () => {
    const { service, notices } = buildUsers({ isMinor: true, accountStatus: 'active' });
    await service.updateUserStatus('u-1', 'admin-1', { status: 'suspended', reasonCategory: 'other' });
    expect(notices.notifyInBackground).toHaveBeenCalledTimes(1);
    expect(notices.notifyInBackground).toHaveBeenCalledWith('u-1', 'account_suspended');
  });

  it('lifting a SUSPENSION asks for an account_reinstated notice', async () => {
    const { service, notices } = buildUsers({ isMinor: true, accountStatus: 'suspended' });
    await service.updateUserStatus('u-1', 'admin-1', { status: 'active' });
    expect(notices.notifyInBackground).toHaveBeenCalledTimes(1);
    expect(notices.notifyInBackground).toHaveBeenCalledWith('u-1', 'account_reinstated');
  });

  it.each(['deactivated', 'pending_deletion', 'active'])(
    'moving a %s user to active is not a safety action: no notice',
    async (from) => {
      const { service, notices } = buildUsers({ isMinor: true, accountStatus: from });
      await service.updateUserStatus('u-1', 'admin-1', { status: 'active' });
      expect(notices.notifyInBackground).not.toHaveBeenCalled();
    },
  );

  it('removing an account reads the recipient BEFORE the anonymisation deletes the Guardian row, and sends with it', async () => {
    const { service, notices, order } = buildUsers({ isMinor: true, accountStatus: 'active' });

    await expect(service.updateUserStatus('u-1', 'admin-1', { status: 'deleted' })).resolves.toEqual({
      deleted: true,
      id: 'u-1',
    });

    expect(order).toEqual(['prepare', 'anonymize']);
    expect(notices.notifyInBackground).toHaveBeenCalledTimes(1);
    expect(notices.notifyInBackground).toHaveBeenCalledWith('u-1', 'account_removed', {
      to: 'parent@example.com',
      displayName: 'Sam',
    });
  });

  it('removing an account with no one to tell (prepare gives null) sends nothing', async () => {
    const { service, notices } = buildUsers({ isMinor: false, accountStatus: 'active' });
    notices.prepare.mockResolvedValue(null);
    await service.updateUserStatus('u-1', 'admin-1', { status: 'deleted' });
    expect(notices.notifyInBackground).not.toHaveBeenCalled();
  });

  it('a refused action sends nothing: an already-deleted user (409) and an unknown user (404)', async () => {
    const { service, notices, prisma } = buildUsers({ isMinor: true, accountStatus: 'deleted' });
    await expect(service.updateUserStatus('u-1', 'admin-1', { status: 'suspended', reasonCategory: 'other' })).rejects.toThrow();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.updateUserStatus('u-1', 'admin-1', { status: 'suspended', reasonCategory: 'other' })).rejects.toThrow();
    expect(notices.notifyInBackground).not.toHaveBeenCalled();
    expect(notices.prepare).not.toHaveBeenCalled();
  });

  it('a failed removal (the anonymisation throws) sends nothing', async () => {
    const { service, notices, sweep } = buildUsers({ isMinor: true, accountStatus: 'active' });
    sweep.anonymizeUser.mockRejectedValue(new Error('db down'));
    await expect(service.updateUserStatus('u-1', 'admin-1', { status: 'deleted' })).rejects.toThrow('db down');
    expect(notices.notifyInBackground).not.toHaveBeenCalled();
  });
});

describe('AdminUserUsernameRevokeService: guardian notice (B-279)', () => {
  function buildRevoke(user: unknown) {
    const tx = {
      user: { findUnique: jest.fn(async () => user), updateMany: jest.fn(async () => ({ count: 1 })) },
      revokedUsername: { upsert: jest.fn(async () => ({})) },
      adminActionLog: { create: jest.fn(async () => ({})) },
    };
    const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    const email = { sendUsernameRevokedEmail: jest.fn(async () => undefined) };
    const notices = { notifyInBackground: jest.fn() };
    const service = new AdminUserUsernameRevokeService(prisma as never, email as never, notices as never);
    return { service, notices };
  }

  const live = { id: 'u-1', email: 'u@example.com', displayName: 'Sam', username: 'chelsea_fc', accountStatus: 'active' };

  it('asks for a username_removed notice once, after the revoke commits, and never passes the reason', async () => {
    const { service, notices } = buildRevoke(live);

    await service.revokeUsername('u-1', 'admin-1', { reason: 'Impersonates a club account' });

    expect(notices.notifyInBackground).toHaveBeenCalledTimes(1);
    expect(notices.notifyInBackground).toHaveBeenCalledWith('u-1', 'username_removed');
  });

  it('sends nothing when the revoke is refused (no username, deleted account, unknown user)', async () => {
    for (const user of [{ ...live, username: null }, { ...live, accountStatus: 'deleted' }, null]) {
      const { service, notices } = buildRevoke(user);
      await expect(service.revokeUsername('u-1', 'admin-1', { reason: 'Impersonates a club account' })).rejects.toThrow();
      expect(notices.notifyInBackground).not.toHaveBeenCalled();
    }
  });
});
