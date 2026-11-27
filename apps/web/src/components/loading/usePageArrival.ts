// Page loader (Decision Log #581): code-only.
// A soft enter animation on the page area whenever the path changes. It
// restarts a CSS class instead of keying on the location, so pages that stay
// mounted across a parameter change keep their state.

import { useLayoutEffect, useRef, type AnimationEvent } from "react";
import { useLocation } from "react-router";
import "./loading.css";

const CLASS = "sn-page-arrive";

export function usePageArrival() {
  const ref = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.classList.remove(CLASS);
    void element.offsetWidth; // forces a reflow so the animation restarts
    element.classList.add(CLASS);
  }, [pathname]);

  // The class is removed when done, so no transform lingers on the page area
  // (it would change how fixed-position children are placed).
  const onAnimationEnd = (event: AnimationEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.classList.remove(CLASS);
  };

  return { ref, onAnimationEnd };
}
