// Shared parts of the pages a person reaches from an EMAILED two-factor recovery link (B-278; backend B-276,
// Decision Log #455, #456): the adult confirm and cancel pages and the guardian page. They hold no Soccernity
// session (the person cannot sign in; a guardian has no account), live under AuthChrome's logo-only Top Bar and
// reuse the guardian-withdrawal page look (Figma "style B", 560px column, 88px icon, cards, green primary):
// docs/figma-two-factor-recovery-report.md section 1.
//
// The Figma Copy Tag chip covers the whole screen, as on every two-factor frame; every sentence on these pages is
// pending legal review (docs/pending-copy-manifest.md, CopyTag row).
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router";
import {
  RecoveryApiError,
  getRecoveryLink,
  isRecoveryUnavailable,
  type RecoveryLinkProblem,
  type RecoveryLinkSummary,
} from "../../../api/twoFactorRecovery";
import checkIcon from "../../../assets/icons/withdrawal-check.svg";
import CopyTag from "../CopyTag";
import "../../guardian-consent/GuardianWithdrawalPage.css";
import "../twoFactor.css";

/** A date and time in the browser's own time zone, with the zone shown (the undecided format, a default). */
export function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function Shell({ state, children }: { state: string; children: ReactNode }) {
  return (
    <div className="gw" data-testid="two-factor-recovery-page" data-state={state}>
      <div className="gw__column">
        <CopyTag />
        {children}
      </div>
    </div>
  );
}

export function Icon({ alert = false }: { alert?: boolean }) {
  if (alert) {
    return (
      <div className="gw__icon gw__icon--alert" aria-hidden="true">
        !
      </div>
    );
  }
  return <img className="gw__icon" src={checkIcon} alt="" width={88} height={88} />;
}

export function Header({
  title,
  headingRef,
  children,
}: {
  title: string;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  children?: ReactNode;
}) {
  return (
    <div className="gw__header">
      <h1 className="gw__heading" ref={headingRef} tabIndex={-1}>
        {title}
      </h1>
      {children !== undefined && <p className="gw__lead">{children}</p>}
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="gw__card">
      <p className="gw__card-title">{title}</p>
      {children}
    </div>
  );
}

export function CardText({ children }: { children: ReactNode }) {
  return <p className="gw__card-text">{children}</p>;
}

export function Alert({ children }: { children: ReactNode }) {
  return (
    <p className="gw__alert" role="alert">
      {children}
    </p>
  );
}

/** Moves focus to the heading whenever `key` changes after the first render, so a screen reader announces it. */
export function useHeadingFocus(key: string) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, [key]);
  return ref;
}

export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const UNAVAILABLE_ERROR = "Recovery isn’t available right now. Please try again in a few minutes.";
export const LOAD_ERROR = "Couldn’t load this page. Check the connection and try again.";

/** The plain error line for a failed button press. */
export function actionErrorMessage(err: unknown): string {
  if (isRecoveryUnavailable(err)) return UNAVAILABLE_ERROR;
  if (err instanceof RecoveryApiError && err.status === undefined) return err.message;
  return GENERIC_ERROR;
}

/** Link states 2.5 / 2.6 / 2.7 (adult) and 3.4 / 3.5 (guardian; "not valid" has no guardian frame, so the adult copy is reused). */
export function LinkProblemView({
  problem,
  who,
  headingRef,
}: {
  problem: RecoveryLinkProblem;
  who: "adult" | "guardian";
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  if (problem === "expired") {
    return (
      <>
        <Icon alert />
        <Header title="This link has expired" headingRef={headingRef}>
          {who === "guardian"
            ? "The request can no longer be approved. The young person can ask again from sign-in."
            : "Start again from sign-in to get a new link."}
        </Header>
        {who === "adult" && <BackToLogin />}
      </>
    );
  }
  if (problem === "used") {
    return (
      <>
        <Icon alert />
        <Header title="This link has already been used" headingRef={headingRef}>
          {who === "guardian"
            ? "This request has already been answered, so there is nothing more to do."
            : "Each link works once. If you didn’t use it yourself, sign in and change your password."}
        </Header>
        {who === "adult" && <BackToLogin />}
      </>
    );
  }
  return (
    <>
      <Icon alert />
      <Header title="This link isn’t valid" headingRef={headingRef}>
        Check that you opened the whole link from the email, or start again from sign-in.
      </Header>
      <BackToLogin />
    </>
  );
}

function BackToLogin() {
  return (
    <div className="gw__actions">
      <Link to="/login" className="gw__button gw__button--outline">
        Back to log in
      </Link>
    </div>
  );
}

export type Preview =
  | { status: "loading" }
  | { status: "ready"; summary: RecoveryLinkSummary }
  | { status: "problem"; problem: RecoveryLinkProblem }
  | { status: "error"; message: string };

/**
 * Reads the link ONCE on load to choose the state (GET link/:token). That call changes nothing, so a link
 * scanner that opens the page changes nothing. It is the ONLY thing a page does without a button press. No token in
 * the address is an invalid link and makes no call.
 */
export function useLinkPreview(token: string, kind: "adult" | "guardian"): Preview {
  const [preview, setPreview] = useState<Preview>(token ? { status: "loading" } : { status: "problem", problem: "invalid" });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getRecoveryLink(token)
      .then((summary) => {
        if (cancelled) return;
        if (summary.state === "valid" && summary.kind === kind) {
          setPreview({ status: "ready", summary });
        } else if (summary.state === "valid") {
          // A link for the other kind of page is not valid here.
          setPreview({ status: "problem", problem: "invalid" });
        } else {
          setPreview({ status: "problem", problem: summary.state });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setPreview({ status: "error", message: err instanceof RecoveryApiError && err.status === undefined ? err.message : LOAD_ERROR });
      });
    return () => {
      cancelled = true;
    };
  }, [token, kind]);

  return preview;
}
