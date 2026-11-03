// Audit log / My activity (Decision Log #464, option B) -- Figma frames "Audit log" list 6939:39109, empty
// 6940:38937, loading 6940:39127, load error 6940:39356 (superadmin) and "My activity" list 6939:39539, empty
// 6940:39550, loading 6940:39724, load error 6940:39925 (every other admin). Route /activity; the nav row is shown
// to every role.
//
// Real data: GET /admin/action-log (backend/admin-action-log-read), newest first, keyset cursor ("Load more").
//
// The SERVER does the scoping. A superadmin is sent every row; any other admin is sent only their own actions; rows
// about a minor or a guardian notice are left out of the query for an admin who is not child-safety vetted. This
// page enforces no rule of its own. The role is read only to pick which of the two Figma variants to draw:
//   superadmin   title "Audit log", an ACTOR column, and an Actor filter;
//   anyone else  title "My activity", no ACTOR column, no Actor filter (every row is the admin's own).
// An unknown role is drawn as "anyone else", so the safer layout is the fallback.
//
// A row the server leaves out is simply absent. Nothing here says rows are missing: the empty state reads
// "No activity yet" and never mentions hidden rows.
//
// Where the frames and the server differ (listed in the PR):
//  * The frames draw the Action dropdown with no option list. There is no endpoint that lists the action kinds, so
//    the list is a client copy (api/adminActionLog.ts), with the child-safety kinds left out of the dropdown for an
//    admin who is not child-safety vetted (display only; the server filters the rows).
//  * The frames draw no filtered-empty state; a filtered search with no rows says "No matching activity".
//  * The frames' sample Actor and Target show names ("Dayo Adeleke", "nelson_k"). The server returns the actor's
//    display name, but only an id for the target, so a target is shown as "<Type> #<first 8 characters>".
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  ACTION_KINDS,
  ACTION_LOG_DATE_INVALID_CODE,
  ACTION_LOG_RANGE_INVALID_CODE,
  CHILD_SAFETY_ACTION_KINDS,
  actionLabel,
  actionLogErrorCode,
  listActionLog,
  targetPath,
  targetTypeLabel,
  type ActionLogItem,
  type ActionLogPage,
} from "../../api/adminActionLog";
import { listStaff, type AdminStaffListItem } from "../../api/adminStaff";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import { formatDateTime } from "../moderation/moderationShared";
import "../moderation/moderation.css";
import "./activity.css";

const PAGE_SIZE = 20;
// The Actor dropdown reads the staff list; a handful of pages is far more admins than exist.
const STAFF_PAGES_MAX = 5;

interface Applied {
  action?: string;
  adminId?: string;
  from?: string;
  to?: string;
}

function targetText(item: ActionLogItem): string {
  if (item.targetType === "search") return "Email search";
  return `${targetTypeLabel(item.targetType)} #${item.targetId.slice(0, 8)}`;
}

function ActivityRow({ item, showActor }: { item: ActionLogItem; showActor: boolean }) {
  const path = targetPath(item.targetType, item.targetId);
  return (
    <div className="al-row" role="row">
      <span role="cell">{formatDateTime(item.createdAt)}</span>
      {showActor ? (
        <span role="cell" title={item.actor.displayName}>
          {item.actor.displayName}
        </span>
      ) : null}
      <span role="cell">{actionLabel(item.action)}</span>
      <span role="cell">{targetTypeLabel(item.targetType)}</span>
      <span role="cell">
        {path ? (
          <Link className="al-target" to={path}>
            {targetText(item)}
          </Link>
        ) : (
          <span className="al-target al-target--plain">{targetText(item)}</span>
        )}
      </span>
      <span className="al-notes" role="cell">
        {item.notes ?? "—"}
      </span>
    </div>
  );
}

function Skeleton({ showActor, label }: { showActor: boolean; label: string }) {
  const columns = showActor ? 6 : 5;
  return (
    <div className="mod-table al-table" role="status" aria-label={label} data-actor={showActor ? "true" : "false"}>
      <div className="al-row mod-table__row--head" aria-hidden>
        {Array.from({ length: columns }, (_, i) => (
          <span key={i} className="al-skeleton al-skeleton--head" />
        ))}
      </div>
      {[0, 1, 2, 3, 4].map((row) => (
        <div className="al-row" key={row} aria-hidden>
          {Array.from({ length: columns }, (_, i) => (
            <span key={i} className="al-skeleton" />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function AuditLogPage() {
  const auth = useOptionalAdminAuth();
  const admin = auth?.admin ?? null;
  const isSuperadmin = admin?.role === "superadmin";
  const vetted = admin?.childSafetyVetted === true;
  const title = isSuperadmin ? "Audit log" : "My activity";
  const errorTitle = isSuperadmin ? "Couldn’t load the audit log" : "Couldn’t load your activity";

  const [draft, setDraft] = useState<Applied>({});
  const [applied, setApplied] = useState<Applied>({});
  const [dateError, setDateError] = useState<string | null>(null);

  // The first page for the applied filter. Own state, not useAsyncData, because a coded 400 needs the thrown error.
  const [data, setData] = useState<ActionLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailure(null);
    listActionLog({ ...applied, limit: PAGE_SIZE })
      .then((page) => {
        if (!cancelled) setData(page);
      })
      .catch((err: unknown) => {
        if (!cancelled) setFailure(err ?? new Error("failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applied, nonce]);
  const [extraItems, setExtraItems] = useState<ActionLogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  // The Actor dropdown (superadmin only): everyone on the staff list.
  const [staff, setStaff] = useState<AdminStaffListItem[]>([]);
  useEffect(() => {
    if (!isSuperadmin) return;
    let cancelled = false;
    (async () => {
      const all: AdminStaffListItem[] = [];
      let next: string | undefined;
      try {
        for (let page = 0; page < STAFF_PAGES_MAX; page += 1) {
          const result = await listStaff({ limit: 50, cursor: next });
          all.push(...result.items);
          if (!result.nextCursor) break;
          next = result.nextCursor;
        }
      } catch {
        // The dropdown simply offers "All admins" only; the log itself is unaffected.
      }
      if (!cancelled) setStaff(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin]);

  const items = data ? [...data.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : (data?.nextCursor ?? null);
  const filtered = Object.values(applied).some(Boolean);
  const actionOptions = ACTION_KINDS.filter((kind) => vetted || !CHILD_SAFETY_ACTION_KINDS.includes(kind.value));

  function handleApply(event: FormEvent) {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setDateError("The end date can’t be before the start date.");
      return;
    }
    setDateError(null);
    setData(null);
    setExtraItems([]);
    setCursor(null);
    setLoadMoreError(false);
    setApplied({
      ...(draft.action ? { action: draft.action } : {}),
      ...(isSuperadmin && draft.adminId ? { adminId: draft.adminId } : {}),
      ...(draft.from ? { from: draft.from } : {}),
      ...(draft.to ? { to: draft.to } : {}),
    });
  }

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await listActionLog({ ...applied, cursor: effectiveCursor, limit: PAGE_SIZE });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // A 400 on the dates (bad date, end before start) is shown on the filter, by code; any other failure is the
  // ordinary load error.
  const code =
    failure instanceof AdminApiError && failure.status === 400 ? actionLogErrorCode(failure.body) : null;
  const badDates = code === ACTION_LOG_DATE_INVALID_CODE || code === ACTION_LOG_RANGE_INVALID_CODE;
  const showError = failure !== null && !badDates;
  const showTable = !showError && items.length > 0;
  const filterError = badDates ? "Check the dates and try again." : null;

  return (
    <>
      <AdminPageHeader title={title} />
      <div className="mod-page">
        <form className="mod-card hi-filter" onSubmit={handleApply} noValidate aria-label="Filter the activity">
          <div className="hi-filter__row">
            <div className="hi-field al-field">
              <label className="hi-field__label" htmlFor="al-action">
                Action kind
              </label>
              <div className="hi-field__box">
                <select
                  id="al-action"
                  value={draft.action ?? ""}
                  onChange={(event) => setDraft({ ...draft, action: event.target.value || undefined })}
                  aria-describedby="al-action-help"
                >
                  <option value="">All actions</option>
                  {actionOptions.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hi-field__help" id="al-action-help">
                Kind of action.
              </p>
            </div>
            {isSuperadmin ? (
              <div className="hi-field al-field">
                <label className="hi-field__label" htmlFor="al-actor">
                  Actor
                </label>
                <div className="hi-field__box">
                  <select
                    id="al-actor"
                    value={draft.adminId ?? ""}
                    onChange={(event) => setDraft({ ...draft, adminId: event.target.value || undefined })}
                    aria-describedby="al-actor-help"
                  >
                    <option value="">All admins</option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.fullName}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="hi-field__help" id="al-actor-help">
                  Who did it.
                </p>
              </div>
            ) : null}
            <div className="hi-field al-field">
              <label className="hi-field__label" htmlFor="al-from">
                From
              </label>
              <div className="hi-field__box" data-invalid={dateError ? "true" : undefined}>
                <input
                  id="al-from"
                  type="date"
                  value={draft.from ?? ""}
                  onChange={(event) => setDraft({ ...draft, from: event.target.value || undefined })}
                  aria-describedby="al-from-help"
                />
              </div>
              <p className="hi-field__help" id="al-from-help">
                Start of range.
              </p>
            </div>
            <div className="hi-field al-field">
              <label className="hi-field__label" htmlFor="al-to">
                To
              </label>
              <div className="hi-field__box" data-invalid={dateError ? "true" : undefined}>
                <input
                  id="al-to"
                  type="date"
                  value={draft.to ?? ""}
                  onChange={(event) => setDraft({ ...draft, to: event.target.value || undefined })}
                  aria-describedby="al-to-help"
                />
              </div>
              <p className="hi-field__help" id="al-to-help">
                End of range.
              </p>
            </div>
            <button type="submit" className="mod-btn mod-btn--primary" disabled={loading}>
              Apply filter
            </button>
          </div>
          {dateError || filterError ? (
            <p className="hi-field__error" role="alert">
              {dateError ?? filterError}
            </p>
          ) : null}
        </form>

        {loading && !data ? (
          <Skeleton showActor={isSuperadmin} label={isSuperadmin ? "Loading the audit log" : "Loading your activity"} />
        ) : null}

        {showError ? (
          <div className="mod-callout mod-callout--alert" role="alert">
            <span className="mod-callout__bar" aria-hidden />
            <div>
              <p className="ce-banner__title">{errorTitle}</p>
              <p>
                Check the connection and try again.{" "}
                <button type="button" className="mod-link" onClick={reload}>
                  Retry
                </button>
              </p>
            </div>
          </div>
        ) : null}

        {!showError && data && items.length === 0 ? (
          <div className="mod-card hi-empty" role="status">
            <h2 className="hi-empty__title">{filtered ? "No matching activity" : "No activity yet"}</h2>
            <p className="mod-note">
              {filtered
                ? "Try a different filter."
                : isSuperadmin
                  ? "Actions taken by admins will appear here."
                  : "Your actions will appear here."}
            </p>
          </div>
        ) : null}

        {showTable ? (
          <div
            className="mod-table al-table"
            role="table"
            aria-label={title}
            data-actor={isSuperadmin ? "true" : "false"}
          >
            <div className="al-row mod-table__row--head" role="row">
              <span role="columnheader">Time</span>
              {isSuperadmin ? <span role="columnheader">Actor</span> : null}
              <span role="columnheader">Action</span>
              <span role="columnheader">Target type</span>
              <span role="columnheader">Target</span>
              <span role="columnheader">Notes</span>
            </div>
            {items.map((item) => (
              <ActivityRow key={item.id} item={item} showActor={isSuperadmin} />
            ))}
          </div>
        ) : null}

        {loadMoreError ? (
          <p className="mod-error" role="alert">
            Couldn’t load more activity. Try again.
          </p>
        ) : null}

        {!showError && effectiveCursor ? (
          <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
