import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminUsernameReviewsService } from './admin-username-reviews.service';
import { encodeUsernameReviewCursor } from './cursor.util';
import {
  USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE,
  USERNAME_REVIEW_NOT_FOUND_CODE,
  USERNAME_REVIEW_NOT_PENDING_CODE,
  USERNAME_REVIEW_NOTIFICATION_TYPE,
  USERNAME_REVIEW_OWN_REVOCATION_CODE,
  USERNAME_REVIEW_REASON_INVALID_CODE,
  USERNAME_REVIEW_USER_HAS_USERNAME_CODE,
  USERNAME_REVIEW_USER_UNAVAILABLE_CODE,
} from './username-review.constants';

const REASON = 'Reviewed the account history; the handle was not offensive.';

interface DecideRow {
  id: string;
  status: string;
  userId: string;
  revokedUsernameId: string;
  handle: string;
  revokerId: string | null;
  isMinor: boolean;
  accountStatus: string;
}
const row = (over: Partial<DecideRow> = {}): DecideRow => ({
  id: 'req-1',
  status: 'pending',
  userId: 'user-1',
  revokedUsernameId: 'rv-1',
  handle: 'chelsea_fc',
  revokerId: 'admin-revoker',
  isMinor: false,
  accountStatus: 'active',
  ...over,
});

interface Opts {
  vetted?: boolean;
  decideRow?: DecideRow | null;
  claimCount?: number;
  heldByAnother?: boolean;
  restoreCount?: number;
  auditFails?: boolean;
  restoreError?: unknown;
  notificationFails?: boolean;
}

function build(opts: Opts = {}) {
  const tx = {
    usernameReviewRequest: { updateMany: jest.fn(async () => ({ count: opts.claimCount ?? 1 })) },
    revokedUsername: {
      findFirst: jest.fn(async () => (opts.heldByAnother ? { id: 'other' } : null)),
      delete: jest.fn(async () => ({})),
    },
    user: {
      updateMany: jest.fn(async () => {
        if (opts.restoreError) throw opts.restoreError;
        return { count: opts.restoreCount ?? 1 };
      }),
    },
    adminActionLog: {
      create: jest.fn(async () => {
        if (opts.auditFails) throw new Error('audit write failed');
        return {};
      }),
    },
  };
  const prisma = {
    adminUser: { findUnique: jest.fn(async () => ({ childSafetyVetted: opts.vetted ?? false })) },
    // Either shape: the decide row, or (in the list tests) rows replaced with mockResolvedValueOnce.
    $queryRaw: jest.fn(async (..._args: unknown[]): Promise<unknown[]> =>
      opts.decideRow === undefined ? [row()] : opts.decideRow === null ? [] : [opts.decideRow],
    ),
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    notification: {
      create: jest.fn(async () => {
        if (opts.notificationFails) throw new Error('notification down');
        return { id: 'n-1' };
      }),
    },
  };
  const notices = { notifyInBackground: jest.fn() };
  const service = new AdminUsernameReviewsService(prisma as never, notices as never);
  return { service, prisma, tx, notices };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as { getResponse: () => { code?: string } }).getResponse().code;
  }
  return undefined;
};
const sqlOf = (prisma: { $queryRaw: jest.Mock }) => {
  const arg = prisma.$queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
  return { sql: arg.sql, values: arg.values };
};

describe('AdminUsernameReviewsService.list (B-139 part (c))', () => {
  const listRow = (over: Record<string, unknown> = {}) => ({
    id: 'req-1',
    status: 'pending',
    createdAt: new Date('2026-11-03T12:00:00.000Z'),
    message: 'Please look again',
    removedUsername: 'chelsea_fc',
    revokedAt: new Date('2026-11-01T09:00:00.000Z'),
    userId: 'user-1',
    userDisplayName: 'Ada Obi',
    revokedByName: 'Moderator Mo',
    ...over,
  });

  it('maps the rows: display name, handle, revoker by name, dates, status, message; nothing else', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValueOnce([listRow()]);
    const page = await service.list({}, { sub: 'admin-1' });
    expect(page.items).toEqual([
      {
        id: 'req-1',
        status: 'pending',
        createdAt: new Date('2026-11-03T12:00:00.000Z'),
        message: 'Please look again',
        removedUsername: 'chelsea_fc',
        revokedAt: new Date('2026-11-01T09:00:00.000Z'),
        userId: 'user-1',
        userDisplayName: 'Ada Obi',
        revokedBy: { displayName: 'Moderator Mo' },
      },
    ]);
    expect(page.nextCursor).toBeNull();
  });

  it('an unknown revoker reads as null', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValueOnce([listRow({ revokedByName: null })]);
    expect((await service.list({}, { sub: 'admin-1' })).items[0].revokedBy).toBeNull();
  });

  it('NEVER selects a date of birth, an email, a phone number or a password', async () => {
    const { service, prisma } = build();
    await service.list({}, { sub: 'admin-1' });
    const { sql } = sqlOf(prisma);
    expect(sql).not.toMatch(/dateOfBirth|"email"|phone|passwordHash|guardian/i);
  });

  it('excludes anonymised accounts and the CALLER as revoker (IS DISTINCT FROM, so an unknown revoker stays visible)', async () => {
    const { service, prisma } = build();
    await service.list({}, { sub: 'admin-7' });
    const { sql, values } = sqlOf(prisma);
    expect(sql).toContain(`u."accountStatus" <> 'deleted'`);
    expect(sql).toContain('rev."id" IS DISTINCT FROM');
    expect(values).toContain('admin-7');
  });

  it('an UNVETTED admin only sees accounts that are not minors; a VETTED one sees them too', async () => {
    const unvetted = build({ vetted: false });
    await unvetted.service.list({}, { sub: 'admin-1' });
    expect(sqlOf(unvetted.prisma).sql).toContain('u."isMinor" = false');

    const vetted = build({ vetted: true });
    await vetted.service.list({}, { sub: 'admin-1' });
    expect(sqlOf(vetted.prisma).sql).not.toContain('isMinor');
    // the vetting state is read fresh, from the admin's own id
    expect(vetted.prisma.adminUser.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { childSafetyVetted: true } });
  });

  it('filters by status, and by the keyset cursor (newest first)', async () => {
    const { service, prisma } = build();
    const cursor = encodeUsernameReviewCursor({ createdAt: new Date('2026-11-02T00:00:00.000Z'), id: 'req-9' });
    await service.list({ status: 'declined', cursor }, { sub: 'admin-1' });
    const { sql, values } = sqlOf(prisma);
    expect(sql).toContain('r."status" =');
    expect(values).toContain('declined');
    expect(sql).toContain('(r."createdAt", r."id") <');
    expect(sql).toContain('ORDER BY r."createdAt" DESC, r."id" DESC');
    expect(values).toContain('req-9');
  });

  it('pages: asks for one extra row, returns a cursor only when there is one more', async () => {
    const { service, prisma } = build();
    prisma.$queryRaw.mockResolvedValueOnce([listRow({ id: 'a' }), listRow({ id: 'b' }), listRow({ id: 'c' })]);
    const page = await service.list({ limit: 2 }, { sub: 'admin-1' });
    expect(sqlOf(prisma).values).toContain(3); // limit + 1
    expect(page.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(page.nextCursor).toEqual(expect.any(String));

    const exact = build();
    exact.prisma.$queryRaw.mockResolvedValueOnce([listRow({ id: 'a' }), listRow({ id: 'b' })]);
    expect((await exact.service.list({ limit: 2 }, { sub: 'admin-1' })).nextCursor).toBeNull();
  });

  it('defaults to the admin list page size and clamps to the maximum', async () => {
    const { service, prisma } = build();
    await service.list({}, { sub: 'admin-1' });
    expect(sqlOf(prisma).values).toContain(21);
    const big = build();
    await big.service.list({ limit: 9999 }, { sub: 'admin-1' });
    expect(sqlOf(big.prisma).values).toContain(51);
  });

  it('a malformed cursor is a coded 400 and nothing is queried', async () => {
    const { service, prisma } = build();
    await expect(service.list({ cursor: 'not-a-cursor' }, { sub: 'admin-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('AdminUsernameReviewsService.decide (B-139 part (c))', () => {
  const admin = { sub: 'admin-2' };

  describe('the reason (both outcomes, internal)', () => {
    it.each([
      ['empty', ''],
      ['spaces only', '          '],
      ['9 characters after trimming', '  123456789  '],
      ['501 characters', 'x'.repeat(501)],
    ])('%s is a coded 400 and nothing is read', async (_label, reason) => {
      const { service, prisma } = build();
      const p = service.decide('req-1', { decision: 'decline', reason }, admin);
      await expect(p).rejects.toBeInstanceOf(BadRequestException);
      expect(await codeOf(service.decide('req-1', { decision: 'decline', reason }, admin))).toBe(USERNAME_REVIEW_REASON_INVALID_CODE);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('exactly 10 and exactly 500 characters are accepted (trimmed)', async () => {
      for (const reason of ['1234567890', `  ${'x'.repeat(500)}  `]) {
        const { service } = build();
        await expect(service.decide('req-1', { decision: 'decline', reason }, admin)).resolves.toMatchObject({ status: 'declined' });
      }
    });
  });

  describe('who may decide', () => {
    it('a missing request is a coded 404', async () => {
      const { service } = build({ decideRow: null });
      await expect(service.decide('nope', { decision: 'decline', reason: REASON }, admin)).rejects.toBeInstanceOf(NotFoundException);
      expect(await codeOf(service.decide('nope', { decision: 'decline', reason: REASON }, admin))).toBe(USERNAME_REVIEW_NOT_FOUND_CODE);
    });

    it('a MINOR\'s request is the SAME 404 for an unvetted admin (byte-identical body), and nothing is written', async () => {
      const missing = build({ decideRow: null });
      const minor = build({ decideRow: row({ isMinor: true }), vetted: false });
      const a = await missing.service.decide('x', { decision: 'decline', reason: REASON }, admin).catch((e) => e.getResponse());
      const b = await minor.service.decide('x', { decision: 'decline', reason: REASON }, admin).catch((e) => e.getResponse());
      expect(b).toEqual(a);
      expect(minor.prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a MINOR\'s request can be decided by a vetted admin', async () => {
      const { service } = build({ decideRow: row({ isMinor: true }), vetted: true });
      await expect(service.decide('req-1', { decision: 'decline', reason: REASON }, admin)).resolves.toMatchObject({ status: 'declined' });
    });

    it('the revoking admin gets a coded 403, even when vetted, and nothing is written', async () => {
      const { service, prisma } = build({ vetted: true });
      const p = service.decide('req-1', { decision: 'reinstate', reason: REASON }, { sub: 'admin-revoker' });
      await expect(p).rejects.toBeInstanceOf(ForbiddenException);
      expect(await codeOf(service.decide('req-1', { decision: 'reinstate', reason: REASON }, { sub: 'admin-revoker' }))).toBe(
        USERNAME_REVIEW_OWN_REVOCATION_CODE,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('an unknown revoker (null) excludes nobody', async () => {
      const { service } = build({ decideRow: row({ revokerId: null }) });
      await expect(service.decide('req-1', { decision: 'decline', reason: REASON }, admin)).resolves.toMatchObject({ status: 'declined' });
    });

    it('the 404 for a hidden minor wins over the 403 for the revoker (nothing about a hidden request is revealed)', async () => {
      const { service } = build({ decideRow: row({ isMinor: true }), vetted: false });
      expect(await codeOf(service.decide('req-1', { decision: 'decline', reason: REASON }, { sub: 'admin-revoker' }))).toBe(
        USERNAME_REVIEW_NOT_FOUND_CODE,
      );
    });
  });

  describe('state checks before the transaction', () => {
    it.each(['reinstated', 'declined'])('a request already %s is a coded 409 (a decision is final)', async (status) => {
      const { service, prisma } = build({ decideRow: row({ status }) });
      const p = service.decide('req-1', { decision: 'decline', reason: REASON }, admin);
      await expect(p).rejects.toBeInstanceOf(ConflictException);
      expect(await codeOf(service.decide('req-1', { decision: 'decline', reason: REASON }, admin))).toBe(USERNAME_REVIEW_NOT_PENDING_CODE);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('an anonymised account is a coded 409', async () => {
      const { service } = build({ decideRow: row({ accountStatus: 'deleted' }) });
      expect(await codeOf(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin))).toBe(USERNAME_REVIEW_USER_UNAVAILABLE_CODE);
    });
  });

  describe('reinstate', () => {
    it('restores the username and deletes the record, in ONE transaction, writing ONE audit row first', async () => {
      const { service, prisma, tx } = build();
      const order: string[] = [];
      tx.usernameReviewRequest.updateMany.mockImplementationOnce(async () => (order.push('claim'), { count: 1 }));
      tx.user.updateMany.mockImplementationOnce(async () => (order.push('restore'), { count: 1 }));
      tx.adminActionLog.create.mockImplementationOnce(async () => (order.push('audit'), {}));
      tx.revokedUsername.delete.mockImplementationOnce(async () => (order.push('delete-record'), {}));

      const result = await service.decide('req-1', { decision: 'reinstate', reason: `  ${REASON}  ` }, admin);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(order).toEqual(['claim', 'restore', 'audit', 'delete-record']);
      expect(result).toMatchObject({ id: 'req-1', status: 'reinstated', decidedAt: expect.any(Date) });
      // claims only a PENDING request, recording who and when
      expect(tx.usernameReviewRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-1', status: 'pending' },
        data: { status: 'reinstated', decidedAt: expect.any(Date), decidedByAdminId: 'admin-2' },
      });
      // the username comes back only if the user still has none; usernameChangedAt is NOT in the write
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', username: null, accountStatus: { not: 'deleted' } },
        data: { username: 'chelsea_fc' },
      });
      expect(tx.revokedUsername.delete).toHaveBeenCalledWith({ where: { id: 'rv-1' } });
      expect(tx.adminActionLog.create).toHaveBeenCalledTimes(1);
    });

    it('the audit row names the admin, the target user, the decision, the handle and the REASON (trimmed)', async () => {
      const { service, tx } = build();
      await service.decide('req-1', { decision: 'reinstate', reason: `  ${REASON}  ` }, admin);
      expect(tx.adminActionLog.create).toHaveBeenCalledWith({
        data: {
          adminId: 'admin-2',
          action: 'user.username_review_decided',
          targetType: 'user',
          targetId: 'user-1',
          notes: `decision=reinstate; username=chelsea_fc; reason=${REASON}`,
        },
      });
    });

    it('a handle under ANOTHER user\'s running hold is a coded 409 and nothing is restored', async () => {
      const { service, tx } = build({ heldByAnother: true });
      expect(await codeOf(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin))).toBe(USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE);
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.revokedUsername.delete).not.toHaveBeenCalled();
      expect(tx.revokedUsername.findFirst).toHaveBeenCalledWith({
        where: { username: 'chelsea_fc', userId: { not: 'user-1' }, holdUntil: { gt: expect.any(Date) } },
        select: { id: true },
      });
    });

    it('a user who has chosen a new username since is a coded 409 and the audit row, notification and notice are skipped', async () => {
      const { service, tx, prisma, notices } = build({ restoreCount: 0 });
      expect(await codeOf(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin))).toBe(USERNAME_REVIEW_USER_HAS_USERNAME_CODE);
      expect(tx.adminActionLog.create).not.toHaveBeenCalled();
      expect(tx.revokedUsername.delete).not.toHaveBeenCalled();
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(notices.notifyInBackground).not.toHaveBeenCalled();
    });

    it('a handle somebody else took (unique violation) is the coded 409 handle-unavailable', async () => {
      const dup = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
      const { service, notices } = build({ restoreError: dup });
      expect(await codeOf(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin))).toBe(USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE);
      expect(notices.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('decline', () => {
    it('leaves the record and the user untouched: only the request is claimed and the audit row written', async () => {
      const { service, tx } = build();
      const result = await service.decide('req-1', { decision: 'decline', reason: REASON }, admin);
      expect(result.status).toBe('declined');
      expect(tx.usernameReviewRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'req-1', status: 'pending' },
        data: { status: 'declined', decidedAt: expect.any(Date), decidedByAdminId: 'admin-2' },
      });
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.revokedUsername.delete).not.toHaveBeenCalled();
      expect(tx.revokedUsername.findFirst).not.toHaveBeenCalled();
      expect((tx.adminActionLog.create.mock.calls[0] as unknown as [{ data: { notes: string } }])[0].data.notes).toBe(
        `decision=decline; username=chelsea_fc; reason=${REASON}`,
      );
    });
  });

  describe('atomicity and races', () => {
    it('losing the race (another admin decided first) is a coded 409 and nothing else is written', async () => {
      const { service, tx } = build({ claimCount: 0 });
      expect(await codeOf(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin))).toBe(USERNAME_REVIEW_NOT_PENDING_CODE);
      expect(tx.user.updateMany).not.toHaveBeenCalled();
      expect(tx.adminActionLog.create).not.toHaveBeenCalled();
    });

    it('a failing audit write fails the whole decision: it throws, and no notification or guardian notice follows', async () => {
      const { service, prisma, notices } = build({ auditFails: true });
      await expect(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin)).rejects.toThrow('audit write failed');
      expect(prisma.notification.create).not.toHaveBeenCalled();
      expect(notices.notifyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('after the commit (best effort, never undoes the decision)', () => {
    it('reinstated: an in-app notification (outcome only) and the guardian notice username_restored', async () => {
      const { service, prisma, notices } = build();
      await service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', type: USERNAME_REVIEW_NOTIFICATION_TYPE, payloadRefId: 'reinstated' },
        select: { id: true },
      });
      expect(notices.notifyInBackground).toHaveBeenCalledWith('user-1', 'username_restored');
    });

    it('declined: the notification says declined and the guardian notice is username_review_declined', async () => {
      const { service, prisma, notices } = build();
      await service.decide('req-1', { decision: 'decline', reason: REASON }, admin);
      expect(prisma.notification.create.mock.calls[0]).toEqual([
        { data: { userId: 'user-1', type: USERNAME_REVIEW_NOTIFICATION_TYPE, payloadRefId: 'declined' }, select: { id: true } },
      ]);
      expect(notices.notifyInBackground).toHaveBeenCalledWith('user-1', 'username_review_declined');
    });

    it('the REASON reaches neither the notification nor the guardian notice', async () => {
      const { service, prisma, notices } = build();
      await service.decide('req-1', { decision: 'decline', reason: REASON }, admin);
      expect(JSON.stringify(prisma.notification.create.mock.calls)).not.toContain('Reviewed the account');
      expect(JSON.stringify(notices.notifyInBackground.mock.calls)).not.toContain('Reviewed the account');
    });

    it('a failing notification never fails the decision, and the guardian notice is still attempted', async () => {
      const { service, notices } = build({ notificationFails: true });
      await expect(service.decide('req-1', { decision: 'reinstate', reason: REASON }, admin)).resolves.toMatchObject({ status: 'reinstated' });
      expect(notices.notifyInBackground).toHaveBeenCalledWith('user-1', 'username_restored');
    });
  });
});
