import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS } from '../admin-action-log/admin-action-log.constants';
import { HOLD_ERROR_CODES, HoldService } from './hold.service';

// backend/w6-hold-rule-extension (B-044). Mocked Prisma; the real constraints are proven in
// test/account-hold.e2e-spec.ts.

const NOW = new Date('2026-12-01T10:00:00.000Z');
const REASON = 'Evidence preserved for the regulator.';

type Mock = jest.Mock;

function buildPrisma() {
  const prisma = {
    report: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    post: { findUnique: jest.fn() },
    comment: { findUnique: jest.fn() },
    banterRoom: { findUnique: jest.fn() },
    grassrootsTeam: { findUnique: jest.fn() },
    fixture: { findUnique: jest.fn() },
    accountHold: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: `hold-${data.userId}`, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    adminActionLog: { create: jest.fn().mockResolvedValue({}) },
  };
  (prisma as unknown as { $transaction: Mock }).$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}
const asPrisma = (p: ReturnType<typeof buildPrisma>) => p as unknown as PrismaService;

describe('HoldService.placeBadFaith', () => {
  it('holds the REPORTER in full: bad_faith, expires placedAt + 6 months, audit row in the same transaction', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'pending_deletion' });

    const hold = await new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', REASON, NOW);

    expect(prisma.accountHold.create).toHaveBeenCalledWith({
      data: {
        userId: 'rep-1',
        type: 'bad_faith',
        reportId: 'r1',
        placedByAdminId: 'admin-1',
        placeReason: REASON,
        placedAt: NOW,
        expiresAt: new Date('2027-06-01T10:00:00.000Z'),
      },
    });
    expect(hold).toMatchObject({ userId: 'rep-1', type: 'bad_faith' });
    expect((prisma as unknown as { $transaction: Mock }).$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        adminId: 'admin-1',
        action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_BAD_FAITH_PLACED,
        targetType: 'user',
        targetId: 'rep-1',
      }),
    });
    expect(prisma.adminActionLog.create.mock.calls[0][0].data.notes).toContain(`reason=${REASON}`);
  });

  it('uses the configured number of months', async () => {
    const original = process.env.BAD_FAITH_HOLD_MONTHS;
    process.env.BAD_FAITH_HOLD_MONTHS = '12';
    try {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'active' });
      await new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', REASON, NOW);
      expect(prisma.accountHold.create.mock.calls[0][0].data.expiresAt).toEqual(new Date('2027-12-01T10:00:00.000Z'));
    } finally {
      if (original === undefined) delete process.env.BAD_FAITH_HOLD_MONTHS;
      else process.env.BAD_FAITH_HOLD_MONTHS = original;
    }
  });

  it('refuses (coded) when the report has no reporter account -- an unauthenticated public report', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: null, targetType: 'post', targetId: 'p1' });

    await expect(new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.REPORTER_HAS_NO_ACCOUNT }),
    });
    expect(prisma.accountHold.create).not.toHaveBeenCalled();
    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });

  it("refuses (coded) when the reporter's account is already anonymised ('deleted')", async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'deleted' });

    const promise = new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', REASON, NOW);
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({ response: expect.objectContaining({ code: HOLD_ERROR_CODES.ACCOUNT_ALREADY_DELETED }) });
    expect(prisma.accountHold.create).not.toHaveBeenCalled();
  });

  it('refuses (coded) a second active bad-faith hold for the same reporter and report', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'active' });
    prisma.accountHold.findFirst.mockResolvedValue({ id: 'existing' });

    await expect(new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.HOLD_ALREADY_ACTIVE }),
    });
    expect(prisma.accountHold.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'rep-1', reportId: 'r1', type: 'bad_faith', liftedAt: null, expiresAt: { gt: NOW } },
      }),
    );
  });

  it('404 for an unknown report', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue(null);
    await expect(new HoldService(asPrisma(prisma)).placeBadFaith('nope', 'admin-1', REASON, NOW)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([[''], ['short'], ['   too short  '], ['x'.repeat(501)]])('rejects a reason outside 10 to 500 characters (%p) before touching anything', async (reason) => {
    const prisma = buildPrisma();
    await expect(new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', reason, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.report.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a reason of exactly 10 and exactly 500 characters, trimmed', async () => {
    for (const reason of ['a'.repeat(10), `  ${'b'.repeat(500)}  `]) {
      const prisma = buildPrisma();
      prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1' });
      prisma.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'active' });
      await new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', reason, NOW);
      expect(prisma.accountHold.create.mock.calls[0][0].data.placeReason).toBe(reason.trim());
    }
  });
});

describe('HoldService.placeLegalHold', () => {
  it('holds BOTH parties that have an account: one row each, no expiry, one audit row each', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'post', targetId: 'p1' });
    prisma.post.findUnique.mockResolvedValue({ authorId: 'author-1' });
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, accountStatus: 'active' }));

    const holds = await new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', REASON, NOW);

    expect(holds.map((h) => h.userId).sort()).toEqual(['author-1', 'rep-1']);
    for (const call of prisma.accountHold.create.mock.calls) {
      expect(call[0].data).toMatchObject({ type: 'legal_hold', reportId: 'r1', placedByAdminId: 'admin-1', expiresAt: null, placedAt: NOW });
    }
    expect(prisma.adminActionLog.create).toHaveBeenCalledTimes(2);
    expect(prisma.adminActionLog.create.mock.calls[0][0].data.action).toBe(ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LEGAL_PLACED);
  });

  it('holds only the reported user when the report has no reporter account', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: null, targetType: 'user', targetId: 'u9' });
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, accountStatus: 'active' }));

    const holds = await new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', REASON, NOW);
    expect(holds.map((h) => h.userId)).toEqual(['u9']);
  });

  it('a party who is both reporter and reported is held once', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'u1', targetType: 'user', targetId: 'u1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', accountStatus: 'active' });

    const holds = await new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', REASON, NOW);
    expect(holds).toHaveLength(1);
  });

  it('skips an anonymised party, holding the rest', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'gone', targetType: 'user', targetId: 'u2' });
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
      id: where.id,
      accountStatus: where.id === 'gone' ? 'deleted' : 'active',
    }));
    const holds = await new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', REASON, NOW);
    expect(holds.map((h) => h.userId)).toEqual(['u2']);
  });

  it('refuses (coded) when there is nobody to hold, and when every party is already held', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: null, targetType: 'post', targetId: 'gone-post' });
    prisma.post.findUnique.mockResolvedValue(null);
    await expect(new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.NO_PARTY_TO_HOLD }),
    });

    const again = buildPrisma();
    again.report.findUnique.mockResolvedValue({ id: 'r1', reporterId: 'rep-1', targetType: 'user', targetId: 'rep-1' });
    again.user.findUnique.mockResolvedValue({ id: 'rep-1', accountStatus: 'active' });
    again.accountHold.findFirst.mockResolvedValue({ id: 'already' });
    await expect(new HoldService(asPrisma(again)).placeLegalHold('r1', 'admin-1', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.HOLD_ALREADY_ACTIVE }),
    });
  });

  it('requires a reason and notifies nobody (there is no notification dependency at all)', async () => {
    const prisma = buildPrisma();
    await expect(new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', 'short', NOW)).rejects.toBeInstanceOf(BadRequestException);
    // the only collaborator is PrismaService, and no notification table is written
    expect(Object.keys(prisma)).not.toContain('notification');
  });
});

describe('HoldService.liftHold', () => {
  const active = { id: 'h1', userId: 'u1', type: 'legal_hold', reportId: 'r1', expiresAt: null, liftedAt: null };

  it('lifts a legal hold: sets liftedAt / liftedByAdminId / liftReason and writes the audit row', async () => {
    const prisma = buildPrisma();
    prisma.accountHold.findUnique.mockResolvedValue(active);

    const lifted = await new HoldService(asPrisma(prisma)).liftHold('h1', 'admin-2', REASON, NOW);

    expect(prisma.accountHold.updateMany).toHaveBeenCalledWith({
      where: { id: 'h1', liftedAt: null },
      data: { liftedAt: NOW, liftedByAdminId: 'admin-2', liftReason: REASON },
    });
    expect(lifted).toMatchObject({ id: 'h1', liftedAt: NOW, liftedByAdminId: 'admin-2', liftReason: REASON });
    expect(prisma.adminActionLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ adminId: 'admin-2', action: ADMIN_ACTION_LOG_ACTIONS.ACCOUNT_HOLD_LIFTED, targetType: 'user', targetId: 'u1' }),
    });
    expect(prisma.adminActionLog.create.mock.calls[0][0].data.notes).toContain('type=legal_hold');
  });

  it('lifts a BAD-FAITH hold too (both types), while it is still running', async () => {
    const prisma = buildPrisma();
    prisma.accountHold.findUnique.mockResolvedValue({ ...active, id: 'h2', type: 'bad_faith', expiresAt: new Date('2027-06-01T10:00:00.000Z') });

    const lifted = await new HoldService(asPrisma(prisma)).liftHold('h2', 'admin-2', REASON, NOW);
    expect(lifted).toMatchObject({ id: 'h2', type: 'bad_faith', liftedAt: NOW });
  });

  it('requires a reason of 10 to 500 characters', async () => {
    const prisma = buildPrisma();
    await expect(new HoldService(asPrisma(prisma)).liftHold('h1', 'admin-2', 'nope', NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.accountHold.findUnique).not.toHaveBeenCalled();
  });

  it('404 for an unknown hold; coded 409 for one already lifted or already expired', async () => {
    const prisma = buildPrisma();
    prisma.accountHold.findUnique.mockResolvedValueOnce(null);
    await expect(new HoldService(asPrisma(prisma)).liftHold('x', 'admin-2', REASON, NOW)).rejects.toBeInstanceOf(NotFoundException);

    prisma.accountHold.findUnique.mockResolvedValueOnce({ ...active, liftedAt: new Date('2026-11-01T00:00:00.000Z') });
    await expect(new HoldService(asPrisma(prisma)).liftHold('h1', 'admin-2', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.HOLD_ALREADY_LIFTED }),
    });

    // expiry boundary: expiresAt == now is already over
    prisma.accountHold.findUnique.mockResolvedValueOnce({ ...active, type: 'bad_faith', expiresAt: NOW });
    await expect(new HoldService(asPrisma(prisma)).liftHold('h1', 'admin-2', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.HOLD_EXPIRED }),
    });
    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('a race (another admin lifted it between the read and the write) is the same coded 409, with no audit row', async () => {
    const prisma = buildPrisma();
    prisma.accountHold.findUnique.mockResolvedValue(active);
    prisma.accountHold.updateMany.mockResolvedValue({ count: 0 });

    await expect(new HoldService(asPrisma(prisma)).liftHold('h1', 'admin-2', REASON, NOW)).rejects.toMatchObject({
      response: expect.objectContaining({ code: HOLD_ERROR_CODES.HOLD_ALREADY_LIFTED }),
    });
    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });
});

// backend/w7-contact-enquiry-admin-escalate (B-046 part B): a report made from a Contact Us enquiry has no
// reported user and no reporter account, so neither place route may create a hold for it.
describe('HoldService - enquiry reports (hold_not_applicable)', () => {
  const enquiryReport = { id: 'r1', reporterId: null, targetType: 'enquiry', targetId: 'e1' };

  it('refuses a bad-faith hold with the coded 409 and writes nothing', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue(enquiryReport);
    await expect(new HoldService(asPrisma(prisma)).placeBadFaith('r1', 'admin-1', REASON, NOW)).rejects.toMatchObject({
      response: { code: HOLD_ERROR_CODES.HOLD_NOT_APPLICABLE },
    });
    expect(prisma.accountHold.create).not.toHaveBeenCalled();
    expect(prisma.adminActionLog.create).not.toHaveBeenCalled();
  });

  it('refuses a legal hold with the coded 409 and writes nothing - even if a (never expected) reporterId were set', async () => {
    const prisma = buildPrisma();
    prisma.report.findUnique.mockResolvedValue({ ...enquiryReport, reporterId: 'rep-1' });
    prisma.user.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({ id: where.id, accountStatus: 'active' }));
    await expect(new HoldService(asPrisma(prisma)).placeLegalHold('r1', 'admin-1', REASON, NOW)).rejects.toMatchObject({
      response: { code: HOLD_ERROR_CODES.HOLD_NOT_APPLICABLE },
    });
    expect(prisma.accountHold.create).not.toHaveBeenCalled();
  });
});
