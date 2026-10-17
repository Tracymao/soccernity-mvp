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

// B-103: the correction reason is stored verbatim in the audit log, which never
// holds a date of birth, and the server does not enforce that -- so the form
// refuses anything shaped like a full date (see CorrectDobPage.tsx).
const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december";
const DATE_SHAPES: RegExp[] = [
  /\b\d{4}-\d{1,2}-\d{1,2}\b/, // 2005-09-04
  /\b\d{1,2}\s*[/.-]\s*\d{1,2}\s*[/.-]\s*\d{2,4}\b/, // 04/09/2005, 4 - 9 - 05
  new RegExp(`\\b\\d{1,2}(st|nd|rd|th)?\\s+(${MONTHS})\\.?,?\\s+\\d{2,4}\\b`, "i"), // 4 Sep 2005
  new RegExp(`\\b(${MONTHS})\\.?\\s+\\d{1,2}(st|nd|rd|th)?,?\\s+\\d{2,4}\\b`, "i"), // Sep 4, 2005
];

/** True when the reason contains something shaped like a full date. */
export function reasonHasDate(reason: string): boolean {
  return DATE_SHAPES.some((shape) => shape.test(reason));
}
