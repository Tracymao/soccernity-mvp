// Small pieces the Username reviews screens share (B-139 part (c)).
import type { ReactNode } from "react";

export const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  reinstated: "Reinstated",
  declined: "Declined",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

/** Pending is the outline pill, Reinstated the green-tint one, Declined the neutral one, as the frames draw them. */
export function ReviewStatusPill({ status }: { status: string }) {
  const tone =
    status === "reinstated" ? "mod-pill--soft" : status === "declined" ? "ur-pill--neutral" : "mod-pill--outline";
  return <span className={`mod-pill mod-pill--plain ${tone}`}>{statusLabel(status)}</span>;
}

/** "Review request #1a2b3c4d": the first 8 characters of the id, as Report Detail and Enquiry Detail number theirs. */
export function requestNumber(id: string): string {
  return `#${id.slice(0, 8)}`;
}

/** A label-left, value-right row, as the frames' REMOVAL and REQUEST cards draw them. */
export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ce-kv">
      <span className="ce-kv__label">{label}</span>
      <span className="ce-kv__value">{children}</span>
    </div>
  );
}
