// The one "removed by Soccernity" treatment (Figma M1 to M5, D1 to D4, docs/figma-content-removal-report.md
// section 1): a slashed-circle icon with navy strokes and the label in the primary text colour, Montserrat
// Medium, never italic. Deliberately not the look of "This message was deleted" (a plain, dashed,
// secondary-colour placeholder): a person removed that one, Soccernity removed this one.
//   - "bubble": a brand/green-tint pill in a chat thread (the optional `meta` is the time line under it);
//   - "row": the comment thread (icon, label, the tag on its own line, no author);
//   - "heading": the post notice for the post's author on a direct visit.
// It is a status line, not a control: nothing on it can be pressed, edited, deleted or reported. The tag the
// frames print at a smaller size is split off the string at render time, so the source string stays whole
// for the pending-copy guard.
import type { ReactNode } from "react";
import "./RemovedPlaceholder.css";

interface Props {
  /** One of the REMOVED_*_TEXT strings. */
  text: string;
  variant?: "bubble" | "row" | "heading";
  /** A line under the label inside the pill (the message time). */
  meta?: ReactNode;
  className?: string;
}

function RemovedIcon({ size }: { size: number }) {
  return (
    <svg
      className="removed-placeholder__icon"
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="7" cy="7" r="5.75" stroke="var(--sn-brand-navy)" strokeWidth="1.25" />
      <path d="M2.9 11.1L11.1 2.9" stroke="var(--sn-brand-navy)" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

export default function RemovedPlaceholder({ text, variant = "row", meta, className }: Props) {
  return (
    <div
      className={["removed-placeholder", `removed-placeholder--${variant}`, className].filter(Boolean).join(" ")}
      data-testid="removed-placeholder"
    >
      <RemovedIcon size={variant === "heading" ? 20 : 14} />
      <div className="removed-placeholder__body">
        <p className="removed-placeholder__text">
          <span className="removed-placeholder__label">{text}</span>
        </p>
        {meta && <span className="removed-placeholder__meta">{meta}</span>}
      </div>
    </div>
  );
}
