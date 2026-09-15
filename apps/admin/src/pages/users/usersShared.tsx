// Shared helpers for the Users admin screen (Build Plan Section 4.8,
// backed by sprint-5/admin-users-dashboard-backend). Mirrors
// pages/content/adminContentShared.tsx's / pages/moderation/
// moderationShared.tsx's own per-page-family-copy convention (see those
// files' own header comments) rather than importing across page
// families — this file has only one consumer (UsersPage.tsx) today, but
// the convention is kept for consistency with every other admin section.
import { useCallback, useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetcher()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof AdminApiError ? err.message : "Something went wrong. Please try again.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  return { data, loading, error, reload };
}
