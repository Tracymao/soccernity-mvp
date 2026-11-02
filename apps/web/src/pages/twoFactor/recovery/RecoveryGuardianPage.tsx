// Guardian page -- the link emailed to a MINOR's confirmed guardian when the young person lost their authenticator
// device and backup codes (B-278; backend B-276, Decision Log #455, #456). Route:
// /two-factor-recovery/guardian?token=... (public, under AuthChrome's logo-only Top Bar; a guardian has no account).
// Figma "Soccernity-MVP" (weZWWqggy9j13eX8bhFgs6), mobile / desktop (mobile first):
//   3.1 Request summary           6915:34766 / 6915:34893
//   3.2 Done, approved            6915:34802 / 6915:34929
//   3.3 Done, declined            6915:34824 / 6915:34951
//   3.4 Link expired              6915:34849 / 6915:34976
//   3.5 Link already used         6915:34871 / 6915:34998
//   (no frame) link not valid     -> the not-valid copy of the adult pages 2.5 (6914:34974), in this layout
//
// On load the page only READS the link (GET link/:token). Approve / "I didn't expect this" are BUTTONS that call
// POST guardian/approve and POST guardian/decline; a link scanner that opens the page changes nothing. The summary
// shows only what the link answer carries: the young person's PUBLIC name (username, or "Soccernity member"; never
// the real name) and when the request was made, in the browser's time zone.
import { useState } from "react";
import { useSearchParams } from "react-router";
import {
  RecoveryApiError,
  approveRecovery,
  declineRecovery,
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
  | { name: "summary" }
  | { name: "approved" }
  | { name: "declined" }
  | { name: "problem"; problem: RecoveryLinkProblem };

export default function RecoveryGuardianPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get("token") ?? "").trim();
  const preview = useLinkPreview(token, "guardian");
  const [view, setView] = useState<View>({ name: "summary" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useHeadingFocus(preview.status + ":" + view.name);

  async function answer(kind: "approve" | "decline") {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      if (kind === "approve") {
        await approveRecovery(token);
        setView({ name: "approved" });
      } else {
        await declineRecovery(token);
        setView({ name: "declined" });
      }
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
        <LinkProblemView problem={view.problem} who="guardian" headingRef={headingRef} />
      </Shell>
    );
  }

  if (view.name === "approved") {
    return (
      <Shell state="approved">
        <Icon />
        <Header title="Request approved" headingRef={headingRef}>
          Two-factor has been removed from the account and they’ve been signed out everywhere. They can sign in with
          their password and set up two-factor again.
        </Header>
      </Shell>
    );
  }

  if (view.name === "declined") {
    return (
      <Shell state="declined">
        <Icon />
        <Header title="Request declined" headingRef={headingRef}>
          We’ve cancelled the request. Two-factor stays on.
        </Header>
        <Card title="If you didn’t expect this">
          <CardText>Someone else may know the account’s password. Ask them to change it now.</CardText>
        </Card>
      </Shell>
    );
  }

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
        <LinkProblemView problem={preview.problem} who="guardian" headingRef={headingRef} />
      </Shell>
    );
  }

  const { summary } = preview;
  return (
    <Shell state="summary">
      <Icon />
      <Header title="Approve removing two-factor?" headingRef={headingRef}>
        The young person whose Soccernity account you gave consent for says they’ve lost their device and backup codes.
        They’ve asked to sign in without two-factor.
      </Header>
      <Card title="The request">
        <CardText>Account</CardText>
        <p className="gw__card-title">{summary.minor?.publicName ?? "Soccernity member"}</p>
        {summary.requestedAt && (
          <>
            <CardText>Asked on</CardText>
            <p className="gw__card-title">{formatWhen(summary.requestedAt)}</p>
          </>
        )}
      </Card>
      <Card title="If you approve">
        <CardText>Two-factor is removed from the account.</CardText>
        <CardText>
          They’re signed out everywhere. They can then sign in with their password and set two-factor up again.
        </CardText>
      </Card>
      {error && <Alert>{error}</Alert>}
      <div className="gw__actions">
        <button type="button" className="gw__button gw__button--primary" onClick={() => void answer("approve")} disabled={busy}>
          {busy ? "Working…" : "Approve"}
        </button>
        <button type="button" className="gw__button gw__button--outline" onClick={() => void answer("decline")} disabled={busy}>
          I didn’t expect this
        </button>
      </div>
    </Shell>
  );
}
