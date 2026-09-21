import { CardRefundRetrySweepService } from './card-refund-retry-sweep.service';
import { GuardianCardVerificationService } from './guardian-card-verification.service';

interface Row {
  id: string;
  cardVerifiedAt: Date | null;
  cardRefundedAt: Date | null;
  stripePaymentIntentId: string | null;
}

const T = new Date('2026-09-21T00:00:00Z');

// The fake findMany mirrors the where-clause, so these tests prove the
// query shape selects only verified-and-unrefunded rows.
function build(rows: Row[], gwOver: Record<string, unknown> = {}) {
  const prisma = {
    guardian: {
      findMany: jest.fn(async () =>
        rows.filter((r) => r.cardVerifiedAt !== null && r.cardRefundedAt === null && r.stripePaymentIntentId !== null),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        Object.assign(rows.find((r) => r.id === where.id) as Row, data);
      }),
    },
  };
  const gateway = {
    retrieveIntent: jest.fn(async (id: string) => ({
      id,
      status: 'succeeded',
      amount: 50,
      currency: 'usd',
      refunded: false,
    })),
    refundIntent: jest.fn().mockResolvedValue(undefined),
    ...gwOver,
  };
  const cardVerification = new GuardianCardVerificationService(
    prisma as never,
    { get: jest.fn() } as never,
    gateway as never,
  );
  const sweep = new CardRefundRetrySweepService(prisma as never, cardVerification);
  return { sweep, gateway, prisma, rows };
}

const row = (id: string, o: Partial<Row> = {}): Row => ({
  id,
  cardVerifiedAt: T,
  cardRefundedAt: null,
  stripePaymentIntentId: `pi_${id}`,
  ...o,
});

describe('CardRefundRetrySweepService', () => {
  it('touches only verified+unrefunded rows', async () => {
    const { sweep, gateway } = build([
      row('done', { cardRefundedAt: T }),
      row('stranded'),
      row('unverified', { cardVerifiedAt: null }),
    ]);
    const res = await sweep.sweepUnrefundedCharges();
    expect(res).toEqual({ refundedGuardianIds: ['stranded'], failedGuardianIds: [] });
    expect(gateway.refundIntent).toHaveBeenCalledTimes(1);
    expect(gateway.refundIntent).toHaveBeenCalledWith('pi_stranded');
  });

  it('records cardRefundedAt on success', async () => {
    const { sweep, rows } = build([row('a')]);
    await sweep.sweepUnrefundedCharges();
    expect(rows[0].cardRefundedAt).toBeInstanceOf(Date);
  });

  it('one row failing does not stop the rest, and the failed row stays unrefunded', async () => {
    const refundIntent = jest.fn(async (id: string) => {
      if (id === 'pi_bad') throw new Error('card closed');
    });
    const { sweep, rows } = build([row('first'), row('bad'), row('last')], { refundIntent });
    const res = await sweep.sweepUnrefundedCharges();
    expect(res.refundedGuardianIds).toEqual(['first', 'last']);
    expect(res.failedGuardianIds).toEqual(['bad']);
    expect(rows.find((r) => r.id === 'bad')?.cardRefundedAt).toBeNull();
    expect(rows.find((r) => r.id === 'last')?.cardRefundedAt).toBeInstanceOf(Date);
  });

  it('a charge Stripe already shows as refunded is stamped without a second refund', async () => {
    const retrieveIntent = jest
      .fn()
      .mockResolvedValue({ id: 'pi_a', status: 'succeeded', amount: 50, currency: 'usd', refunded: true });
    const { sweep, gateway, rows } = build([row('a')], { retrieveIntent });
    await sweep.sweepUnrefundedCharges();
    expect(gateway.refundIntent).not.toHaveBeenCalled();
    expect(rows[0].cardRefundedAt).toBeInstanceOf(Date);
  });

  it('a failing row is retried on the next run', async () => {
    const refundIntent = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    const { sweep } = build([row('a')], { refundIntent });
    expect((await sweep.sweepUnrefundedCharges()).failedGuardianIds).toEqual(['a']);
    expect((await sweep.sweepUnrefundedCharges()).refundedGuardianIds).toEqual(['a']);
  });
});
