// Shared overlay for the Bants room creator controls (B-071; Figma 6998:54845
// and 6998:54937 on mobile, 7002:55553 and 7002:56398 on desktop).
//
// Three looks, one behaviour: a centred "dialog" (Deactivate this room?), a
// bottom "sheet" (Add topics, mobile) and an anchored "popover" (Add topics,
// desktop). Behaviour is the same for all three: focus moves inside on open
// (to the element marked data-autofocus, else the first enabled control) and
// goes back to the opener on close; Escape closes unless the request is busy.
// The dialog and the sheet sit over a scrim and trap Tab; clicking the scrim
// closes (unless busy). The popover has no scrim and closes on a click outside.
import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./BanterRoomControls.css";

export type BanterModalVariant = "dialog" | "sheet" | "popover";

interface BanterModalProps {
  titleId: string;
  variant: BanterModalVariant;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), a[href]";

export default function BanterModal({ titleId, variant, busy, onClose, children }: BanterModalProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    const target = root?.querySelector<HTMLElement>("[data-autofocus]") ?? root?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus({ preventScroll: true });

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busyRef.current) {
        e.preventDefault();
        closeRef.current();
      }
    }
    function onPointerDown(e: MouseEvent) {
      if (busyRef.current || !ref.current) return;
      const t = e.target as Node;
      if (ref.current.contains(t)) return;
      // The opener ("Add topic") toggles the popover itself.
      if (t instanceof Element && t.closest("[data-banter-popover-opener]")) return;
      closeRef.current();
    }
    document.addEventListener("keydown", onKey);
    if (variant === "popover") document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
      previous?.focus?.({ preventScroll: true });
    };
  }, [variant]);

  function trapTab(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || variant === "popover") return;
    const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }

  const panel = (
    <div
      ref={ref}
      className={`banter-modal banter-modal--${variant}`}
      role="dialog"
      aria-modal={variant === "popover" ? undefined : "true"}
      aria-labelledby={titleId}
      onKeyDown={trapTab}
    >
      {children}
    </div>
  );

  if (variant === "popover") return panel;

  return createPortal(
    <div
      className={`banter-scrim banter-scrim--${variant}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      {panel}
    </div>,
    document.body,
  );
}
