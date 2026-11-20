// Single owner of Admin Console session state.
//
// - Installs the adminClient auth bridge so a rejected refresh (the session is
//   dead) routes back to /login.
// - On boot (B-247): the access token lives in memory only, so a page load starts
//   with none. Boot purges the tokens the old build left in localStorage, does ONE
//   cookie refresh (POST /admin/auth/refresh through the httpOnly `sn_admin_rt`
//   cookie, lib/adminRefresh.ts), and only then hydrates the signed-in admin via
//   GET /admin/profile. Status stays "loading" until that is done. A 401 / 403 /
//   network failure with no token ends in "unauthenticated" (the login screen).
//   The refresh promise is cached at module level so React StrictMode's double
//   effect cannot present the same cookie twice (a second use is reuse and the
//   server revokes the session).
// - Subscribes to the in-memory session, so a sign-out in ANOTHER tab (broadcast on
//   a BroadcastChannel) puts this tab in "unauthenticated" without a reload.
// - Exposes login()/logout() and the current { status, admin }.
//
// This is the AuthContext apps/web never built for itself at the time; the Admin
// Console gets it from the start because it is genuinely auth-gated -- nothing is
// public, so the loading state needs no time cap.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  adminLogin,
  adminLogout,
  getAdminProfile,
  type AdminAuthResult,
  type AdminSummary,
} from "../api/adminAuth";
import { isEnrolmentRequired, isTwoFactorChallenge } from "../api/adminTwoFactor";
import { AdminApiError, installAdminAuthBridge, type AdminAuthLostReason } from "../api/adminClient";
import { restoreAdminSession } from "../lib/adminRefresh";
import {
  clearAdminSession,
  dropAdminSessionLocally,
  getAdminAccessToken,
  getAdminSignOutReason,
  storeAdminSession,
  subscribeAdminSession,
} from "../lib/adminSession";

export type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * What the password step answered (B-271). `signed-in` = no second factor was needed and the
 * session is already in place; the other two carry the in-memory token for the next step. Neither
 * of those is a session: the Console stays closed until the second factor finishes the sign-in.
 */
export type AdminLoginOutcome =
  | { kind: "signed-in" }
  | { kind: "challenge"; challengeToken: string; challengeExpiresInSeconds: number }
  | { kind: "enrolment"; enrolmentToken: string; expiresInSeconds: number };

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: AdminSummary | null;
  login: (email: string, password: string) => Promise<AdminLoginOutcome | void>;
  /**
   * Make a finished sign-in the live session: the result of POST /admin/auth/login/two-factor, or of
   * enrol/confirm once the operator has saved their backup codes. Access token only; the refresh
   * token is already in the httpOnly cookie.
   */
  adoptSession: (result: AdminAuthResult) => void;
  /** Set when the last session was ended by the two-factor refresh gate; /login shows the notice. */
  signedOutReason?: AdminAuthLostReason | null;
  logout: () => Promise<void>;
  /** Adopt a fresh AdminSummary (e.g. after PATCH /admin/profile) so the
   *  shell's identity block reflects it without a refetch. */
  applyProfile: (profile: AdminSummary) => void;
  /**
   * Re-read GET /admin/profile and adopt it (B-282). The admin's own childSafetyVetted can change while a
   * session is open, so a screen that depends on it refreshes it when it opens. Resolves with the fresh
   * profile, or null if the read failed (the held profile is left as it was).
   */
  refreshProfile: () => Promise<AdminSummary | null>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [admin, setAdmin] = useState<AdminSummary | null>(null);
  const [signedOutReason, setSignedOutReason] = useState<AdminAuthLostReason | null>(null);
  // Read inside the session subscription below, which must not re-subscribe on every status change.
  const statusRef = useRef<AdminAuthStatus>("loading");
  statusRef.current = status;

  const endSession = useCallback(() => {
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    installAdminAuthBridge({
      onAuthLost: (reason) => {
        setSignedOutReason(reason ?? null);
        endSession();
      },
    });
    return () => installAdminAuthBridge(null);
  }, [endSession]);

  // The session was ended from outside this component: another tab signed out
  // (BroadcastChannel) or a rejected refresh dropped the token. A sign-out that carries a reason (the
  // two-factor refresh gate) brings the same notice to this tab; only a tab that HAD a session shows it.
  useEffect(
    () =>
      subscribeAdminSession(() => {
        if (getAdminAccessToken() !== null) return;
        if (statusRef.current === "authenticated") setSignedOutReason(getAdminSignOutReason());
        setAdmin(null);
        setStatus((current) => (current === "authenticated" ? "unauthenticated" : current));
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      // One cookie refresh (cached at module level, so StrictMode shares it).
      const restored = await restoreAdminSession();
      if (cancelled) return;
      if (!getAdminAccessToken()) {
        // The refresh gate answers the same coded 401 at start-up (a reload with a still-valid cookie).
        if (restored === "enrolment-required") setSignedOutReason("two-factor-enrolment-required");
        setStatus("unauthenticated");
        return;
      }
      try {
        const profile = await getAdminProfile();
        if (cancelled) return;
        setAdmin(profile);
        setStatus("authenticated");
      } catch (err) {
        if (cancelled) return;
        // A 401 here means the access token was invalid AND refresh failed
        // (adminFetch already tried). Any other error (network, 500) -- treat the
        // session as still potentially good rather than logging the operator out
        // over a transient blip; they'll hit a real 401 on the next call if it's
        // genuinely dead.
        if (err instanceof AdminApiError && err.status === 401) {
          dropAdminSessionLocally();
          endSession();
        } else {
          setStatus("authenticated");
        }
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [endSession]);

  const adoptSession = useCallback((result: AdminAuthResult) => {
    // Access token only: the refresh token is in the httpOnly cookie.
    storeAdminSession({ accessToken: result.accessToken });
    setAdmin(result.admin);
    setSignedOutReason(null);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AdminLoginOutcome> => {
      const result = await adminLogin(email, password);
      // B-270: with two-factor on, or required and not yet set up, the password step is NOT a session.
      // The tokens that answer carries stay with the caller (React state), never in storage.
      if (isTwoFactorChallenge(result)) {
        return {
          kind: "challenge",
          challengeToken: result.challengeToken,
          challengeExpiresInSeconds: result.challengeExpiresInSeconds,
        };
      }
      if (isEnrolmentRequired(result)) {
        return {
          kind: "enrolment",
          enrolmentToken: result.enrolmentToken,
          expiresInSeconds: result.expiresInSeconds,
        };
      }
      adoptSession(result);
      return { kind: "signed-in" };
    },
    [adoptSession],
  );

  const logout = useCallback(async () => {
    // Best-effort and cookie-authenticated; the in-memory session is cleared (and
    // every other tab signed out) whatever the outcome.
    await adminLogout(getAdminAccessToken());
    clearAdminSession();
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  const applyProfile = useCallback((profile: AdminSummary) => {
    setAdmin(profile);
  }, []);

  const refreshProfile = useCallback(async (): Promise<AdminSummary | null> => {
    try {
      const profile = await getAdminProfile();
      setAdmin(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ status, admin, login, adoptSession, signedOutReason, logout, applyProfile, refreshProfile }),
    [status, admin, login, adoptSession, signedOutReason, logout, applyProfile, refreshProfile],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  return ctx;
}

/**
 * Like useAdminAuth, but null outside a provider instead of throwing. For screens that must still render
 * (and show nothing session-dependent) when mounted on their own.
 */
export function useOptionalAdminAuth(): AdminAuthContextValue | null {
  return useContext(AdminAuthContext);
}
