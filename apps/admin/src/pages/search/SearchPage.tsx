// Admin search results (B-114, Decision Log #463) -- Figma frames "Admin — Search — 1 Idle" 6927:35930, "4
// Submitting" 6927:36374, "5 Query too short" 6927:36526, "7/8 Results" 6928:36566 / 6928:36772, "9 A group at its
// cap" 6928:37148, "10 No results" 6928:37372, "11 Load error" 6928:37497, "12 Results as an editor" 6928:37621.
//
// Route: /search?q=<text>. The query lives in the URL. The server's answer is shown as it is:
//   - a group the role cannot open is ABSENT from the response and is not drawn (no "not allowed" wording);
//   - a group with no match is present and empty and is not drawn either (the frames draw no empty groups);
//   - the page never works out a role rule, and never renders a field the server does not return. The frames'
//     MATCHED ON, REASON, SOURCE, UPLOADER and TWO-FACTOR columns have no field behind them in the response, so
//     they are not drawn (see the PR description).
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import AdminSearchBar from "../../components/search/AdminSearchBar";
import { AdminApiError } from "../../api/adminClient";
import {
  ADMIN_SEARCH_MIN_LENGTH,
  ADMIN_SEARCH_QUERY_INVALID_CODE,
  ADMIN_SEARCH_QUERY_TOO_LONG_CODE,
  ADMIN_SEARCH_QUERY_TOO_SHORT_CODE,
  SEARCH_GROUP_ORDER,
  adminSearch,
  searchErrorCode,
  type AdminSearchResult,
  type SearchArticleHit,
  type SearchContactEnquiryHit,
  type SearchGroup,
  type SearchGroupKey,
  type SearchMediaHit,
  type SearchReportHit,
  type SearchStaffHit,
  type SearchUserHit,
} from "../../api/adminSearch";
import { contactCategoryLabel } from "../../api/contactEnquiries";
import { formatShortDate, severityLabel, targetLabel } from "../moderation/moderationShared";
import "./search.css";

type View =
  | { kind: "idle" }
  | { kind: "too_short" }
  | { kind: "too_long" }
  | { kind: "invalid" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "results"; result: AdminSearchResult };

// ---------------------------------------------------------------------------------------------------------------
// small presentational pieces
// ---------------------------------------------------------------------------------------------------------------

type PillTone = "neutral" | "positive" | "alert" | "outline";

function Pill({ tone = "neutral", children }: { tone?: PillTone; children: ReactNode }) {
  return (
    <span className={`se-pill se-pill--${tone}`}>
      {tone === "alert" ? <span className="se-pill__dot" aria-hidden /> : null}
      {children}
    </span>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Banner({
  title,
  body,
  tone = "neutral",
}: {
  title: string;
  body: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`se-banner se-banner--${tone}`} role={tone === "error" ? "alert" : "status"}>
      <span className="se-banner__bar" aria-hidden />
      <div className="se-banner__text">
        <p className="se-banner__title">{title}</p>
        <p className="se-banner__body">{body}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// one group: a heading with its count, then a card of rows
// ---------------------------------------------------------------------------------------------------------------

interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
}

interface GroupDef<T> {
  title: string;
  /** CSS grid template name (search.css). */
  grid: string;
  columns: Column<T>[];
  /** Plain name of a row, for the accessible name of its action. */
  rowName: (item: T) => string;
  linkTo: (item: T) => string;
  actionLabel: string;
  /** The wording under a capped group's last row. */
  moreMatches: string;
}

const MORE_GENERIC = "More matches are not shown. Use a longer or more exact search.";

const usersDef: GroupDef<SearchUserHit> = {
  title: "Users",
  grid: "users",
  columns: [
    {
      key: "name",
      header: "Username",
      render: (u) => (
        <span className="se-cell--strong se-cell--truncate">
          {u.displayName}
          {u.username ? ` (@${u.username})` : ""}
        </span>
      ),
    },
    { key: "joined", header: "Date joined", render: (u) => formatShortDate(u.createdAt) },
    {
      key: "status",
      header: "Status",
      render: (u) => (
        <Pill tone={u.accountStatus === "active" ? "positive" : u.accountStatus === "suspended" ? "alert" : "outline"}>
          {capitalise(u.accountStatus)}
        </Pill>
      ),
    },
  ],
  rowName: (u) => u.displayName,
  linkTo: (u) => `/users/${u.id}`,
  actionLabel: "Open",
  moreMatches: "More matches are not shown. Use a longer start to the username, the full email address or the user ID.",
};

const reportsDef: GroupDef<SearchReportHit> = {
  title: "Reports",
  grid: "reports",
  columns: [
    { key: "id", header: "Report", render: (r) => <span className="se-cell--strong">#{r.id.slice(0, 8)}</span> },
    {
      key: "type",
      header: "Type",
      render: (r) => (r.source === "contact_enquiry" ? "Contact enquiry" : targetLabel(r.targetType)),
    },
    { key: "status", header: "Status", render: (r) => <Pill tone="outline">{capitalise(r.status)}</Pill> },
    { key: "severity", header: "Severity", render: (r) => severityLabel(r.severity) },
    {
      key: "flags",
      header: "Flags",
      render: (r) => (r.concernsMinor ? <Pill tone="neutral">Concerns a minor</Pill> : <span aria-hidden>—</span>),
    },
  ],
  rowName: (r) => `report ${r.id.slice(0, 8)}`,
  linkTo: (r) => `/moderation/reports/${r.id}`,
  actionLabel: "Review",
  moreMatches: MORE_GENERIC,
};

const contactEnquiriesDef: GroupDef<SearchContactEnquiryHit> = {
  title: "Contact enquiries",
  grid: "enquiries",
  columns: [
    { key: "received", header: "Received", render: (e) => formatShortDate(e.createdAt) },
    { key: "name", header: "Name", render: (e) => <span className="se-cell--strong se-cell--truncate">{e.name}</span> },
    { key: "category", header: "Category", render: (e) => contactCategoryLabel(e.category) },
    { key: "subject", header: "Subject", render: (e) => <span className="se-cell--truncate">{e.subject}</span> },
    {
      key: "status",
      header: "Status",
      render: (e) => (
        <span className="se-cell--stack">
          <Pill tone={e.status === "handled" ? "positive" : "neutral"}>{capitalise(e.status)}</Pill>
          {e.hasEscalation ? <Pill tone="outline">Escalated</Pill> : null}
        </span>
      ),
    },
  ],
  rowName: (e) => e.subject,
  linkTo: (e) => `/moderation/contact-enquiries/${e.id}`,
  actionLabel: "Open",
  moreMatches: MORE_GENERIC,
};

const articlesDef: GroupDef<SearchArticleHit> = {
  title: "Articles",
  grid: "articles",
  columns: [
    { key: "date", header: "Date", render: (a) => formatShortDate(a.createdAt) },
    {
      key: "title",
      header: "Title",
      render: (a) => <span className="se-cell--strong se-cell--truncate">{a.title}</span>,
    },
    { key: "category", header: "Category", render: (a) => a.category?.name ?? "—" },
    {
      key: "status",
      header: "Status",
      render: (a) => <Pill tone={a.status === "published" ? "positive" : "neutral"}>{capitalise(a.status)}</Pill>,
    },
  ],
  rowName: (a) => a.title,
  // There is no article detail screen; the Articles list is where an article is managed.
  linkTo: () => "/articles",
  actionLabel: "Open",
  moreMatches: MORE_GENERIC,
};

const STAFF_ROLE_LABELS: Record<string, string> = { editor: "Editor", moderator: "Moderator", superadmin: "Super Admin" };

const staffDef: GroupDef<SearchStaffHit> = {
  title: "Staff",
  grid: "staff",
  columns: [
    {
      key: "name",
      header: "Name",
      render: (s) => <span className="se-cell--strong se-cell--truncate">{s.fullName}</span>,
    },
    { key: "email", header: "Email", render: (s) => <span className="se-cell--truncate">{s.email}</span> },
    { key: "role", header: "Role", render: (s) => STAFF_ROLE_LABELS[s.role] ?? capitalise(s.role) },
    {
      key: "status",
      header: "Status",
      render: (s) => (
        <Pill tone={s.accountStatus === "active" ? "positive" : "outline"}>{capitalise(s.accountStatus)}</Pill>
      ),
    },
  ],
  rowName: (s) => s.fullName,
  linkTo: (s) => `/settings/roles/edit/${s.id}`,
  actionLabel: "Open",
  moreMatches: MORE_GENERIC,
};

const mediaDef: GroupDef<SearchMediaHit> = {
  title: "Media review",
  grid: "media",
  columns: [
    {
      key: "type",
      header: "Type",
      render: (m) => <span className="se-cell--strong">{m.kind === "video" ? "Video" : "Picture"}</span>,
    },
    { key: "status", header: "Status", render: (m) => <Pill tone="outline">{capitalise(m.status)}</Pill> },
    { key: "reports", header: "Reports", render: (m) => String(m.reportCount) },
    { key: "uploaded", header: "Uploaded", render: (m) => formatShortDate(m.createdAt) },
  ],
  rowName: (m) => `${m.kind === "video" ? "video" : "picture"} ${m.id.slice(0, 8)}`,
  linkTo: (m) => `/moderation/media/${m.id}`,
  actionLabel: "Review",
  moreMatches: MORE_GENERIC,
};

function SearchGroupSection<T extends { id: string }>({ def, group }: { def: GroupDef<T>; group: SearchGroup<T> }) {
  const count = group.items.length;
  return (
    <section className="se-group" aria-label={def.title} data-group={def.grid}>
      <div className="se-group__heading">
        <h2 className="se-group__title">{def.title}</h2>
        <span className="se-pill" aria-label={`${count}${group.truncated ? " or more" : ""} results`}>
          {group.truncated ? `${count}+` : count}
        </span>
        {group.truncated ? (
          <span className="se-group__note">Showing the first {count}. Refine your search to narrow it down.</span>
        ) : null}
      </div>
      <div className={`se-card se-card--${def.grid}`} role="table" aria-label={def.title}>
        <div className="se-row se-row--head" role="row">
          {def.columns.map((column) => (
            <span key={column.key} role="columnheader">
              {column.header}
            </span>
          ))}
          <span aria-hidden />
        </div>
        {group.items.map((item) => (
          <div className="se-row" role="row" key={item.id}>
            {def.columns.map((column) => (
              <span key={column.key} role="cell" className="se-cell">
                {column.render(item)}
              </span>
            ))}
            <span role="cell" className="se-cell se-cell--action">
              <Link
                className="se-btn"
                to={def.linkTo(item)}
                aria-label={`${def.actionLabel} ${def.rowName(item)}`}
              >
                {def.actionLabel}
              </Link>
            </span>
          </div>
        ))}
        {group.truncated ? <p className="se-more">{def.moreMatches}</p> : null}
      </div>
    </section>
  );
}

function renderGroup(key: SearchGroupKey, result: AdminSearchResult): ReactNode {
  const { groups } = result;
  switch (key) {
    case "users":
      return groups.users?.items.length ? <SearchGroupSection key={key} def={usersDef} group={groups.users} /> : null;
    case "reports":
      return groups.reports?.items.length ? (
        <SearchGroupSection key={key} def={reportsDef} group={groups.reports} />
      ) : null;
    case "contactEnquiries":
      return groups.contactEnquiries?.items.length ? (
        <SearchGroupSection key={key} def={contactEnquiriesDef} group={groups.contactEnquiries} />
      ) : null;
    case "articles":
      return groups.articles?.items.length ? (
        <SearchGroupSection key={key} def={articlesDef} group={groups.articles} />
      ) : null;
    case "staff":
      return groups.staff?.items.length ? <SearchGroupSection key={key} def={staffDef} group={groups.staff} /> : null;
    case "media":
      return groups.media?.items.length ? <SearchGroupSection key={key} def={mediaDef} group={groups.media} /> : null;
  }
}

// What the server returned, counted from the response itself (it sends no totals).
function summarise(result: AdminSearchResult): { total: number; groups: number; capped: boolean } {
  let total = 0;
  let groups = 0;
  let capped = false;
  for (const key of SEARCH_GROUP_ORDER) {
    const group = result.groups[key] as SearchGroup<unknown> | undefined;
    if (group && group.items.length > 0) {
      total += group.items.length;
      groups += 1;
      if (group.truncated) capped = true;
    }
  }
  return { total, groups, capped };
}

function Skeleton() {
  return (
    <div className="se-group" aria-hidden>
      <div className="se-skeleton se-skeleton--heading" />
      <div className="se-card">
        {[0, 1, 2].map((row) => (
          <div className="se-skeleton__row" key={row}>
            <span className="se-skeleton" style={{ width: 220 }} />
            <span className="se-skeleton" style={{ width: 140 }} />
            <span className="se-skeleton" style={{ width: 180 }} />
            <span className="se-skeleton" style={{ width: 260 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Results({ query, result }: { query: string; result: AdminSearchResult }) {
  const { total, groups, capped } = summarise(result);
  const count = `${total}${capped ? "+" : ""}`;
  return (
    <div className="se-body">
      <div className="se-summary" role="status">
        <p className="se-summary__title">Results for “{query}”</p>
        <p className="se-summary__count">
          {groups === 0
            ? "0 results"
            : `${count} ${total === 1 && !capped ? "result" : "results"} in ${groups} ${groups === 1 ? "group" : "groups"}`}
        </p>
      </div>
      {groups === 0 ? (
        <Banner
          title="No results"
          body="Nothing matched. Check the spelling, or try the full email address, a user ID or a report ID."
        />
      ) : (
        SEARCH_GROUP_ORDER.map((key) => renderGroup(key, result))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// the page
// ---------------------------------------------------------------------------------------------------------------

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const rawQuery = params.get("q") ?? "";
  const query = rawQuery.trim();
  const [view, setView] = useState<View>({ kind: "idle" });
  const [nonce, setNonce] = useState(0);
  // A later search must win over an earlier, slower one.
  const latest = useRef(0);

  const rerun = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    const ticket = ++latest.current;
    if (query === "") {
      setView({ kind: "idle" });
      return;
    }
    if (query.length < ADMIN_SEARCH_MIN_LENGTH) {
      setView({ kind: "too_short" });
      return;
    }
    setView({ kind: "loading" });
    adminSearch(query)
      .then((result) => {
        if (ticket === latest.current) setView({ kind: "results", result });
      })
      .catch((err: unknown) => {
        if (ticket !== latest.current) return;
        const code = err instanceof AdminApiError && err.status === 400 ? searchErrorCode(err.body) : null;
        if (code === ADMIN_SEARCH_QUERY_TOO_SHORT_CODE) setView({ kind: "too_short" });
        else if (code === ADMIN_SEARCH_QUERY_TOO_LONG_CODE) setView({ kind: "too_long" });
        else if (code === ADMIN_SEARCH_QUERY_INVALID_CODE) setView({ kind: "invalid" });
        else setView({ kind: "error" });
      });
  }, [query, nonce]);

  function handleSubmit(next: string) {
    if (next === query) rerun();
    else setParams({ q: next });
  }

  return (
    <>
      <AdminPageHeader title="Search" hideSearch />
      <div className="se-page">
        <AdminSearchBar initialQuery={rawQuery} submitting={view.kind === "loading"} onSubmit={handleSubmit} />

        {view.kind === "idle" ? (
          <section className="se-intro" aria-label="What you can search">
            <h2 className="se-intro__title">What you can search</h2>
            <p className="se-intro__body">
              Type in the bar above and press Enter. Each result opens the page you already use for it.
            </p>
          </section>
        ) : null}

        {view.kind === "too_short" ? (
          <Banner
            title="Keep typing"
            body={`Type at least ${ADMIN_SEARCH_MIN_LENGTH} characters to search. Nothing was searched.`}
          />
        ) : null}

        {view.kind === "too_long" ? (
          <Banner title="That search is too long" body="Shorten it and search again. Nothing was searched." />
        ) : null}

        {view.kind === "invalid" ? (
          <Banner
            title="That search can’t be used"
            body="It contains characters that can’t be searched. Remove them and try again."
          />
        ) : null}

        {view.kind === "loading" ? (
          <div className="se-body" role="status" aria-live="polite">
            <p className="se-summary__title">Searching for “{query}”…</p>
            <Skeleton />
            <Skeleton />
          </div>
        ) : null}

        {view.kind === "error" ? (
          <div className="se-body">
            <Banner title="Couldn’t run the search" body="Check the connection and try again." tone="error" />
            <div>
              <button type="button" className="se-btn" onClick={rerun}>
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {view.kind === "results" ? <Results query={query} result={view.result} /> : null}
      </div>
    </>
  );
}
