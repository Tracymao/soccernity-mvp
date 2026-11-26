// Page loader (Decision Log #581): code-only.
// The shared "still loading" block: a quiet spinner, with the wording kept as
// screen-reader text. The 150ms delay before anything shows is a CSS
// animation delay, so a fast load never flashes and no JavaScript timer runs.

import "./loading.css";

export type LoadingVariant = "page" | "section" | "inline";

interface LoadingStateProps {
  label?: string;
  variant?: LoadingVariant;
  className?: string;
}

export default function LoadingState({ label = "Loading", variant = "section", className }: LoadingStateProps) {
  const Tag = variant === "inline" ? "span" : "div";
  const classes = ["sn-loading", `sn-loading--${variant}`, className].filter(Boolean).join(" ");
  return (
    <Tag role="status" className={classes}>
      <span className="sn-spinner" aria-hidden="true" />
      <span className="sn-visually-hidden">{label}</span>
    </Tag>
  );
}
