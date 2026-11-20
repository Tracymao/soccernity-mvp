// Adult cancel page -- the "this wasn't me" link in the notice email sent when a recovery request was confirmed
// (B-278; backend B-276, Decision Log #455). Route: /two-factor-recovery/cancel?token=... (public, under AuthChrome).
// The `token` in the address IS the cancel token. Figma "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), desktop / mobile:
//   2.3 Cancel            6914:34878 / 6914:34902
//   2.4 Cancel, done      6914:34926 / 6914:34950
//   2.5 / 2.6 / 2.7       not valid / expired / already used (6914:34974 / 35018 / 35062)
//
// The page makes NO call on load (a cancel token has no read route, and a link scanner must not cancel anything).
// "Cancel the request" -> POST cancel { cancelToken }; a rejected one (400) is mapped to 2.5 / 2.6 / 2.7 from the
// server's `state`. No token in the address is an invalid link. "Go back" leaves for the log-in page; nothing changed.
import { useState } from "react";
import { useSearchParams } from "react-router";
import { RecoveryApiError, cancelRecovery, type RecoveryLinkProblem } from "../../../api/twoFactorRecovery";
import { CancelAsk, CancelledView } from "./RecoveryConfirmPage";
import { LinkProblemView, Shell, actionErrorMessage, useHeadingFocus } from "./recoveryParts";

type View = { name: "ask" } | { name: "done" } | { name: "problem"; problem: RecoveryLinkProblem };

export default function RecoveryCancelPage() {
  const [searchParams] = useSearchParams();
  const cancelToken = (searchParams.get("token") ?? "").trim();
  const [view, setView] = useState<View>(cancelToken ? { name: "ask" } : { name: "problem", problem: "invalid" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useHeadingFocus(view.name);

  async function cancel() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await cancelRecovery(cancelToken);
      setView({ name: "done" });
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
  if (view.name === "done") {
    return (
      <Shell state="done">
        <CancelledView headingRef={headingRef} />
      </Shell>
    );
  }
  return (
    <Shell state="ask">
      <CancelAsk headingRef={headingRef} busy={busy} error={error} onCancel={() => void cancel()} goBackTo="/login" />
    </Shell>
  );
}
