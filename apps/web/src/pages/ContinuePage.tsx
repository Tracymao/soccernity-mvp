// "Continue" resolver (B-125). Some places have no fresh onboarding state to
// route on -- the Verified screen after an email link, the approved-consent
// page -- so they link here instead of guessing a destination. This page asks
// the server (`GET /users/:id` carries `nextStep`, read fresh from Postgres,
// B-030) and sends the account on. It renders nothing of its own beyond a
// short loading line; no state is decided client-side.
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { getUser } from "../api/users";
import { routeForNextStep } from "../lib/onboarding";
import { decodeAccessToken, getStoredAccessToken } from "../lib/session";

type State = { kind: "loading" } | { kind: "go"; to: string } | { kind: "error" };

export default function ContinuePage() {
  const token = getStoredAccessToken();
  const userId = token ? decodeAccessToken(token)?.sub : undefined;
  const [state, setState] = useState<State>(token && userId ? { kind: "loading" } : { kind: "go", to: "/login" });

  useEffect(() => {
    if (!token || !userId) return;
    let cancelled = false;
    getUser(token, userId)
      .then((user) => {
        if (!cancelled) setState({ kind: "go", to: routeForNextStep(user.nextStep) });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  if (state.kind === "go") return <Navigate to={state.to} replace />;
  if (state.kind === "error") {
    return (
      <p role="alert" style={{ padding: "32px" }}>
        Couldn&rsquo;t work out where to send you next. Please try again shortly.
      </p>
    );
  }
  return (
    <p role="status" style={{ padding: "32px" }}>
      Loading…
    </p>
  );
}
