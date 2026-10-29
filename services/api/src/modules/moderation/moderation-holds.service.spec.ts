import { PrismaService } from '../../prisma/prisma.service';
import { HoldService } from '../account-hold/hold.service';
import { ModerationHoldsService, toHoldView } from './moderation-holds.service';

// backend/w6-hold-admin-endpoints (B-045). The access shape is covered at the HTTP layer
// (admin-moderation-holds.controller.http.spec.ts); this covers the read used by the Report detail response.

const NOW = new Date('2030-06-01T00:00:00.000Z');

describe('ModerationHoldsService.listActiveHoldsForReport', () => {
  it('asks only for holds on this report that are not lifted and not past their expiry, oldest first', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ModerationHoldsService({ accountHold: { findMany } } as unknown as PrismaService, {} as HoldService);

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
