// Held investigations (B-045; Decision Log #398 D1, #403 item 8, #376). Figma
// "Admin Held Investigations" 6647:23351, with Empty 6647:23603 and Validation
// 6647:23831. Route /moderation/held-investigations, reached from the Moderation
// Queue's tab row.
//
// Real data: GET /admin/users/held-investigations?olderThanDays= (moderator /
// superadmin). The "Held more than N days" pill is the threshold the server
// answered with, so it is right even when no filter was applied and the server's
// configured default is not 90.
//
// Visibility only: nothing on this page acts on an account, and the held user is
// never told anything.
//
// Lift hold: the ACTION column (Figma 6647:23351) carries "Lift hold" on a row whose
// item has a holdId (an admin hold: legal hold or bad faith), and "—" on the rest (a
// hold derived from a report has nothing to lift). It opens the shared Lift hold
// confirmation (holdActions.tsx, Figma 6672:27420) with a required reason and lifts
// that ACCOUNT's hold; the list is read again afterwards.
//
// NOT BUILT (the frames and the server disagree; listed in the PR):
//  * Loading and load-error states: no frame draws them, so they reuse the queue's
//    own loading line and error line.
//  * Two hold types the server can return, appeal_window and post_closure, have no
//    marker in the frames; they show as a plain outline pill with the type spelled
//    out.
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import { listHeldInvestigations, type HeldInvestigation } from "../../api/adminUsers";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { LiftHoldDialog } from "./holdActions";
import { formatShortDate, useAsyncData, VettingRestrictedNotice } from "./moderationShared";
import "./moderation.css";

const DAYS_MIN = 0;
const DAYS_MAX = 3650;
const DAYS_INVALID = "Enter a whole number from 0 to 3650.";

/** "6b1f5f2e-4b3a-…-2f7c1a8d4e10" -> "6b1f5f2e…2f7c1a8d" (first and last 8). */
function shortId(id: string): string {
  return id.length > 17 ? `${id.slice(0, 8)}…${id.slice(-8)}` : id;
}

function spellOut(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ") : value;
}

// The marker pills the frames draw: Open report and Reporter acted in bad faith are
// the soft pill, Legal hold the strong one.
function HoldTypeMarker({ holdType }: { holdType: string }) {
  if (holdType === "open_report") return <span className="mod-pill mod-pill--plain mod-pill--soft">Open report</span>;
  if (holdType === "legal_hold") return <span className="mod-pill mod-pill--plain mod-pill--strong">Legal hold</span>;
  if (holdType === "bad_faith") {
    return <span className="mod-pill mod-pill--plain mod-pill--soft">Reporter acted in bad faith</span>;
  }
  return <span className="mod-pill mod-pill--plain mod-pill--outline">{spellOut(holdType)}</span>;
}

function HeldRow({ item, onLift }: { item: HeldInvestigation; onLift: (item: HeldInvestigation) => void }) {
  return (
    <div className="hi-table__row" role="row">
      <span className="mod-cell--primary hi-name" role="cell" title={item.displayName}>
        {item.displayName}
      </span>
      <span role="cell" title={item.email}>
        {item.email}
      </span>
      <span role="cell" title={item.userId}>
        {shortId(item.userId)}
      </span>
      <span role="cell">{formatShortDate(item.heldSince)}</span>
      <span role="cell">{item.daysHeld}</span>
      <span role="cell">
        <HoldTypeMarker holdType={item.holdType} />
      </span>
      <span role="cell">
        {item.holdId ? (
          <button
            type="button"
            className="mod-btn mod-btn--outline mod-btn--sm"
            aria-label={`Lift hold for ${item.displayName}`}
            onClick={() => onLift(item)}
          >
            Lift hold
          </button>
        ) : (
          <span className="mod-cell--primary">—</span>
        )}
      </span>
    </div>
  );
}

export default function HeldInvestigationsPage() {
  // The days the list was last asked for; undefined = the server's default.
  const [applied, setApplied] = useState<number | undefined>(undefined);
  // null until the admin types: then the field shows the threshold the server used.
  const [typed, setTyped] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsyncData(() => listHeldInvestigations(applied), [applied]);
  const [lifting, setLifting] = useState<HeldInvestigation | null>(null);
  const [restricted, setRestricted] = useState(false);

  const input = typed ?? (data ? String(data.thresholdDays) : "");

  function handleApply(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    const days = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!Number.isInteger(days) || days < DAYS_MIN || days > DAYS_MAX) {
      setInputError(DAYS_INVALID);
      return;
    }
    setInputError(null);
    setApplied(days);
  }

  const errorId = "hi-days-error";
  const items = data?.items ?? [];

  return (
    <>
      <AdminPageHeader title="Held investigations" hideSearch />
      <div className="mod-page">
        <div className="hi-page-title">
          {data ? (
            <span className="mod-pill mod-pill--plain mod-pill--strong">Held more than {data.thresholdDays} days</span>
          ) : null}
          <Link className="mod-btn mod-btn--outline mod-btn--sm" to="/moderation">
            Back to moderation
          </Link>
        </div>

        <form className="mod-card hi-filter" onSubmit={handleApply} noValidate>
          <div className="hi-filter__row">
            <div className="hi-field">
              <label className="hi-field__label" htmlFor="hi-days">
                Held for more than
              </label>
              <div className="hi-field__box" data-invalid={inputError ? "true" : undefined}>
                <input
                  id="hi-days"
                  inputMode="numeric"
                  value={input}
                  onChange={(event) => setTyped(event.target.value)}
                  aria-invalid={inputError ? true : undefined}
                  aria-describedby={inputError ? `hi-days-help ${errorId}` : "hi-days-help"}
                />
                <span className="hi-field__unit">days</span>
              </div>
              <p className="hi-field__help" id="hi-days-help">
                Whole days, 0 to 3650. Default 90.
              </p>
              {inputError ? (
                <p className="hi-field__error" id={errorId} role="alert">
                  {inputError}
                </p>
              ) : null}
            </div>
            <button type="submit" className="mod-btn mod-btn--primary" disabled={loading}>
              Apply filter
            </button>
          </div>
          <p className="mod-note">
            Visibility only. A held account stays fully identifiable and login-blocked while an open report is against
            it, by it or on content it wrote. There is no auto-timeout and no automatic action.
          </p>
        </form>

        {restricted ? <VettingRestrictedNotice /> : null}

        {loading && !data ? <p className="mod-loading">Loading the held investigations…</p> : null}
        {error ? (
          <p className="mod-error" role="alert">
            Couldn’t load the held investigations. Check the connection and try again.{" "}
            <button type="button" className="mod-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!error && data && items.length === 0 ? (
          <div className="mod-card hi-empty" role="status">
            <h2 className="hi-empty__title">No held investigations</h2>
            <p className="mod-note">
              No account has been held by an open report for more than {data.thresholdDays} days.
            </p>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div className="mod-table" role="table" aria-label="Held investigations">
            <div className="hi-table__row mod-table__row--head" role="row">
              <span role="columnheader">User</span>
              <span role="columnheader">Email</span>
              <span role="columnheader">User ID</span>
              <span role="columnheader">Held since</span>
              <span role="columnheader">Days held</span>
              <span role="columnheader">Hold type</span>
              <span role="columnheader">Action</span>
            </div>
            {items.map((item) => (
              <HeldRow
                key={item.userId}
                item={item}
                onLift={(row) => {
                  setRestricted(false);
                  setLifting(row);
                }}
              />
            ))}
          </div>
        ) : null}

        {lifting && lifting.holdId ? (
          <LiftHoldDialog
            type={lifting.holdType}
            reportId={lifting.reportId}
            holdIds={[lifting.holdId]}
            onLifted={() => reload()}
            onClose={() => setLifting(null)}
            onRestricted={() => {
              setLifting(null);
              setRestricted(true);
            }}
          />
        ) : null}
      </div>
    </>
  );
}
