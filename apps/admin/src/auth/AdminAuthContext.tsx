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
  useState,
  type ReactNode,
} from "react";
import {
  adminLogin,
  adminLogout,
  getAdminProfile,
  type AdminSummary,
} from "../api/adminAuth";
import { AdminApiError, installAdminAuthBridge } from "../api/adminClient";
import { restoreAdminSession } from "../lib/adminRefresh";
import {
  clearAdminSession,
  dropAdminSessionLocally,
  getAdminAccessToken,
  storeAdminSession,
  subscribeAdminSession,
} from "../lib/adminSession";

export type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: AdminSummary | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Adopt a fresh AdminSummary (e.g. after PATCH /admin/profile) so the
   *  shell's identity block reflects it without a refetch. */
  applyProfile: (profile: AdminSummary) => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [admin, setAdmin] = useState<AdminSummary | null>(null);

  const endSession = useCallback(() => {
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    installAdminAuthBridge({ onAuthLost: () => endSession() });
    return () => installAdminAuthBridge(null);
  }, [endSession]);

  // The session was ended from outside this component: another tab signed out
  // (BroadcastChannel) or a rejected refresh dropped the token.
  useEffect(
    () =>
      subscribeAdminSession(() => {
        if (getAdminAccessToken() !== null) return;
        setAdmin(null);
        setStatus((current) => (current === "authenticated" ? "unauthenticated" : current));
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      // One cookie refresh (cached at module level, so StrictMode shares it).
      await restoreAdminSession();
      if (cancelled) return;
      if (!getAdminAccessToken()) {
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

  const login = useCallback(async (email: string, password: string) => {
    const result = await adminLogin(email, password);
    // Access token only: the refresh token is in the httpOnly cookie.
    storeAdminSession({ accessToken: result.accessToken });
    setAdmin(result.admin);
    setStatus("authenticated");
  }, []);

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

  const value = useMemo<AdminAuthContextValue>(
    () => ({ status, admin, login, logout, applyProfile }),
    [status, admin, login, logout, applyProfile],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  return ctx;
}
