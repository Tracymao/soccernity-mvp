// Small pieces the Suspected illegal imagery screens share (B-206). No Figma frame exists for these screens.
import type { ReactNode } from "react";
import { statusLabel } from "../../api/suspectedIllegal";

/** Not filed (still needs a decision) is the strong pill, Filed the soft green one, Decided-not-to-file the neutral one. */
export function RecordStatusPill({ status }: { status: string }) {
  const tone = status === "set_aside" ? "mod-pill--strong" : status === "filed" ? "mod-pill--soft" : "si-pill--neutral";
  return <span className={`mod-pill mod-pill--plain ${tone}`}>{statusLabel(status)}</span>;
}

export function kindLabel(kind: string): string {
  if (kind === "image") return "Picture";
  if (kind === "video") return "Video";
  if (kind === "profile_avatar") return "Profile picture";
  if (kind === "profile_cover") return "Cover photo";
  return kind;
}

/** "Record #1a2b3c4d": the first 8 characters of the id, as the other moderation screens number theirs. */
export function recordNumber(id: string): string {
  return `#${id.slice(0, 8)}`;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ce-kv">
      <span className="ce-kv__label">{label}</span>
      <span className="ce-kv__value">{children}</span>
    </div>
  );
}
