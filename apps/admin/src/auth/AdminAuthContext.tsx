// Single owner of Admin Console session state.
//
// - Installs the adminClient auth bridge so transparent 401-refresh works
//   for every `/admin/*` call (adminClient.ts).
// - On boot: if a stored admin token exists, hydrates the signed-in admin
//   via GET /admin/profile (which also validates the token — a boot with a
//   stale/expired token that cannot be refreshed lands on /login instead
//   of a half-authenticated shell).
// - Exposes login()/logout() and the current { status, admin }.
//
// This is the AuthContext apps/web never built for itself (session.ts's
// own comment flags it as owed follow-up); the Admin Console gets it from
// the start because it is genuinely auth-gated — nothing is public.
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
  type AdminSummary,
} from "../api/adminAuth";
import { AdminApiError, installAdminAuthBridge } from "../api/adminClient";
import {
  clearAdminSession,
  getAdminAccessToken,
  getAdminRefreshToken,
  storeAdminSession,
} from "../lib/adminSession";

export type AdminAuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AdminAuthContextValue {
  status: AdminAuthStatus;
  admin: AdminSummary | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>("loading");
  const [admin, setAdmin] = useState<AdminSummary | null>(null);
  // Mirror of what's in storage so the bridge callbacks (which fire from
  // outside React) always act on the current values.
  const sessionEndedRef = useRef(false);

  const endSession = useCallback(() => {
    sessionEndedRef.current = true;
    clearAdminSession();
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    installAdminAuthBridge({
      getAccessToken: () => getAdminAccessToken(),
      getRefreshToken: () => getAdminRefreshToken(),
      onTokensRotated: (tokens) => storeAdminSession(tokens),
      onAuthLost: () => endSession(),
    });
    return () => installAdminAuthBridge(null);
  }, [endSession]);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!getAdminAccessToken()) {
        if (!cancelled) setStatus("unauthenticated");
        return;
      }
      try {
        const profile = await getAdminProfile();
        if (cancelled) return;
        setAdmin(profile);
        setStatus("authenticated");
      } catch (err) {
        if (cancelled) return;
        // A 401 here means the access token was invalid AND refresh
        // failed (adminFetch already tried). Any other error (network,
        // 500) — treat the token as still potentially good rather than
        // logging the operator out over a transient blip; they'll hit a
        // real 401 on the next call if it's genuinely dead.
        if (err instanceof AdminApiError && err.status === 401) {
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
    sessionEndedRef.current = false;
    storeAdminSession({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    setAdmin(result.admin);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getAdminRefreshToken();
    const accessToken = getAdminAccessToken();
    if (refreshToken) {
      await adminLogout(refreshToken, accessToken);
    }
    clearAdminSession();
    setAdmin(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ status, admin, login, logout }),
    [status, admin, login, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  return ctx;
}
