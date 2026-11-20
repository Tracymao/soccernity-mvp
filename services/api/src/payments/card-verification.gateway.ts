// sprint-1/coppa-card-verification -- the seam between guardian-consent and
// the payment processor. An abstract class (not an interface) so it is a
// real Nest DI token, the same reasoning StorageService uses, and so unit
// tests can pass a plain fake without a TestingModule.
//
// Deliberately narrow: three operations, all identified by Stripe REFERENCE
// ids. Nothing in this contract can carry a card number, expiry or CVC --
// those are entered into Stripe's own hosted Elements iframe on the
// client and never touch Soccernity's servers.

export interface VerificationIntent {
  id: string;
  clientSecret: string;
}

export interface VerificationIntentState {
  id: string;
  status: string; // Stripe PaymentIntent status, e.g. 'succeeded'
  amount: number;
  currency: string;
  refunded: boolean;
}

export abstract class CardVerificationGateway {
  // Publishable key handed to the browser. Public by design.
  abstract publishableKey(): string;

  abstract createVerificationIntent(params: {
    amountCents: number;
    currency: string;
    receiptEmail: string;
    idempotencyKey: string;
    guardianId: string;
  }): Promise<VerificationIntent>;

  abstract retrieveIntent(intentId: string): Promise<VerificationIntentState>;

  // Idempotent per intent: calling twice never refunds twice.
  abstract refundIntent(intentId: string): Promise<void>;
}
