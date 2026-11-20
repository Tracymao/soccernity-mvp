// Small modal for the in-session two-factor actions (regenerate backup codes, reset another admin).
// role="dialog" + aria-modal, focus moves in on open, Tab stays inside, Escape closes (unless
// `locked`, e.g. while a request is in flight or codes are on screen that cannot be shown again),
// and focus goes back to whatever opened it.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

interface Props {
  titleId: string;
  title: string;
  children: ReactNode;
  onClose: () => void;
  /** Ignore Escape / backdrop clicks. */
  locked?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function TwoFactorDialog({ titleId, title, children, onClose, locked = false }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    const node = dialogRef.current;
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape" && !locked) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const firstItem = items[0];
    const lastItem = items[items.length - 1];
    if (e.shiftKey && document.activeElement === firstItem) {
      e.preventDefault();
      lastItem.focus();
    } else if (!e.shiftKey && document.activeElement === lastItem) {
      e.preventDefault();
      firstItem.focus();
    }
  };

  return (
    <div className="tf-scrim" onKeyDown={onKeyDown}>
      <div
        ref={dialogRef}
        className="tf-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="tf-dialog__title">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
