import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CardVerificationGateway } from '../../../payments/card-verification.gateway';
import { GuardianCardVerificationService } from './guardian-card-verification.service';

const HOUR = 60 * 60 * 1000;

function guardian(over: Record<string, unknown> = {}) {
  return {
    id: 'g-1',
    email: 'parent@example.com',
    consentToken: 'tok',
    consentStatus: 'pending',
    consentTokenExpiresAt: new Date(Date.now() + HOUR),
    cardVerificationRequired: true,
    stripePaymentIntentId: null as string | null,
    cardVerifiedAt: null as Date | null,
    cardRefundedAt: null as Date | null,
    ...over,
  };
}

function build(g: ReturnType<typeof guardian> | null, gwOver: Record<string, unknown> = {}) {
  const prisma = {
    guardian: {
      findUnique: jest.fn().mockResolvedValue(g),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const gateway: Record<string, jest.Mock> = {
    publishableKey: jest.fn().mockReturnValue('pk_test_123'),
    createVerificationIntent: jest.fn().mockResolvedValue({ id: 'pi_1', clientSecret: 'pi_1_secret_x' }),
    retrieveIntent: jest
      .fn()
      .mockResolvedValue({ id: 'pi_1', status: 'succeeded', amount: 50, currency: 'usd', refunded: false }),
    refundIntent: jest.fn().mockResolvedValue(undefined),
    ...(gwOver as Record<string, jest.Mock>),
  };
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const service = new GuardianCardVerificationService(prisma as any, config, gateway as unknown as CardVerificationGateway);
  return { service, prisma, gateway };
}

describe('GuardianCardVerificationService', () => {
  describe('getRequirements', () => {
    it('reports required / verified state', async () => {
      const { service } = build(guardian());
      await expect(service.getRequirements('tok')).resolves.toEqual({ cardRequired: true, cardVerified: false });
    });

    it('reports not required for the ordinary path', async () => {
      const { service } = build(guardian({ cardVerificationRequired: false }));
      await expect(service.getRequirements('tok')).resolves.toEqual({ cardRequired: false, cardVerified: false });
    });

    it('generic rejection for unknown and expired tokens', async () => {
      await expect(build(null).service.getRequirements('x')).rejects.toBeInstanceOf(BadRequestException);
      const expired = guardian({ consentTokenExpiresAt: new Date(Date.now() - 1000) });
      await expect(build(expired).service.getRequirements('tok')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a request that is no longer pending', async () => {
      const { service } = build(guardian({ consentStatus: 'declined' }));
      await expect(service.getRequirements('tok')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createIntent', () => {
    it('creates a 50-cent USD intent with a receipt to the guardian, stores only the reference id', async () => {
      const { service, prisma, gateway } = build(guardian());

      const out = await service.createIntent('tok');

      expect(out).toEqual({ clientSecret: 'pi_1_secret_x', publishableKey: 'pk_test_123' });
      expect(gateway.createVerificationIntent).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 50, currency: 'usd', receiptEmail: 'parent@example.com', guardianId: 'g-1' }),
      );
      expect(prisma.guardian.update).toHaveBeenCalledWith({ where: { id: 'g-1' }, data: { stripePaymentIntentId: 'pi_1' } });
    });

    it('never touches Stripe for a guardian outside the in-scope band', async () => {
      const { service, gateway } = build(guardian({ cardVerificationRequired: false }));
      await expect(service.createIntent('tok')).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.createVerificationIntent).not.toHaveBeenCalled();
    });

    it('refuses once already verified', async () => {
      const { service, gateway } = build(guardian({ cardVerifiedAt: new Date() }));
      await expect(service.createIntent('tok')).rejects.toBeInstanceOf(BadRequestException);
      expect(gateway.createVerificationIntent).not.toHaveBeenCalled();
    });

    it('does not rewrite the stored id when the same intent is returned (idempotent retry)', async () => {
      const { service, prisma } = build(guardian({ stripePaymentIntentId: 'pi_1' }));
      await service.createIntent('tok');
      expect(prisma.guardian.update).not.toHaveBeenCalled();
    });
  });

  describe('complete', () => {
    it('on a succeeded charge: records verification, refunds, records the refund', async () => {
      const { service, prisma, gateway } = build(guardian({ stripePaymentIntentId: 'pi_1' }));

      await expect(service.complete('tok')).resolves.toEqual({ cardRequired: true, cardVerified: true });

      expect(gateway.refundIntent).toHaveBeenCalledWith('pi_1');
      const writes = prisma.guardian.update.mock.calls.map((c) => Object.keys(c[0].data));
      expect(writes).toEqual([['cardVerifiedAt'], ['cardRefundedAt']]);
    });

    it('does not trust the client: an unpaid / wrong-amount intent is not verification', async () => {
      for (const state of [
        { status: 'requires_payment_method', amount: 50, currency: 'usd' },
        { status: 'succeeded', amount: 1, currency: 'usd' },
        { status: 'succeeded', amount: 50, currency: 'eur' },
      ]) {
        const { service, prisma, gateway } = build(guardian({ stripePaymentIntentId: 'pi_1' }), {
          retrieveIntent: jest.fn().mockResolvedValue({ id: 'pi_1', refunded: false, ...state }),
        });
        await expect(service.complete('tok')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.guardian.update).not.toHaveBeenCalled();
        expect(gateway.refundIntent).not.toHaveBeenCalled();
      }
    });

    it('refuses when no intent was ever created', async () => {
      const { service } = build(guardian());
      await expect(service.complete('tok')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refund failure: verification stays recorded, error propagates, retry re-attempts only the refund', async () => {
      const g = guardian({ stripePaymentIntentId: 'pi_1' });
      const refund = jest.fn().mockRejectedValueOnce(new Error('stripe down')).mockResolvedValue(undefined);
      const first = build(g, { refundIntent: refund });
      await expect(first.service.complete('tok')).rejects.toThrow('stripe down');
      expect(first.prisma.guardian.update).toHaveBeenCalledTimes(1); // cardVerifiedAt only
      expect(first.prisma.guardian.update.mock.calls[0][0].data).toHaveProperty('cardVerifiedAt');

      // Retry against the row as persisted by the first attempt.
      const retry = build({ ...g, cardVerifiedAt: new Date() }, { refundIntent: refund });
      await retry.service.complete('tok');
      expect(refund).toHaveBeenCalledTimes(2);
      expect(retry.prisma.guardian.update.mock.calls.map((c) => Object.keys(c[0].data))).toEqual([['cardRefundedAt']]);
    });

    it('an already-refunded charge is not refunded twice', async () => {
      const { service, gateway } = build(guardian({ stripePaymentIntentId: 'pi_1', cardVerifiedAt: new Date() }), {
        retrieveIntent: jest
          .fn()
          .mockResolvedValue({ id: 'pi_1', status: 'succeeded', amount: 50, currency: 'usd', refunded: true }),
      });
      await service.complete('tok');
      expect(gateway.refundIntent).not.toHaveBeenCalled();
    });
  });

  describe('no raw card data is ever persisted or logged', () => {
    const PAN = /\b\d{13,19}\b/;
    const SECRETS = /cardNumber|cvc|cvv|\bpan\b|expiry|exp_month|exp_year/i;

    it('every DB write and every log line across the full flow carries ids/timestamps only', async () => {
      const logged: string[] = [];
      const spies = (['log', 'warn', 'error', 'debug', 'verbose'] as const).map((m) =>
        jest.spyOn(Logger.prototype, m).mockImplementation((...args: unknown[]) => {
          logged.push(String(args[0]));
        }),
      );

      const { service, prisma, gateway } = build(guardian());
      await service.createIntent('tok');
      // simulate the row now carrying the stored intent id for the next call
      prisma.guardian.findUnique.mockResolvedValue(guardian({ stripePaymentIntentId: 'pi_1' }));
      await service.complete('tok');

      const written = JSON.stringify(prisma.guardian.update.mock.calls.map((c) => c[0]));
      // idempotencyKey embeds an epoch-millisecond timestamp (13 digits) -- ours, not card data.
      const gatewayArgs = JSON.stringify(
        gateway.createVerificationIntent.mock.calls.map(([a]) => ({ ...a, idempotencyKey: undefined })),
      );
      for (const blob of [written, gatewayArgs, ...logged]) {
        expect(blob).not.toMatch(PAN);
        expect(blob).not.toMatch(SECRETS);
      }
      // every written key is one of the reference/timestamp columns
      for (const call of prisma.guardian.update.mock.calls) {
        for (const key of Object.keys(call[0].data)) {
          expect(['stripePaymentIntentId', 'cardVerifiedAt', 'cardRefundedAt']).toContain(key);
        }
      }
      spies.forEach((s) => s.mockRestore());
    });
  });
});
