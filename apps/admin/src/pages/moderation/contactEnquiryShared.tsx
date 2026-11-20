// Small pieces the Contact enquiries screens share (B-046 part B).
import type { ReactNode } from "react";

/** "New" is the soft pill, "Handled" the strong (navy) one, as the frames draw them. */
export function EnquiryStatusPill({ status }: { status: string }) {
  const handled = status === "handled";
  return (
    <span className={`mod-pill mod-pill--plain ${handled ? "mod-pill--strong" : "mod-pill--soft"}`}>
      {handled ? "Handled" : "New"}
    </span>
  );
}

export function submitterLabel(submitter: string): string {
  return submitter === "signed_in" ? "Signed-in" : "Guest";
}

/** A label-left, value-right row, as the frames' ENQUIRY and REPORT DETAILS cards draw them. */
export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ce-kv">
      <span className="ce-kv__label">{label}</span>
      <span className="ce-kv__value">{children}</span>
    </div>
  );
}
