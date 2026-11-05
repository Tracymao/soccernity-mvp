// The OAuth redirect page: /auth/social/:provider/callback (B-085; backend B-084). The redirect URI registered with
// each provider is <WEB_APP_BASE_URL>/auth/social/<provider>/callback. This page reads `code` and `state` (or an
// `error`) from the query string and finishes the sign-in. Figma: cancelled 6966:46289, refused or failed 6966:46362.
//
// Outcomes:
//   signed_in               -> store the session and route on the server's `nextStep`, exactly as after a password.
//   two_factor_required     -> the existing code prompt (POST /auth/login/two-factor finishes it).
//   registration_required   -> SocialSignupFlow: (email) -> hand-off -> Age Gate -> guardian -> create account.
//   the person cancelled    -> "Sign-in cancelled" (the provider sent error=access_denied).
//   anything else           -> "We couldn't sign you in".
//
// Login CSRF: the browser must have started this flow. The `state` saved by beginSocialSignIn must equal the `state`
// in the redirect; otherwise the API is never called. The saved entry is single use.
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import {
  SOCIAL_PROVIDER_LABELS,
  completeSocialCallback,
  isSocialProvider,
  type SocialCallbackResult,
  type SocialProvider,
} from "../../api/socialAuth";
import { isTwoFactorChallenge, type LoginResponse, type TwoFactorChallenge } from "../../api/auth";
import { beginSocialSignIn, takePendingSocialSignIn } from "../../lib/socialSignIn";
import { storeSession } from "../../lib/session";
import { routeForNextStep } from "../../lib/onboarding";
import TwoFactorCodePrompt from "../twoFactor/TwoFactorCodePrompt";
import SocialScreen from "./SocialScreen";
import SocialSignupFlow from "./SocialSignupFlow";
import "./social.css";

type View =
  | { kind: "working" }
  | { kind: "cancelled" }
  | { kind: "failed" }
  | { kind: "two-factor"; challenge: TwoFactorChallenge }
  | { kind: "registration"; result: Extract<SocialCallbackResult, { status: "registration_required" }> };

// A provider's `code` is single use and the saved `state` entry is read once, but React StrictMode runs effects twice
// in development. The whole decision is therefore made ONCE per visit and shared: the second run reuses the first
// run's answer instead of finding the saved entry gone or spending the code twice. Keyed by the history entry.
type Resolved = { view: View; stay: boolean; result: SocialCallbackResult | null };
const resolved = new Map<string, Promise<Resolved>>();

// Test hook: the cache is module level, so tests clear it between runs.
export function resetSocialCallbackCache(): void {
  resolved.clear();
}

async function resolveVisit(provider: SocialProvider | null, search: URLSearchParams): Promise<Resolved> {
  const code = search.get("code");
  const state = search.get("state");
  const providerError = search.get("error");

  // The one-time entry is consumed whatever happens next.
  const pending = takePendingSocialSignIn();
  const stay = pending?.staySignedIn === true;
  const failed: Resolved = { view: { kind: "failed" }, stay, result: null };

  if (!provider) return failed;
  // access_denied is what both providers send when the person closes or declines the window.
  if (providerError === "access_denied") return { view: { kind: "cancelled" }, stay, result: null };
  if (providerError || !code || !state) return failed;
  // Login CSRF: this browser did not start this flow (or the flow was already used).
  if (!pending || pending.provider !== provider || pending.state !== state) return failed;

  try {
    const result = await completeSocialCallback(provider, code, state);
    if (result.status === "two_factor_required") {
      return { view: { kind: "two-factor", challenge: result.challenge }, stay, result };
    }
    if (result.status === "registration_required") {
      return { view: { kind: "registration", result }, stay, result };
    }
    return { view: { kind: "working" }, stay, result };
  } catch {
    return failed;
  }
}

export default function SocialCallbackPage() {
  const navigate = useNavigate();
  const params = useParams();
  const location = useLocation();
  const provider = isSocialProvider(params.provider) ? params.provider : null;
  const [view, setView] = useState<View>({ kind: "working" });
  // The "Stay signed in" choice made before leaving for the provider, so "Try again" can repeat it.
  const stay = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const key = `${location.key}|${location.search}`;
    let visit = resolved.get(key);
    if (!visit) {
      visit = resolveVisit(provider, new URLSearchParams(location.search));
      resolved.set(key, visit);
    }
    // Remove `code` and `state` from the address bar and history: they are spent (or refused) from here on.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    void visit.then((outcome) => {
      if (cancelled) return;
      stay.current = outcome.stay;
      if (outcome.result?.status === "signed_in") {
        storeSession(outcome.result.response);
        navigate(routeForNextStep(outcome.result.response.user.nextStep), { replace: true });
      } else {
        setView(outcome.view);
      }
    });

    return () => {
      cancelled = true;
    };
    // The query string is read once per visit: the effect strips it from the URL, so it must not re-run on that.
  }, []);

  const label = provider ? SOCIAL_PROVIDER_LABELS[provider] : "your provider";

  function finishTwoFactor(result: LoginResponse) {
    storeSession(result);
    navigate(routeForNextStep(result.user.nextStep), { replace: true });
  }

  async function tryAgain() {
    if (!provider) {
      navigate("/login", { replace: true });
      return;
    }
    try {
      await beginSocialSignIn(provider, stay.current);
    } catch {
      setView({ kind: "failed" });
    }
  }

  switch (view.kind) {
    case "working":
      return (
        <SocialScreen title="Signing you in…" body={<p className="social-screen__body">One moment.</p>} />
      );

    case "cancelled":
      return (
        <SocialScreen
          title="Sign-in cancelled"
          body={
            <p className="social-screen__body">
              You closed the {label} window before finishing, so you’re not signed in.
            </p>
          }
        >
          <div className="social-screen__actions">
            <button type="button" className="social-primary" onClick={() => void tryAgain()}>
              Try again
            </button>
            <Link className="social-secondary" to="/login">
              Back to log in
            </Link>
          </div>
        </SocialScreen>
      );

    case "failed":
      return (
        <SocialScreen
          title="We couldn’t sign you in"
          body={<p className="social-screen__body">You can try again, or log in with your email and password.</p>}
        >
          <p className="social-error" role="alert">
            <span className="social-error__bar" aria-hidden="true" />
            {label} didn’t confirm your sign-in. This can happen if you declined access or the service isn’t available
            right now.
          </p>
          <div className="social-screen__actions">
            <button type="button" className="social-primary" onClick={() => void tryAgain()}>
              Try again
            </button>
            <Link className="social-secondary" to="/login">
              Back to log in
            </Link>
          </div>
        </SocialScreen>
      );

    case "two-factor":
      return (
        isTwoFactorChallenge(view.challenge) && (
          <TwoFactorCodePrompt
            challengeToken={view.challenge.challengeToken}
            recoveryPending={view.challenge.recoveryPending === true}
            onSignedIn={finishTwoFactor}
            onExpired={() => setView({ kind: "failed" })}
            onBackToLogin={() => navigate("/login", { replace: true })}
          />
        )
      );

    case "registration":
      return (
        <SocialSignupFlow
          provider={provider as SocialProvider}
          socialRegistrationToken={view.result.socialRegistrationToken}
          profile={view.result.profile}
        />
      );
  }
}
