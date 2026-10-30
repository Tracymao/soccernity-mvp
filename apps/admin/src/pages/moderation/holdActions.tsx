// The two case-level hold actions on Report Detail and Appeal Review, and the
// hold-active status row (B-045; Decision Log #398 D1, #403 item 8). Figma:
// Report Detail Bad Faith Confirm 6672:27278, Legal Hold Confirm 6672:27349,
// Legal Hold Active 6672:28898, Appeal Review Legal Hold Active 6672:29059.
//
// Both screens use these same components, so the two dialogs and their wording
// exist once. Placing a hold notifies nobody: the held user is not told, and no
// text here says otherwise.
//
// Lift hold (B-045, built here): the control on the hold-active row, and the same
// confirmation dialog for the held list (HeldInvestigationsPage). Figma Lift Hold
// Confirm 6672:27420, with the required reason (#403 item 8); Legal Hold Active
// 6672:28898, Appeal Review Legal Hold Active 6672:29059, Bad Faith Hold Active
// 6870:30620 / 6870:30808 (the 6-month hold shows its end date).
//
// One hold is one ACCOUNT's hold: a legal hold on a report with two accounts is two
// holds, and the server lifts one per call. On Report Detail and Appeal Review the
// single drawn row stands for the whole case, so its Lift hold lifts every active
// hold of that type on the report (the drawn sentence says "both accounts"); the held
// list names one account, so its Lift hold lifts that account's hold only.
import { useRef, useState } from "react";
import { type HoldView, liftHold, placeBadFaithHold, placeLegalHold, type Report } from "../../api/moderation";
import HoldDialog from "./HoldDialog";
import { formatShortDate, VettingRestrictedNotice } from "./moderationShared";

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
 * The Lift hold confirmation (Figma 6672:27420): a required reason of 10 to 500
 * characters, then PATCH .../holds/:holdId/lift for each hold given. Holds are lifted
 * one after another; if one fails, the ones already lifted are reported through
 * onLifted straight away, the dialog stays open with the server's message, and a
 * second attempt only asks for the holds still active.
 */
export function LiftHoldDialog({
  type,
  reportId,
  holdIds,
  onLifted,
  onClose,
  onRestricted,
}: {
  /** "legal_hold" or "bad_faith". */
  type: string;
  reportId: string | null;
  holdIds: string[];
  onLifted: (lifted: HoldView[]) => void;
  onClose: () => void;
  onRestricted: () => void;
}) {
  const remaining = useRef(holdIds);

  async function lift(reason: string) {
    const done: HoldView[] = [];
    try {
      while (remaining.current.length > 0) {
        const { hold } = await liftHold(remaining.current[0], reason);
        remaining.current = remaining.current.slice(1);
        done.push(hold);
      }
    } catch (err) {
      if (done.length > 0) onLifted(done);
      throw err;
    }
    onLifted(done);
    onClose();
  }

  const number = reportId ? reportId.slice(0, 8) : null;
  let intro;
  if (type === "legal_hold" && holdIds.length > 1) {
    // The drawn sentence, only where the lift really releases more than one account.
    intro = <>Report #{number}. Legal hold. Lifting the hold releases both accounts. [COPY PENDING LEGAL REVIEW]</>;
  } else {
    const label = type === "bad_faith" ? "Reporter acted in bad faith." : "Legal hold.";
    intro = number ? `Report #${number}. ${label}` : label;
  }

  return (
    <HoldDialog
      title="Lift hold"
      intro={intro}
      reasonHelp="The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]"
      confirmLabel="Lift hold"
      submittingLabel="Saving…"
      onSubmit={lift}
      onClose={onClose}
      onRestricted={onRestricted}
    />
  );
}

/**
 * The hold-active row ("HOLD", marker, "Active since ...", "Ends ..." for the 6-month
 * bad-faith hold, and Lift hold). One row per hold type: a legal hold covers two
 * accounts, but the frame draws one marker for it, and its Lift hold lifts them all.
 */
export function HoldStatus({
  holds,
  onLifted,
}: {
  holds: HoldView[] | undefined;
  onLifted: (lifted: HoldView[]) => void;
}) {
  const [lifting, setLifting] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);
  if (!holds || holds.length === 0) return null;
  const byType = new Map<string, HoldView[]>();
  for (const hold of holds) {
    if (!HOLD_MARKERS[hold.type]) continue;
    byType.set(hold.type, [...(byType.get(hold.type) ?? []), hold]);
  }
  const groups = [...byType.entries()].map(([type, list]) => ({
    type,
    list: [...list].sort((a, b) => (a.placedAt < b.placedAt ? -1 : 1)),
  }));
  if (groups.length === 0) return null;
  const active = groups.find((g) => g.type === lifting);
  return (
    <>
      <div className="mod-hold-status" aria-label="Active holds">
        {groups.map(({ type, list }) => {
          const marker = HOLD_MARKERS[type];
          const first = list[0];
          const ends = list.find((hold) => hold.expiresAt)?.expiresAt ?? null;
          return (
            <div className="mod-hold-status__row" key={type}>
              <span className="mod-field__label">Hold</span>
              <span className={`mod-pill mod-pill--plain ${marker.strong ? "mod-pill--strong" : "mod-pill--soft"}`}>
                {marker.label}
              </span>
              <span className="mod-hold-status__since">Active since {formatShortDate(first.placedAt)}</span>
              {ends ? <span className="mod-hold-status__since">Ends {formatShortDate(ends)}</span> : null}
              <button
                type="button"
                className="mod-btn mod-btn--outline mod-btn--sm"
                aria-label={`Lift hold: ${marker.label}`}
                onClick={() => {
                  setRestricted(false);
                  setLifting(type);
                }}
              >
                Lift hold
              </button>
            </div>
          );
        })}
      </div>
      {restricted ? <VettingRestrictedNotice /> : null}
      {active ? (
        <LiftHoldDialog
          type={active.type}
          reportId={active.list[0].reportId}
          holdIds={active.list.map((hold) => hold.id)}
          onLifted={onLifted}
          onClose={() => setLifting(null)}
          onRestricted={() => {
            setLifting(null);
            setRestricted(true);
          }}
        />
      ) : null}
    </>
  );
}
