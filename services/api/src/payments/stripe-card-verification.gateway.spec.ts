import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const paymentIntents = { create: jest.fn(), retrieve: jest.fn() };
const refunds = { create: jest.fn() };
const ctor = jest.fn();

jest.mock('stripe', () => {
  const Ctor = function (this: unknown, key: string) {
    ctor(key);
    return { paymentIntents, refunds };
  };
  return Ctor;
});

import { StripeCardVerificationGateway } from './stripe-card-verification.gateway';

const cfg = (values: Record<string, string>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

describe('StripeCardVerificationGateway', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fails closed with a 503 when keys are unset or still placeholders', async () => {
    const gw = new StripeCardVerificationGateway(cfg({ STRIPE_SECRET_KEY: 'replace-me', STRIPE_PUBLISHABLE_KEY: 'replace-me' }));
    await expect(gw.retrieveIntent('pi_1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(gw.refundIntent('pi_1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(() => gw.publishableKey()).toThrow(ServiceUnavailableException);
    expect(ctor).not.toHaveBeenCalled();
  });

  it('creates a receipted PaymentIntent (not a SetupIntent) carrying ids only', async () => {
    paymentIntents.create.mockResolvedValue({ id: 'pi_1', client_secret: 'pi_1_secret' });
    const gw = new StripeCardVerificationGateway(cfg({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' }));

    const out = await gw.createVerificationIntent({
      amountCents: 50,
      currency: 'usd',
      receiptEmail: 'parent@example.com',
      idempotencyKey: 'k1',
      guardianId: 'g-1',
    });

    expect(out).toEqual({ id: 'pi_1', clientSecret: 'pi_1_secret' });
    const [body, opts] = paymentIntents.create.mock.calls[0];
    expect(body).toMatchObject({ amount: 50, currency: 'usd', receipt_email: 'parent@example.com' });
    expect(body.metadata).toEqual({ purpose: 'guardian_verification', guardianId: 'g-1' });
    expect(opts).toEqual({ idempotencyKey: 'k1' });
    expect(gw.publishableKey()).toBe('pk_test_x');
  });

  it('refunds by payment_intent with an idempotency key', async () => {
    refunds.create.mockResolvedValue({});
    const gw = new StripeCardVerificationGateway(cfg({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' }));
    await gw.refundIntent('pi_9');
    expect(refunds.create).toHaveBeenCalledWith({ payment_intent: 'pi_9' }, { idempotencyKey: 'refund:pi_9' });
  });

  it('reports refunded state from the expanded latest charge', async () => {
    paymentIntents.retrieve.mockResolvedValue({
      id: 'pi_1',
      status: 'succeeded',
      amount: 50,
      currency: 'usd',
      latest_charge: { refunded: true },
    });
    const gw = new StripeCardVerificationGateway(cfg({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_PUBLISHABLE_KEY: 'pk_test_x' }));
    await expect(gw.retrieveIntent('pi_1')).resolves.toEqual({
      id: 'pi_1',
      status: 'succeeded',
      amount: 50,
      currency: 'usd',
      refunded: true,
    });
  });
});
