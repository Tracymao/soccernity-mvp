// Name label under a desktop header icon, shown on mouse hover and on keyboard
// focus. Code-only decision, Decision Log #566 (no Figma frame draws it).
//
// Why one fixed-position label instead of a CSS ::after on each link:
// .sn-header__nav-list has overflow-x: auto, which makes overflow-y clip too, so
// an absolutely positioned label under the icons would be cut off. A single
// label with position: fixed, placed from the trigger's getBoundingClientRect(),
// sits outside every overflow box. It is aria-hidden: each control already has
// an aria-label, so the name must not be announced twice.
//
// The label text is passed in by the caller (navigation.ts for the nav icons),
// never retyped here. Hover-capable devices only: the CSS shows the label inside
// @media (hover: hover), so a tap on a touch device never leaves one stuck.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FocusEvent, MouseEvent } from "react";
import "./HeaderTip.css";

const SHOW_DELAY_MS = 150;

interface TipState {
  text: string;
  x: number;
  y: number;
}

function focusIsVisible(el: Element): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    return true;
  }
}

export function useHeaderTip(enabled: boolean) {
  const [tip, setTip] = useState<TipState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setTip(null);
  }, []);

  const show = useCallback((text: string, el: Element) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const rect = el.getBoundingClientRect();
      setTip({ text, x: rect.left + rect.width / 2, y: rect.bottom });
    }, SHOW_DELAY_MS);
  }, []);

  // Escape hides a visible label; the timer is cleared on unmount.
  useEffect(() => {
    if (!tip) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") hide();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tip, hide]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // Turning the feature off (the header went mobile) removes any label.
  useEffect(() => {
    if (!enabled) hide();
  }, [enabled, hide]);

  function bind(text: string, suppressed = false) {
    if (!enabled || suppressed) return {};
    return {
      onMouseEnter: (event: MouseEvent<HTMLElement>) => show(text, event.currentTarget),
      onMouseLeave: hide,
      onFocus: (event: FocusEvent<HTMLElement>) => {
        if (focusIsVisible(event.currentTarget)) show(text, event.currentTarget);
      },
      onBlur: hide,
    };
  }

  const node = tip ? (
    <span className="sn-header-tip" aria-hidden="true" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </span>
  ) : null;

  return { bind, hide, node };
}
