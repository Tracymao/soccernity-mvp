// Shared helpers for the Moderation admin screens (Figma nodes
// 5794:8635 / 5796:8635 / 5796:8753 — Decision Log #135/#189, backed by
// sprint-5/admin-moderation-queue-backend). Mirrors
// pages/contest/contestShared.tsx's own per-module-copy convention (see
// that file's own header comment) rather than importing across page
// families.
import { useCallback, useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  );
}

export function targetLabel(targetType: string): string {
  if (targetType === "post") return "Post";
  if (targetType === "comment") return "Comment";
  if (targetType === "user") return "User";
  return targetType;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  errorStatus: number | null;
  reload: () => void;
}

export function useAsyncData<T>(fetcher: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    fetcher()
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Couldn’t load the moderation queue.");
          setErrorStatus(err instanceof AdminApiError ? err.status : null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [...deps, nonce]);

  return { data, loading, error, errorStatus, reload };
}
