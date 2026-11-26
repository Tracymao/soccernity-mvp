// Page loader (Decision Log #581): code-only.
// The thin bar at the top of the window. A "navigation window" opens on the
// first load and whenever the path or query changes. Only requests that start
// inside the window count, so background polling never shows the bar.

import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { getInFlight, getMark, subscribe } from "./activity";
import "./loading.css";

export const SHOW_DELAY_MS = 120;
export const QUIET_MS = 150;
export const MAX_WINDOW_MS = 10_000;

type Phase = "idle" | "loading" | "done";

export default function RouteProgressBar() {
  const { pathname, search } = useLocation();
  const [phase, setPhaseState] = useState<Phase>("idle");
  const phaseRef = useRef<Phase>("idle");

  // A layout effect, so the window is open before any page effect starts a request.
  useLayoutEffect(() => {
    const setPhase = (next: Phase) => {
      phaseRef.current = next;
      setPhaseState(next);
    };
    // A bar still showing from the last page stays up; a finished one resets.
    if (phaseRef.current === "done") setPhase("idle");

    const mark = getMark();
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let capTimer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe = () => {};

    const stop = () => {
      clearTimeout(showTimer);
      clearTimeout(quietTimer);
      clearTimeout(capTimer);
      unsubscribe();
    };
    const close = () => {
      stop();
      if (phaseRef.current === "loading") setPhase("done");
    };
    const check = () => {
      if (getInFlight(mark) > 0) {
        clearTimeout(quietTimer);
        quietTimer = undefined;
        if (phaseRef.current !== "loading" && showTimer === undefined) {
          showTimer = setTimeout(() => {
            showTimer = undefined;
            if (getInFlight(mark) > 0) setPhase("loading");
          }, SHOW_DELAY_MS);
        }
      } else if (quietTimer === undefined) {
        quietTimer = setTimeout(close, QUIET_MS);
      }
    };

    unsubscribe = subscribe(check);
    capTimer = setTimeout(close, MAX_WINDOW_MS);
    check();
    return stop;
  }, [pathname, search]);

  return (
    <div
      className="sn-route-progress"
      data-phase={phase}
      role="progressbar"
      aria-label="Loading page"
      aria-hidden={phase !== "loading"}
    />
  );
}
