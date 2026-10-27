// Qualified-impression detector for the Community-feed "Final week" carousel tiles (build register
// B-092; Decision Log #405 item 7, #406 item 6, docs/contest-spec.md section 10b).
//
// A tile counts as ONE impression only when at least 50% of it has been in view for at least ONE
// CONTINUOUS second. That is the whole rule, and it lives here so the number is the same wherever a
// tile is rendered:
//
//   - the timer starts when the tile first reaches >= 50% in view, and is cancelled the instant it
//     drops below 50% or the tab is hidden (a hidden tab is not "in view");
//   - when the second elapses the event fires once; the tile must then LEAVE view (< 50%) and come
//     back for another event ("re-entry counts again", #406 item 6). How many a viewer can add per
//     day is the SERVER's cap, not this hook's;
//   - nothing is sent for a tile that is scrolled past, covered, or never rendered. A tile on a
//     carousel page that is not showing is not mounted, so it is never observed.
//
// What it reports: the smallest share seen during the second (never above what was really visible),
// the elapsed milliseconds, and a fresh random event id (the server's idempotency key). Nothing
// about the viewer, the device or the position leaves the browser: the server stores none of it
// either (it checks the claim and discards it).
//
// No IntersectionObserver (an old browser, jsdom): nothing is ever reported. Not counting is the safe
// failure, and a viewer is never stopped from seeing a tile.
import { useEffect, useRef, type RefObject } from "react";

export const IMPRESSION_MIN_RATIO = 0.5;
export const IMPRESSION_MIN_MS = 1000;

export interface QualifiedImpression {
  eventId: string;
  visibleRatio: number;
  visibleMs: number;
}

export function newEventId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // RFC 4122 v4 from Math.random: an idempotency key, not a secret.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function useQualifiedImpression(
  ref: RefObject<Element | null>,
  onQualified: (impression: QualifiedImpression) => void,
  enabled = true,
): void {
  const callback = useRef(onQualified);
  callback.current = onQualified;

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof IntersectionObserver === "undefined") return;

    let ratio = 0; // the latest intersection ratio
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startedAt = 0;
    let minRatio = 1;
    let fired = false; // fired for the current "stay"; reset only when the tile leaves view

    const stop = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };

    const fire = () => {
      timer = null;
      fired = true;
      callback.current({
        eventId: newEventId(),
        visibleRatio: Math.min(1, Math.max(IMPRESSION_MIN_RATIO, minRatio)),
        visibleMs: Math.max(IMPRESSION_MIN_MS, Date.now() - startedAt),
      });
    };

    const evaluate = () => {
      const inView = ratio >= IMPRESSION_MIN_RATIO && !document.hidden;
      if (!inView) {
        stop();
        // Leaving view (or the tab hiding) re-arms the tile for its next stay.
        fired = false;
        return;
      }
      if (timer === null && !fired) {
        startedAt = Date.now();
        minRatio = ratio;
        timer = setTimeout(fire, IMPRESSION_MIN_MS);
      } else if (timer !== null) {
        minRatio = Math.min(minRatio, ratio);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        ratio = entry.isIntersecting ? entry.intersectionRatio : 0;
        evaluate();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    observer.observe(element);
    document.addEventListener("visibilitychange", evaluate);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", evaluate);
    };
  }, [ref, enabled]);
}
