// sprint-1/coppa-card-verification -- the guardian's card step, shown ONLY
// when the API says this consent request needs one (the child is under 13
// and US/undeclared). A technical control, not a legal conclusion.
//
// Card data never touches Soccernity: the number/expiry/CVC are typed into
// Stripe's own Elements iframe and go browser -> Stripe. This component and
// the API client only ever handle a client secret and reference state; there
// is no card field in our own DOM and nothing card-shaped in any request we
// send. The server re-reads the payment from Stripe before believing this
// step happened, so a tampered client cannot fake it.
//
// No design frame exists for this step (Figma predates it) -- built plainly
// with the existing consent-card styles, and flagged in the PR.
import { useEffect, useState, type FormEvent } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import {
  AuthApiError,
  completeGuardianCardVerification,
  createGuardianCardIntent,
  getGuardianVerificationRequirements,
} from "../../api/auth";

export type CardGate = "loading" | "not_required" | "needed" | "done";

interface Props {
  token: string;
  onGateChange: (gate: CardGate) => void;
}

function PaymentForm({ token, onVerified }: { token: string; onVerified: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({ elements, redirect: "if_required" });
    if (result.error) {
      setError(result.error.message ?? "That card could not be verified. Please try another card.");
      setBusy(false);
      return;
    }
    try {
      await completeGuardianCardVerification(token);
      onVerified();
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Verification could not be completed. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="card-verification-form">
      <PaymentElement />
      {error && (
        <p className="consent-status-message consent-status-message--error" role="alert">
          {error}
        </p>
      )}
      <div className="consent-actions">
        <button type="submit" className="consent-button consent-button--primary" disabled={!stripe || busy}>
          {busy ? "Verifying…" : "Verify with this card"}
        </button>
      </div>
    </form>
  );
}

export default function CardVerificationPanel({ token, onGateChange }: Props) {
  const [gate, setGate] = useState<CardGate>("loading");
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(next: CardGate) {
    setGate(next);
    onGateChange(next);
  }

  useEffect(() => {
    let cancelled = false;
    getGuardianVerificationRequirements(token)
      .then((r) => {
        if (cancelled) return;
        update(!r.cardRequired ? "not_required" : r.cardVerified ? "done" : "needed");
      })
      .catch(() => {
        // The server is authoritative and re-checks on submit; a failed
        // lookup must not invent a card step or block the ordinary flow.
        if (!cancelled) update("not_required");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line
  }, [token]);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const intent = await createGuardianCardIntent(token);
      setStripePromise(loadStripe(intent.publishableKey));
      setClientSecret(intent.clientSecret);
    } catch (err) {
      setError(err instanceof AuthApiError ? err.message : "Card verification could not be started.");
    } finally {
      setStarting(false);
    }
  }

  if (gate === "loading" || gate === "not_required") return null;

  if (gate === "done") {
    return (
      <p className="consent-status-message" data-testid="card-verification-done">
        Card verification complete. You can now give your approval below.
      </p>
    );
  }

  return (
    <div className="consent-card" style={{ gap: "16px" }} data-testid="card-verification-panel">
      <h3>One more step: verify with a card</h3>
      <p>
        Because of the age of the account holder, we ask a parent or guardian to verify with a payment card before
        approval. We make a small charge of $0.50 and refund it straight away &mdash; we keep nothing. Stripe will
        email you a receipt for it. Your card details go directly to Stripe; Soccernity never sees or stores them.
      </p>
      {error && (
        <p className="consent-status-message consent-status-message--error" role="alert">
          {error}
        </p>
      )}
      {!clientSecret ? (
        <div className="consent-actions">
          <button
            type="button"
            className="consent-button consent-button--primary"
            onClick={start}
            disabled={starting}
          >
            {starting ? "Starting…" : "Verify with a card"}
          </button>
        </div>
      ) : (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <PaymentForm token={token} onVerified={() => update("done")} />
        </Elements>
      )}
    </div>
  );
}
