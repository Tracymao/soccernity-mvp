// Friction step for the pre-publication sensitive-content screen (Decision
// Log "Pre-publication sensitive-content screen (Russmedia obligation)").
// Shown when POST /teams or POST /fixtures answers 422
// "sensitive_content_review_required": nothing was saved, and the person
// chooses -- edit what they wrote, or confirm and share it publicly anyway.
// No silent removal, no blocking without recourse. Styled as the existing
// green-tint callout with navy actions (no red: no destructive colour token,
// non-negotiable #3).
//
// The copy is the founder-specified sentence; the field list names WHICH
// inputs were flagged (the server returns field names only, never the text).
import type { SensitiveFieldFlag } from "../../api/grassroots";

const FIELD_LABELS: Record<string, string> = {
  name: "Team name",
  city: "City",
  opponentName: "Opponent name",
  venue: "Venue",
};

export function flaggedFieldLabels(flags: SensitiveFieldFlag[]): string[] {
  return flags.map((f) => FIELD_LABELS[f.field] ?? f.field);
}

interface Props {
  flags: SensitiveFieldFlag[];
  busy: boolean;
  onEdit: () => void;
  onConfirm: () => void;
}

export default function SensitiveContentWarning({ flags, busy, onEdit, onConfirm }: Props) {
  const labels = flaggedFieldLabels(flags);
  return (
    <div className="grassroots-callout" role="alertdialog" aria-labelledby="gr-sensitive-title">
      <p className="grassroots-callout__title" id="gr-sensitive-title">
        This looks like it may mention something sensitive about someone — are you sure you want to share this
        publicly?
      </p>
      <p className="grassroots-callout__body">
        {labels.length > 0 ? <>Flagged: {labels.join(", ")}. </> : null}
        What you submit here appears on a public page. Please check it doesn&rsquo;t reveal health, religion,
        ethnicity, sexuality or similar details about a named person. Nothing has been saved yet.
      </p>
      <button type="button" className="grassroots-btn grassroots-btn--secondary" onClick={onEdit} disabled={busy}>
        Edit what I wrote
      </button>
      <button type="button" className="grassroots-btn grassroots-btn--primary" onClick={onConfirm} disabled={busy}>
        {busy ? "Publishing…" : "Share anyway"}
      </button>
    </div>
  );
}
