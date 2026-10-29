// B-246 -- the AuthContext the interim session code (lib/session.ts, B-017) named
// as its follow-up.
//
// AuthProvider's one real job is the START-UP RESTORE: a page load has no access
// token (it lives in memory only), so before any route renders it does ONE
// POST /auth/refresh through the httpOnly cookie (silentRefresh.restoreSession)
// and only then renders the app. Rendering the router first would flash the
// signed-out chrome / the login prompt of every protected page for a signed-in
// person. While it waits it shows the same plain "Loading…" status line the
// pages use. A 401 / 403 with no cookie simply means "signed out" -- there is no
// error state here, and restoreSession never throws.
//
// The token itself is NOT held in React state: it is the in-memory store of
// lib/session.ts, read synchronously by ~110 call sites. useAuth() subscribes to
// that store (useSyncExternalStore), so a component that uses the hook re-renders
// when the session starts, rotates or ends -- including when ANOTHER tab signs
// out (BroadcastChannel). The hook works without a provider, which keeps unit
// tests that mount a single page simple.
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { logoutSession } from "../api/auth";
import { clearStoredSession, getStoredAccessToken, storeSession, subscribeSession } from "./session";
import type { SessionTokens } from "./session";
import { restoreSession } from "./silentRefresh";

export type AuthStatus = "restoring" | "ready";

// The longest the app waits for the start-up refresh before rendering signed out.
export const RESTORE_GATE_MAX_MS = 8_000;

const AuthStatusContext = createContext<AuthStatus>("ready");

export interface Auth {
  status: AuthStatus;
  accessToken: string | null;
  // A fresh sign-in (login, registration, reactivation).
  signIn: (tokens: SessionTokens) => void;
  // Ends the session: revokes the cookie server-side (best-effort, never awaited
  // by the UI) and clears the in-memory token in this and every other tab.
  signOut: () => void;
}

function signIn(tokens: SessionTokens): void {
  storeSession(tokens);
}

function signOut(): void {
  void logoutSession();
  clearStoredSession();
}

export function useAccessToken(): string | null {
  return useSyncExternalStore(subscribeSession, getStoredAccessToken, getStoredAccessToken);
}

export function useAuth(): Auth {
  const status = useContext(AuthStatusContext);
  const accessToken = useAccessToken();
  return { status, accessToken, signIn, signOut };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("restoring");

  useEffect(() => {
    let active = true;
    const release = () => {
      if (active) setStatus("ready");
    };
    // A slow or cold API (a free Render instance takes tens of seconds to wake) must not hold every
    // page, public ones included, on "Loading…": after RESTORE_GATE_MAX_MS the app renders signed out
    // and the refresh keeps going. If it succeeds later the session simply appears (the token store is
    // observable), exactly as if the person had signed in.
    const timer = setTimeout(release, RESTORE_GATE_MAX_MS);
    // Module-level and cached: StrictMode's double effect shares ONE refresh.
    void restoreSession().finally(() => {
      clearTimeout(timer);
      release();
    });
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  if (status === "restoring") {
    return (
      <p role="status" style={{ margin: 0, padding: "32px", color: "var(--sn-text-secondary)" }}>
        Loading…
      </p>
    );
  }

  return <AuthStatusContext.Provider value={status}>{children}</AuthStatusContext.Provider>;
}
