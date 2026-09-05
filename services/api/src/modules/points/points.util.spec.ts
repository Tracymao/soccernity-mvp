import { Prisma } from '@prisma/client';
import { awardPoints } from './points.util';

function txMock() {
  return {
    pointsLedgerEntry: { create: jest.fn() },
  } as unknown as Prisma.TransactionClient;
}

describe('awardPoints', () => {
  it('writes one PointsLedgerEntry row with the given fields, defaulting clubId to null and occurredAt to now', async () => {
    const tx = txMock();
    const before = Date.now();

    const wrote = await awardPoints(tx, {
      userId: 'u-1',
      source: 'engagement_post',
      refId: 'post-1',
      points: 3,
    });

    expect(wrote).toBe(true);
    const args = (tx.pointsLedgerEntry.create as jest.Mock).mock.calls[0][0];
    expect(args.data).toMatchObject({ userId: 'u-1', source: 'engagement_post', refId: 'post-1', points: 3, clubId: null });
    expect(args.data.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
  });

  it('passes an explicit occurredAt and clubId through unchanged', async () => {
    const tx = txMock();
    const when = new Date('2026-01-02T03:04:05.000Z');

    await awardPoints(tx, {
      userId: 'u-1',
      source: 'contest_weekly_win',
      refId: 'round-1',
      points: 50,
      clubId: 'club-9',
      occurredAt: when,
    });

    expect((tx.pointsLedgerEntry.create as jest.Mock).mock.calls[0][0].data).toMatchObject({
      clubId: 'club-9',
      occurredAt: when,
    });
  });

  it('swallows a P2002 (duplicate award) as an idempotent no-op, returning false', async () => {
    const tx = txMock();
    (tx.pointsLedgerEntry.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.0.0',
      }),
    );

    await expect(
      awardPoints(tx, { userId: 'u-1', source: 'engagement_like', refId: 'post-1', points: 1 }),
    ).resolves.toBe(false);
  });

  it('rethrows any non-P2002 error', async () => {
    const tx = txMock();
    (tx.pointsLedgerEntry.create as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK violation', { code: 'P2003', clientVersion: '5.0.0' }),
    );

    await expect(
      awardPoints(tx, { userId: 'ghost', source: 'engagement_like', refId: 'post-1', points: 1 }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
