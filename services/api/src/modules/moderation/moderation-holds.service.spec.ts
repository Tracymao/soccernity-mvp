import { PrismaService } from '../../prisma/prisma.service';
import { HoldService } from '../account-hold/hold.service';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from './moderation.constants';
import { ModerationService } from './moderation.service';
import { ModerationHoldsService, toHoldView } from './moderation-holds.service';

// backend/w6-hold-admin-endpoints (B-045). The access shape is covered at the HTTP layer
// (admin-moderation-holds.controller.http.spec.ts); this covers the read used by the Report detail response.

const NOW = new Date('2030-06-01T00:00:00.000Z');

describe('ModerationHoldsService.listActiveHoldsForReport', () => {
  it('asks only for holds on this report that are not lifted and not past their expiry, oldest first', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ModerationHoldsService({ accountHold: { findMany } } as unknown as PrismaService, {} as HoldService, {} as ModerationService);

    await service.listActiveHoldsForReport('r1', NOW);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reportId: 'r1', liftedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] },
        orderBy: [{ placedAt: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('returns the view fields only: id, userId, type, reportId, placedBy, placedAt, expiresAt, liftedAt', async () => {
    const row = {
      id: 'h1',
      userId: 'u1',
      type: 'bad_faith',
      reportId: 'r1',
      placedByAdminId: 'admin-9',
      placedAt: new Date('2030-05-01T00:00:00.000Z'),
      expiresAt: new Date('2030-11-01T00:00:00.000Z'),
      liftedAt: null,
    };
    const service = new ModerationHoldsService(
      { accountHold: { findMany: jest.fn().mockResolvedValue([row]) } } as unknown as PrismaService,
      {} as HoldService,
      {} as ModerationService,
    );

    const out = await service.listActiveHoldsForReport('r1', NOW);

    expect(out).toEqual([
      { id: 'h1', userId: 'u1', type: 'bad_faith', reportId: 'r1', placedBy: 'admin-9', placedAt: row.placedAt, expiresAt: row.expiresAt, liftedAt: null },
    ]);
  });

  it('toHoldView renames placedByAdminId to placedBy and drops reasons and lifter ids', () => {
    const view = toHoldView({
      id: 'h1',
      userId: 'u1',
      type: 'legal_hold',
      reportId: null,
      placedByAdminId: 'a',
      placedAt: NOW,
      expiresAt: null,
      liftedAt: null,
      ...({ placeReason: 'secret', liftReason: 'secret' } as object),
    });
    expect(Object.keys(view).sort()).toEqual(['expiresAt', 'id', 'liftedAt', 'placedAt', 'placedBy', 'reportId', 'type', 'userId']);
  });
});

// B-302 (Decision Log #498, #499). The three hold routes ask ModerationService.assertVettedToActOn (the B-297 rule)
// with the report's concernsMinor, targetType and targetId, after the 404 and before any hold is touched. The rule
// itself (message threads, fail-closed reads) is tested in moderation.act-vetting.spec.ts and, for these three
// routes over HTTP, in admin-moderation-holds.controller.http.spec.ts.
describe('ModerationHoldsService: the vetting gate on place and lift', () => {
  const REPORT = { concernsMinor: false, targetType: 'message', targetId: 'm1' };
  const REFUSAL = Object.assign(new Error('vetting'), { code: CHILD_SAFETY_VETTING_REQUIRED_CODE });
  const HOLD = {
    id: 'h1',
    userId: 'u1',
    type: 'legal_hold',
    reportId: 'r1',
    placedByAdminId: 'a1',
    placedAt: NOW,
    expiresAt: null,
    liftedAt: null,
  };

  function build(over: { report?: unknown; hold?: unknown; gate?: jest.Mock } = {}) {
    const reportFindUnique = jest.fn().mockResolvedValue('report' in over ? over.report : REPORT);
    const holdFindUnique = jest.fn().mockResolvedValue('hold' in over ? over.hold : { id: 'h1', report: REPORT });
    const hold = {
      placeBadFaith: jest.fn().mockResolvedValue(HOLD),
      placeLegalHold: jest.fn().mockResolvedValue([HOLD]),
      liftHold: jest.fn().mockResolvedValue(HOLD),
    };
    const gate = over.gate ?? jest.fn().mockResolvedValue(undefined);
    const service = new ModerationHoldsService(
      { report: { findUnique: reportFindUnique }, accountHold: { findUnique: holdFindUnique } } as unknown as PrismaService,
      hold as unknown as HoldService,
      { assertVettedToActOn: gate } as unknown as ModerationService,
    );
    return { service, reportFindUnique, holdFindUnique, hold, gate };
  }

  it('place bad-faith: loads concernsMinor, targetType and targetId, gates with them, then places', async () => {
    const { service, reportFindUnique, hold, gate } = build();
    await service.placeBadFaith('r1', 'admin-1', 'a reason that is long enough');
    expect(reportFindUnique).toHaveBeenCalledWith({
      where: { id: 'r1' },
      select: { concernsMinor: true, targetType: true, targetId: true },
    });
    expect(gate).toHaveBeenCalledWith(REPORT, 'admin-1');
    expect(hold.placeBadFaith).toHaveBeenCalledTimes(1);
    expect(gate.mock.invocationCallOrder[0]).toBeLessThan(hold.placeBadFaith.mock.invocationCallOrder[0]);
  });

  it('place legal: gates with the report, then places', async () => {
    const { service, hold, gate } = build();
    await service.placeLegal('r1', 'admin-1', 'a reason that is long enough');
    expect(gate).toHaveBeenCalledWith(REPORT, 'admin-1');
    expect(hold.placeLegalHold).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['placeBadFaith', (s: ModerationHoldsService) => s.placeBadFaith('r1', 'admin-1', 'a reason that is long enough')],
    ['placeLegal', (s: ModerationHoldsService) => s.placeLegal('r1', 'admin-1', 'a reason that is long enough')],
    ['lift', (s: ModerationHoldsService) => s.lift('h1', 'admin-1', 'a reason that is long enough')],
  ])('%s: when the gate refuses, the refusal is passed on and no hold is touched', async (_n, call) => {
    const { service, hold } = build({ gate: jest.fn().mockRejectedValue(REFUSAL) });
    await expect(call(service)).rejects.toBe(REFUSAL);
    expect(hold.placeBadFaith).not.toHaveBeenCalled();
    expect(hold.placeLegalHold).not.toHaveBeenCalled();
    expect(hold.liftHold).not.toHaveBeenCalled();
  });

  it.each([
    ['placeBadFaith', (s: ModerationHoldsService) => s.placeBadFaith('r1', 'admin-1', 'a reason that is long enough')],
    ['placeLegal', (s: ModerationHoldsService) => s.placeLegal('r1', 'admin-1', 'a reason that is long enough')],
  ])('%s: a missing report is a 404 and the gate is never asked', async (_n, call) => {
    const { service, gate } = build({ report: null });
    await expect(call(service)).rejects.toThrow('Report not found');
    expect(gate).not.toHaveBeenCalled();
  });

  it('lift: loads the hold with its report concernsMinor, targetType and targetId, gates with them, then lifts', async () => {
    const { service, holdFindUnique, hold, gate } = build();
    await service.lift('h1', 'admin-1', 'a reason that is long enough');
    expect(holdFindUnique).toHaveBeenCalledWith({
      where: { id: 'h1' },
      select: { id: true, report: { select: { concernsMinor: true, targetType: true, targetId: true } } },
    });
    expect(gate).toHaveBeenCalledWith(REPORT, 'admin-1');
    expect(hold.liftHold).toHaveBeenCalledWith('h1', 'admin-1', 'a reason that is long enough');
  });

  it('lift: a missing hold is a 404 and the gate is never asked', async () => {
    const { service, gate, hold } = build({ hold: null });
    await expect(service.lift('nope', 'admin-1', 'a reason that is long enough')).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'hold_not_found' }),
    });
    expect(gate).not.toHaveBeenCalled();
    expect(hold.liftHold).not.toHaveBeenCalled();
  });

  it('lift: a hold whose report was purged has nothing to vet against, so the gate is skipped (Decision Log #499)', async () => {
    const { service, gate, hold } = build({ hold: { id: 'h1', report: null } });
    await service.lift('h1', 'admin-1', 'a reason that is long enough');
    expect(gate).not.toHaveBeenCalled();
    expect(hold.liftHold).toHaveBeenCalledTimes(1);
  });
});
