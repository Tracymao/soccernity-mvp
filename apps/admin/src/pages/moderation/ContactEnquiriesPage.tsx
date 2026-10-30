// Contact enquiries -- the third tab of the Moderation Queue (B-046 part B; Decision Log #444, #445).
// Figma Admin Contact Enquiries Tab list 6876:30850, empty 6876:31297, load error 6876:31513.
// Route /moderation/contact-enquiries, reached from the Moderation Queue's tab row.
//
// Real data: GET /admin/contact-enquiries?status=&category= (moderator / superadmin), newest first, keyset
// cursor ("Load more"). The list carries no message text; the message is on the detail page.
//
// Where the frames and the server differ (the server wins; listed in the PR):
//  * The frame's tab reads "Contact enquiries (3)". The server returns no total and no count endpoint exists, and
//    the two existing tabs ("Open Reports", "Appeals") carry no count either, so no count is drawn.
//  * The Category filter offers the six Contact Us categories (Technical issues, Editorial Complaints, Data,
//    Suggestions, Enquiries, Feedback). The frame draws the field with no option list.
//  * Open Reports and Appeals are state tabs on the queue page, not routes; here they are links back to it.
import { type FormEvent, useState } from "react";
import { Link } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import {
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  CONTACT_ENQUIRY_STATUSES,
  contactCategoryLabel,
  listContactEnquiries,
  type ContactCategory,
  type ContactEnquiryListItem,
  type ContactEnquiryStatus,
} from "../../api/contactEnquiries";
import { EnquiryStatusPill, submitterLabel } from "./contactEnquiryShared";
import { formatShortDate, useAsyncData } from "./moderationShared";
import "./moderation.css";

const STATUS_LABELS: Record<ContactEnquiryStatus, string> = { new: "New", handled: "Handled" };

function EnquiryRow({ item }: { item: ContactEnquiryListItem }) {
  return (
    <div className="ce-table__row" role="row">
      <span role="cell">{formatShortDate(item.createdAt)}</span>
      <span className="ce-cell--name" role="cell" title={item.name}>
        {item.name}
      </span>
      <span role="cell" title={item.email}>
        {item.email}
      </span>
      <span role="cell">{contactCategoryLabel(item.category)}</span>
      <span role="cell" title={item.subject}>
        {item.subject}
      </span>
      <span role="cell">
        <EnquiryStatusPill status={item.status} />
      </span>
      <span role="cell">{submitterLabel(item.submitter)}</span>
      <span role="cell">
        {item.hasEscalation ? <span className="mod-pill mod-pill--plain mod-pill--outline">Escalated</span> : null}
      </span>
      <span role="cell">
        <Link
          className="mod-btn mod-btn--outline mod-btn--sm"
          to={`/moderation/contact-enquiries/${item.id}`}
          aria-label={`Open enquiry from ${item.name}: ${item.subject}`}
        >
          Open
        </Link>
      </span>
    </div>
  );
}

export default function ContactEnquiriesPage() {
  // What the two fields show now, and what the list was last asked for (Apply filter copies one to the other).
  const [draftStatus, setDraftStatus] = useState<ContactEnquiryStatus | "">("");
  const [draftCategory, setDraftCategory] = useState<ContactCategory | "">("");
  const [applied, setApplied] = useState<{ status?: ContactEnquiryStatus; category?: ContactCategory }>({});

  const { data, loading, error, reload } = useAsyncData(
    () => listContactEnquiries({ ...applied, limit: 50 }),
    [applied],
  );
  const [extraItems, setExtraItems] = useState<ContactEnquiryListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);

  const items = data ? [...data.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : (data?.nextCursor ?? null);

  function handleApply(event: FormEvent) {
    event.preventDefault();
    setExtraItems([]);
    setCursor(null);
    setLoadMoreError(false);
    setApplied({
      ...(draftStatus ? { status: draftStatus } : {}),
      ...(draftCategory ? { category: draftCategory } : {}),
    });
  }

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const page = await listContactEnquiries({ ...applied, cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      setLoadMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Moderation Queue" hideSearch />
      <div className="mod-page">
        <div className="mod-tabs">
          <Link className="mod-tab" to="/moderation">
            Open Reports
          </Link>
          <Link className="mod-tab" to="/moderation?tab=appeals">
            Appeals
          </Link>
          <span className="mod-tab mod-tab--active" aria-current="page">
            Contact enquiries
          </span>
        </div>

        <form className="mod-card hi-filter" onSubmit={handleApply} noValidate>
          <div className="hi-filter__row">
            <div className="hi-field">
              <label className="hi-field__label" htmlFor="ce-status">
                Status
              </label>
              <div className="hi-field__box">
                <select
                  id="ce-status"
                  value={draftStatus}
                  onChange={(event) => setDraftStatus(event.target.value as ContactEnquiryStatus | "")}
                  aria-describedby="ce-status-help"
                >
                  <option value="">All</option>
                  {CONTACT_ENQUIRY_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hi-field__help" id="ce-status-help">
                New, handled or all.
              </p>
            </div>
            <div className="hi-field">
              <label className="hi-field__label" htmlFor="ce-category">
                Category
              </label>
              <div className="hi-field__box">
                <select
                  id="ce-category"
                  value={draftCategory}
                  onChange={(event) => setDraftCategory(event.target.value as ContactCategory | "")}
                  aria-describedby="ce-category-help"
                >
                  <option value="">All</option>
                  {CONTACT_CATEGORIES.map((value) => (
                    <option key={value} value={value}>
                      {CONTACT_CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hi-field__help" id="ce-category-help">
                Any category from the Contact Us form.
              </p>
            </div>
            <button type="submit" className="mod-btn mod-btn--primary" disabled={loading}>
              Apply filter
            </button>
          </div>
        </form>

        {loading && !data ? <p className="mod-loading">Loading the contact enquiries…</p> : null}

        {error ? (
          <div className="mod-callout mod-callout--alert" role="alert">
            <span className="mod-callout__bar" aria-hidden />
            <div>
              <p className="ce-banner__title">Couldn’t load the contact enquiries</p>
              <p>
                Check the connection and try again.{" "}
                <button type="button" className="mod-link" onClick={reload}>
                  Retry
                </button>
              </p>
            </div>
          </div>
        ) : null}

        {!error && data && items.length === 0 ? (
          <div className="mod-card hi-empty" role="status">
            <h2 className="hi-empty__title">No contact enquiries</h2>
            <p className="mod-note">Messages sent through the Contact Us form will appear here.</p>
          </div>
        ) : null}

        {!error && items.length > 0 ? (
          <div className="mod-table" role="table" aria-label="Contact enquiries">
            <div className="ce-table__row mod-table__row--head" role="row">
              <span role="columnheader">Received</span>
              <span role="columnheader">Name</span>
              <span role="columnheader">Email</span>
              <span role="columnheader">Category</span>
              <span role="columnheader">Subject</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Flags</span>
              <span role="columnheader">Action</span>
            </div>
            {items.map((item) => (
              <EnquiryRow key={item.id} item={item} />
            ))}
          </div>
        ) : null}

        {loadMoreError ? (
          <p className="mod-error" role="alert">
            Couldn’t load more enquiries. Try again.
          </p>
        ) : null}

        {!error && effectiveCursor ? (
          <button type="button" className="mod-btn mod-btn--outline mod-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
