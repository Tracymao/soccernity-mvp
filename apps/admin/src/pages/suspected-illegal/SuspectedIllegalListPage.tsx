// Suspected illegal imagery -- the list (B-206; backend PR #800, GET /admin/suspected-illegal-media). NO Figma frame
// exists: this reuses the Username reviews list pattern (status filter with Apply, a table, "Load more", empty,
// loading and error states). Route /moderation/suspected-illegal, reached from the Media review page.
//
// Only a child-safety-vetted moderator or superadmin may read it. The server decides: a non-vetted admin gets the
// coded 403 child_safety_vetting_required (the existing restricted notice is shown); any other 403 is a role refusal
// (an editor). The client applies no rule of its own. Records are newest first; a record still waiting for a filing
// decision ("Not filed") has the strong pill and a navy bar on its left edge so it is not missed.
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { isChildSafetyVettingRequiredError } from "../../api/moderation";
import {
  listSuspectedIllegal,
  type SuspectedIllegalPage,
  type SuspectedIllegalRecord,
  type SuspectedIllegalStatus,
} from "../../api/suspectedIllegal";
import { VettingRestrictedNotice, formatShortDate, useAsyncData } from "../moderation/moderationShared";
import { RecordStatusPill, kindLabel } from "./suspectedIllegalShared";
import "../moderation/moderation.css";
import "../media-review/suspectedIllegal.css";

type StatusChoice = "all" | SuspectedIllegalStatus;

const CHOICES: { value: StatusChoice; label: string }[] = [
  { value: "all", label: "All" },
  { value: "set_aside", label: "Not filed" },
  { value: "filed", label: "Filed" },
  { value: "not_filed", label: "Decided not to file" },
];

const EMPTY_TITLES: Record<StatusChoice, string> = {
  all: "No records.",
  set_aside: "No records are waiting for a filing decision.",
  filed: "No filed records.",
  not_filed: "No records decided as not to file.",
};

type Refusal = "vetting" | "role";
type Result = { page: SuspectedIllegalPage; refused?: undefined } | { page?: undefined; refused: Refusal };

function toStatus(choice: StatusChoice): SuspectedIllegalStatus | undefined {
  return choice === "all" ? undefined : choice;
}

async function fetchPage(status: StatusChoice, cursor?: string): Promise<Result> {
  try {
    return { page: await listSuspectedIllegal({ status: toStatus(status), cursor, limit: 50 }) };
  } catch (err) {
    if (isChildSafetyVettingRequiredError(err)) return { refused: "vetting" };
    if (err instanceof AdminApiError && err.status === 403) return { refused: "role" };
    throw err;
  }
}

function RecordRow({ record }: { record: SuspectedIllegalRecord }) {
  const open = record.status === "set_aside";
  return (
    <div className={`si-table__row${open ? " si-table__row--open" : ""}`} role="row">
      <span role="cell">{formatShortDate(record.setAsideAt)}</span>
      <span role="cell">{kindLabel(record.kind)}</span>
      <span role="cell">
        <RecordStatusPill status={record.status} />
      </span>
      <span role="cell">{formatShortDate(record.preserveUntil)}</span>
      <span role="cell">
        <Link
          className="mod-btn mod-btn--outline mod-btn--sm"
          to={`/moderation/suspected-illegal/${encodeURIComponent(record.id)}`}
          state={{ record }}
          aria-label={`Open the ${kindLabel(record.kind).toLowerCase()} record flagged on ${formatShortDate(record.setAsideAt)}`}
        >
          Open
        </Link>
      </span>
    </div>
  );
}

export default function SuspectedIllegalListPage() {
  const [draft, setDraft] = useState<StatusChoice>("all");
  const [applied, setApplied] = useState<StatusChoice>("all");

  const { data, loading, error, reload } = useAsyncData(() => fetchPage(applied), [applied]);
  const [extraItems, setExtraItems] = useState<SuspectedIllegalRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const page = data?.page;
  const items = page ? [...page.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : (page?.nextCursor ?? null);

  function handleApply(event: FormEvent) {
    event.preventDefault();
    setExtraItems([]);
    setCursor(null);
    setLoadMoreError(false);
    setApplied(draft);
  }

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const next = await fetchPage(applied, effectiveCursor);
      if (!next.page) throw new Error("refused");
      setExtraItems((prev) => [...prev, ...next.page.items]);
      setCursor(next.page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Suspected illegal imagery" />
      <div className="mod-page">
        <div className="media-heading">
          <Link className="mod-link" to="/moderation/media">
            ← Media review
          </Link>
        </div>
        <p className="mod-note">
          Files a child-safety-vetted moderator has set aside. Each record is kept for the set-aside period. A report to
          a receiving body is made outside Soccernity; this list only tracks whether that was recorded.
        </p>

        <form className="mod-card hi-filter" onSubmit={handleApply} noValidate>
          <div className="hi-filter__row">
            <div className="hi-field">
              <label className="hi-field__label" htmlFor="si-status">
                Status
              </label>
              <div className="hi-field__box">
                <select id="si-status" value={draft} onChange={(event) => setDraft(event.target.value as StatusChoice)}>
                  {CHOICES.map((choice) => (
                    <option key={choice.value} value={choice.value}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="mod-btn mod-btn--primary" disabled={loading}>
              Apply filter
            </button>
          </div>
        </form>

        {loading && !data ? <p className="mod-loading">Loading the records…</p> : null}

        {data?.refused === "vetting" ? <VettingRestrictedNotice /> : null}
        {data?.refused === "role" ? (
          <div className="mod-card mod-card--restricted" role="alert">
            <h2 className="mod-card__title">You don’t have access to these records</h2>
            <p className="mod-note">Only moderators and super admins can open this list.</p>
          </div>
        ) : null}

        {error ? (
          <>
            <div className="mod-callout mod-callout--alert" role="alert">
              <span className="mod-callout__bar" aria-hidden />
              <div>
                <p className="ce-banner__title">Couldn’t load the records</p>
                <p>Check the connection and try again.</p>
              </div>
            </div>
            <div>
              <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={reload}>
                Retry
              </button>
            </div>
          </>
        ) : null}

        {!error && page && items.length === 0 ? (
          <div className="mod-card hi-empty" role="status">
            <h2 className="hi-empty__title">{EMPTY_TITLES[applied]}</h2>
            <p className="mod-note">A record appears here when a file is set aside as suspected illegal imagery.</p>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div className="mod-table" role="table" aria-label="Suspected illegal imagery records">
            <div className="si-table__row mod-table__row--head" role="row">
              <span role="columnheader">Flagged</span>
              <span role="columnheader">Kind</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Kept until</span>
              <span role="columnheader">Action</span>
            </div>
            {items.map((record) => (
              <RecordRow key={record.id} record={record} />
            ))}
          </div>
        ) : null}

        {loadMoreError ? (
          <p className="mod-error" role="alert">
            Couldn’t load more records. Try again.
          </p>
        ) : null}

        {!error && effectiveCursor ? (
          <div>
            <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
