// The two case-level hold actions on Report Detail and Appeal Review, and the
// hold-active status row (B-045; Decision Log #398 D1, #403 item 8). Figma:
// Report Detail Bad Faith Confirm 6672:27278, Legal Hold Confirm 6672:27349,
// Legal Hold Active 6672:28898, Appeal Review Legal Hold Active 6672:29059.
//
// Both screens use these same components, so the two dialogs and their wording
// exist once. Placing a hold notifies nobody: the held user is not told, and no
// text here says otherwise.
//
// NOT BUILT (the frames and the server disagree; listed in the PR): the Lift
// hold control. The Lift hold dialog frame (6672:27420) draws no reason field,
// but a lift needs a reason of 10 to 500 characters (#403 item 8, and the server
// refuses without one). So no Lift control is rendered, here or on the held list.
import { useState } from "react";
import { type HoldView, placeBadFaithHold, placeLegalHold, type Report } from "../../api/moderation";
import HoldDialog from "./HoldDialog";
import { formatShortDate } from "./moderationShared";

/** Adds newly placed holds to a report's active holds (a hold already listed is kept once). */
export function mergeHolds(current: HoldView[] | undefined, placed: HoldView[]): HoldView[] {
  const known = new Set((current ?? []).map((h) => h.id));
  return [...(current ?? []), ...placed.filter((h) => !known.has(h.id))];
}

type PlacingHold = "bad_faith" | "legal_hold" | null;

/** "Report #1a2b3c4d" -- the same short id the screens use in their headings. */
function reportNumber(report: Pick<Report, "id">): string {
  return report.id.slice(0, 8);
}

export function CaseLevelHoldButtons({
  report,
  onPlaced,
  onRestricted,
}: {
  report: Pick<Report, "id">;
  onPlaced: (holds: HoldView[]) => void;
  onRestricted: () => void;
}) {
  const [placing, setPlacing] = useState<PlacingHold>(null);

  async function placeBadFaith(reason: string) {
    const { holds } = await placeBadFaithHold(report.id, reason);
    setPlacing(null);
    onPlaced(holds);
  }

  async function placeLegal(reason: string) {
    const { holds } = await placeLegalHold(report.id, reason);
    setPlacing(null);
    onPlaced(holds);
  }

  function restricted() {
    setPlacing(null);
    onRestricted();
  }

  return (
    <>
      <button type="button" className="mod-btn mod-btn--primary" onClick={() => setPlacing("bad_faith")}>
        Reporter acted in bad faith
      </button>
      <button type="button" className="mod-btn mod-btn--primary" onClick={() => setPlacing("legal_hold")}>
        Legal hold
      </button>

      {placing === "bad_faith" ? (
        <HoldDialog
          title="Reporter acted in bad faith"
          intro={<>Report #{reportNumber(report)}. This holds the reporter’s account in full for 6 months. [COPY PENDING LEGAL REVIEW]</>}
          reasonHelp="The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]"
          confirmLabel="Confirm bad faith"
          submittingLabel="Saving…"
          onSubmit={placeBadFaith}
          onClose={() => setPlacing(null)}
          onRestricted={restricted}
        />
      ) : null}
      {placing === "legal_hold" ? (
        <HoldDialog
          title="Legal hold"
          intro={<>Report #{reportNumber(report)}. This holds both accounts in full until an admin lifts it. [COPY PENDING LEGAL REVIEW]</>}
          reasonHelp="The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]"
          confirmLabel="Place legal hold"
          submittingLabel="Saving…"
          onSubmit={placeLegal}
          onClose={() => setPlacing(null)}
          onRestricted={restricted}
        />
      ) : null}
    </>
  );
}

/** The drawn callout under the case-level actions (alert-tone bar, as the frame draws it). */
export function CaseLevelHoldCallout() {
  return (
    <div className="mod-callout mod-callout--alert">
      <span className="mod-callout__bar" aria-hidden />
      <p>
        Reporter acted in bad faith holds the reporter’s account in full for 6 months. Legal hold holds both accounts in
        full until an admin lifts it. Both ask for confirmation first. [COPY PENDING LEGAL REVIEW]
      </p>
    </div>
  );
}

// The marker pills the held list draws: Legal hold is the strong (navy) pill, the
// bad-faith one the soft pill. Same labels as the list.
const HOLD_MARKERS: Record<string, { label: string; strong: boolean }> = {
  legal_hold: { label: "Legal hold", strong: true },
  bad_faith: { label: "Reporter acted in bad faith", strong: false },
};

/**
 * The hold-active row ("HOLD", marker, "Active since ..."). One row per hold type: a
 * legal hold covers two accounts, but the frame draws one marker for it. The
 * bad-faith row has no frame of its own; it reuses the same row with its list
 * marker, and its expiry is not shown (nothing draws one).
 */
export function HoldStatus({ holds }: { holds: HoldView[] | undefined }) {
  if (!holds || holds.length === 0) return null;
  const byType = new Map<string, HoldView>();
  for (const hold of holds) {
    const existing = byType.get(hold.type);
    if (!existing || hold.placedAt < existing.placedAt) byType.set(hold.type, hold);
  }
  const rows = [...byType.values()].filter((hold) => HOLD_MARKERS[hold.type]);
  if (rows.length === 0) return null;
  return (
    <div className="mod-hold-status" aria-label="Active holds">
      {rows.map((hold) => {
        const marker = HOLD_MARKERS[hold.type];
        return (
          <div className="mod-hold-status__row" key={hold.type}>
            <span className="mod-field__label">Hold</span>
            <span className={`mod-pill mod-pill--plain ${marker.strong ? "mod-pill--strong" : "mod-pill--soft"}`}>
              {marker.label}
            </span>
            <span className="mod-hold-status__since">Active since {formatShortDate(hold.placedAt)}</span>
          </div>
        );
      })}
    </div>
  );
}
