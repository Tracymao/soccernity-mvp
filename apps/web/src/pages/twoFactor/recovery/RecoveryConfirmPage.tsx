// Adult confirm page -- the link in the lost-device recovery email (B-278; backend B-276, Decision Log #455).
// Route: /two-factor-recovery/confirm?token=... (public, under AuthChrome's logo-only Top Bar).
// Figma "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), desktop / mobile:
//   2.1 Confirm                    6914:34766 / 6914:34794
//   2.2 Waiting period started     6914:34822 / 6914:34850
//   2.3 Cancel ("this wasn't me")  6914:34878 / 6914:34902
//   2.4 Cancelled                  6914:34926 / 6914:34950
//   2.5 / 2.6 / 2.7 not valid / expired / already used  6914:34974 / 35018 / 35062 (mobile 6914:34996 / 35040 / 35084)
//
// On load the page only READS the link (GET link/:token, no side effects). Nothing changes until a BUTTON is pressed:
// "Confirm" -> POST confirm (starts the 24-hour wait; the answer carries `cancelToken`, held in memory ONLY);
// "Cancel the request" -> POST cancel with that token. "This wasn't me" BEFORE confirming makes no call: nothing has
// started, and the unused link simply lapses (the API has no way to cancel a request that is still unconfirmed).
//
// Two-factor stays on until the wait ends, and a successful two-factor sign-in during the wait also cancels (the
// sign-in prompt says so, Figma 2.8). The date is shown in the browser's own time zone, with the zone named.
import { useState, type RefObject } from "react";
import { Link, useSearchParams } from "react-router";
import {
  RecoveryApiError,
  cancelRecovery,
  confirmRecovery,
  type RecoveryLinkProblem,
} from "../../../api/twoFactorRecovery";
import {
  Alert,
  Card,
  CardText,
  Header,
  Icon,
  LinkProblemView,
  Shell,
  actionErrorMessage,
  formatWhen,
  useHeadingFocus,
  useLinkPreview,
} from "./recoveryParts";

type View =
  | { name: "confirm" }
  | { name: "waiting"; executeAt: string; cancelToken: string }
  | { name: "cancel-ask"; executeAt: string; cancelToken: string }
  | { name: "cancelled" }
  | { name: "problem"; problem: RecoveryLinkProblem };

export default function RecoveryConfirmPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") ?? "").trim();
  const preview = useLinkPreview(token, "adult");
  const [view, setView] = useState<View>({ name: "confirm" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useHeadingFocus(preview.status + ":" + view.name);

  async function confirm() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const result = await confirmRecovery(token);
      setView({ name: "waiting", executeAt: result.executeAt, cancelToken: result.cancelToken });
    } catch (err) {
      if (err instanceof RecoveryApiError && err.linkProblem) {
        setView({ name: "problem", problem: err.linkProblem });
      } else {
        setError(actionErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel(cancelToken: string) {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await cancelRecovery(cancelToken);
      setView({ name: "cancelled" });
    } catch (err) {
      if (err instanceof RecoveryApiError && err.linkProblem) {
        setView({ name: "problem", problem: err.linkProblem });
      } else {
        setError(actionErrorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  if (view.name === "problem") {
    return (
      <Shell state={`problem-${view.problem}`}>
        <LinkProblemView problem={view.problem} who="adult" headingRef={headingRef} />
      </Shell>
    );
  }

  if (view.name === "cancelled") {
    return (
      <Shell state="cancelled">
        <CancelledView headingRef={headingRef} />
      </Shell>
    );
  }

  if (view.name === "waiting") {
    return (
      <Shell state="waiting">
        <Icon />
        <Header title="Your request has started" headingRef={headingRef}>
          {`Two-factor will be turned off on ${formatWhen(view.executeAt)}. You’ll be signed out everywhere at that time.`}
        </Header>
        <Card title="What happens next">
          <CardText>We’ve emailed you a notice with a link to cancel.</CardText>
          <CardText>If you didn’t ask for this, cancel it now and change your password.</CardText>
        </Card>
        <div className="gw__actions">
          <Link to="/login" className="gw__button gw__button--primary">
            Done
          </Link>
          <button
            type="button"
            className="gw__button gw__button--outline"
            onClick={() => setView({ name: "cancel-ask", executeAt: view.executeAt, cancelToken: view.cancelToken })}
          >
            Cancel this request
          </button>
        </div>
      </Shell>
    );
  }

  if (view.name === "cancel-ask") {
    return (
      <Shell state="cancel-ask">
        <CancelAsk
          headingRef={headingRef}
          busy={busy}
          error={error}
          onCancel={() => void cancel(view.cancelToken)}
          onGoBack={() => {
            setError(null);
            setView({ name: "waiting", executeAt: view.executeAt, cancelToken: view.cancelToken });
          }}
        />
      </Shell>
    );
  }

  // The confirm view itself, behind the one read of the link.
  if (preview.status === "loading") {
    return (
      <Shell state="loading">
        <p className="gw__lead" role="status">
          Loading…
        </p>
      </Shell>
    );
  }
  if (preview.status === "error") {
    return (
      <Shell state="error">
        <Alert>{preview.message}</Alert>
      </Shell>
    );
  }
  if (preview.status === "problem") {
    return (
      <Shell state={`problem-${preview.problem}`}>
        <LinkProblemView problem={preview.problem} who="adult" headingRef={headingRef} />
      </Shell>
    );
  }

  return (
    <Shell state="confirm">
      <Icon />
      <Header title="Remove two-factor from your account?" headingRef={headingRef}>
        You asked to sign in without your authenticator app or backup codes. If you confirm, we’ll wait 24 hours, then
        turn off two-factor and sign you out everywhere.
      </Header>
      <Card title="Before you confirm">
        <CardText>We’ll email you a notice with a link to cancel.</CardText>
        <CardText>Signing in with your authenticator app during the wait also cancels this request.</CardText>
      </Card>
      {error && <Alert>{error}</Alert>}
      <div className="gw__actions">
        <button type="button" className="gw__button gw__button--primary" onClick={() => void confirm()} disabled={busy}>
          {busy ? "Confirming…" : "Confirm"}
        </button>
        <button
          type="button"
          className="gw__button gw__button--outline"
          onClick={() => setView({ name: "cancelled" })}
          disabled={busy}
        >
          This wasn’t me
        </button>
      </div>
    </Shell>
  );
}

export function CancelAsk({
  headingRef,
  busy,
  error,
  onCancel,
  onGoBack,
  goBackTo,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onGoBack?: () => void;
  goBackTo?: string;
}) {
  return (
    <>
      <Icon alert />
      <Header title="Cancel this recovery request?" headingRef={headingRef}>
        If you didn’t ask to remove two-factor, cancel it now. Nothing has changed on your account yet.
      </Header>
      {error && <Alert>{error}</Alert>}
      <div className="gw__actions">
        <button type="button" className="gw__button gw__button--primary" onClick={onCancel} disabled={busy}>
          {busy ? "Cancelling…" : "Cancel the request"}
        </button>
        {goBackTo ? (
          <Link to={goBackTo} className="gw__button gw__button--outline">
            Go back
          </Link>
        ) : (
          <button type="button" className="gw__button gw__button--outline" onClick={onGoBack} disabled={busy}>
            Go back
          </button>
        )}
      </div>
    </>
  );
}

export function CancelledView({ headingRef }: { headingRef: RefObject<HTMLHeadingElement | null> }) {
  return (
    <>
      <Icon />
      <Header title="Request cancelled" headingRef={headingRef}>
        Two-factor stays on. As someone else may know your password, we recommend you change it now.
      </Header>
      <div className="gw__actions">
        <Link to="/forgot-password" className="gw__button gw__button--primary">
          Change my password
        </Link>
      </div>
    </>
  );
}
