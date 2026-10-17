import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminUserUsernameRevokeService } from './admin-user-username-revoke.service';

const DAY = 24 * 60 * 60 * 1000;
const REASON = 'Impersonates a club account, reported twice';

function build(user: unknown, opts: { updateCount?: number; emailFails?: boolean } = {}) {
  const tx = {
    user: {
      findUnique: jest.fn(async () => user),
      updateMany: jest.fn(async () => ({ count: opts.updateCount ?? 1 })),
    },
    revokedUsername: { upsert: jest.fn(async () => ({})) },
    adminActionLog: { create: jest.fn(async () => ({})) },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const email = {
    sendUsernameRevokedEmail: jest.fn(async () => {
      if (opts.emailFails) throw new Error('postmark down');
    }),
  };
  const service = new AdminUserUsernameRevokeService(prisma as never, email as never);
  return { service, tx, prisma, email };
}

const liveUser = { id: 'u-1', email: 'u@example.com', displayName: 'Ada Obi', username: 'chelsea_fc', accountStatus: 'active' };

describe('AdminUserUsernameRevokeService (B-033)', () => {
  it('clears the username and its change timestamp, which puts the account back in the incomplete-profile gate', async () => {
    const { service, tx } = build(liveUser);
    await service.revokeUsername('u-1', 'admin-1', { reason: REASON });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u-1', username: 'chelsea_fc' },
      data: { username: null, usernameChangedAt: null },
    });
  });

  it('records the 30-day hold (and so the permanent bar on this user) against the revoked handle', async () => {
    const { service, tx } = build(liveUser);
    const before = Date.now();
    const result = await service.revokeUsername('u-1', 'admin-1', { reason: REASON });
    const call = (tx.revokedUsername.upsert.mock.calls[0] as unknown as [{ where: unknown; create: { holdUntil: Date; username: string; userId: string } }])[0];
    expect(call.where).toEqual({ username_userId: { username: 'chelsea_fc', userId: 'u-1' } });
    expect(call.create.username).toBe('chelsea_fc');
    expect(call.create.userId).toBe('u-1');
    expect(call.create.holdUntil.getTime() - before).toBeGreaterThanOrEqual(30 * DAY);
    expect(call.create.holdUntil.getTime() - before).toBeLessThan(30 * DAY + 60_000);
    expect(result).toEqual({ userId: 'u-1', revokedUsername: 'chelsea_fc', heldUntil: call.create.holdUntil });
  });

  it('writes the audit row in the SAME transaction, with the admin, the target, the handle and the REASON', async () => {
    const { service, tx, prisma } = build(liveUser);
    await service.revokeUsername('u-1', 'admin-9', { reason: `  ${REASON}  ` });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const data = (tx.adminActionLog.create.mock.calls[0] as unknown as [{ data: Record<string, string> }])[0].data;
    expect(data).toMatchObject({ adminId: 'admin-9', action: 'user.username_revoked', targetType: 'user', targetId: 'u-1' });
    expect(data.notes).toContain('username=chelsea_fc');
    expect(data.notes).toContain(`reason=${REASON}`);
    expect(data.notes).toContain('held_until=');
  });

  it('emails the user after commit with the display name only (the reason is internal)', async () => {
    const { service, email } = build(liveUser);
    await service.revokeUsername('u-1', 'admin-1', { reason: REASON });
    expect(email.sendUsernameRevokedEmail).toHaveBeenCalledWith('u@example.com', 'Ada Obi');
    expect(JSON.stringify(email.sendUsernameRevokedEmail.mock.calls)).not.toContain('Impersonates');
  });

  it('a mail failure never undoes the revoke', async () => {
    const { service } = build(liveUser, { emailFails: true });
    await expect(service.revokeUsername('u-1', 'admin-1', { reason: REASON })).resolves.toMatchObject({
      revokedUsername: 'chelsea_fc',
    });
  });

  it('requires a real reason (trimmed length of at least 10)', async () => {
    const { service, prisma } = build(liveUser);
    await expect(service.revokeUsername('u-1', 'admin-1', { reason: '   short   ' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('404s for an unknown user and writes and sends nothing', async () => {
    const { service, tx, email } = build(null);
    await expect(service.revokeUsername('nope', 'admin-1', { reason: REASON })).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
    expect(email.sendUsernameRevokedEmail).not.toHaveBeenCalled();
  });

  it('409s for a user with no username', async () => {
    const { service, tx, email } = build({ ...liveUser, username: null });
    await expect(service.revokeUsername('u-1', 'admin-1', { reason: REASON })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
    expect(email.sendUsernameRevokedEmail).not.toHaveBeenCalled();
  });

  it('409s for an anonymized account, which has nobody to revoke from or tell', async () => {
    const { service, email } = build({ ...liveUser, accountStatus: 'deleted', username: null });
    await expect(service.revokeUsername('u-1', 'admin-1', { reason: REASON })).rejects.toBeInstanceOf(ConflictException);
    expect(email.sendUsernameRevokedEmail).not.toHaveBeenCalled();
  });

  it('a lost optimistic lock (two admins, or the user changed it) is a 409 with no hold, no audit row and no email', async () => {
    const { service, tx, email } = build(liveUser, { updateCount: 0 });
    await expect(service.revokeUsername('u-1', 'admin-1', { reason: REASON })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.revokedUsername.upsert).not.toHaveBeenCalled();
    expect(tx.adminActionLog.create).not.toHaveBeenCalled();
    expect(email.sendUsernameRevokedEmail).not.toHaveBeenCalled();
  });
});
