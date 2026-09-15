// Shared helpers for the Media admin screens (Build Plan Section 4.8,
// backed by sprint-5/admin-media-storage-backend). Mirrors
// pages/content/adminContentShared.tsx's / pages/moderation/moderationShared.tsx's
// own per-module-copy convention (see those files' own header comments)
// rather than importing across page families.
import { useCallback, useEffect, useState } from "react";
import { AdminApiError } from "../../api/adminClient";

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// MediaAsset has no stored filename column (Decision Log candidate, see
// media/README.md) — the last URL path segment (a UUID plus a
// sanitized copy of the original filename, per media.service.ts's own
// buildMediaKey) is the closest thing to a display "Name" this data
// actually has.
export function displayNameFromUrl(url: string): string {
  const segments = url.split("/");
  return segments[segments.length - 1] || url;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = -1;
  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);
  return `${value.toFixed(1)} ${units[unitIndex]}`;
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
