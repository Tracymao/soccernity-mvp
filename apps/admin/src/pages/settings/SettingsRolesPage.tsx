// Settings / Roles — Figma node 1658:2303.
//
// Real data: GET /admin/staff (Build Plan Section 4.8, built by
// feat/admin-role-management). AdminRolesGuard('superadmin') on the
// whole backend endpoint, GET included — an editor OR moderator token
// gets a real 403, so this screen (and its "Edit" destination) is only
// reachable by a superadmin token. Mirrors ModerationQueuePage.tsx's own
// real-data pattern; see admin-staff-roles/README.md for the full guard
// reasoning.
//
// "Add Role" and "Delete Role" remain disclosed stubs — per Decision Log
// #191 there is still no self-service admin/moderator account creation
// or deletion endpoint anywhere in this codebase; only reassigning an
// EXISTING admin's role (via "Edit") is real.
import { Link } from "react-router-dom";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { StubButton } from "../../components/stub/AdminStub";
import { listStaff, type AdminStaffListItem } from "../../api/adminStaff";
import { useAsyncData } from "./settingsShared";
import "./settings.css";

function StaffRow({ admin }: { admin: AdminStaffListItem }) {
  return (
    <div className="rl-table__row" key={admin.id}>
      <span className="rl-cell--primary rl-cell--truncate" title={admin.email}>
        {admin.fullName}
      </span>
      <span>
        <span className={`rl-pill ${admin.role === "superadmin" ? "rl-pill--strong" : "rl-pill--soft"}`}>
          {admin.role}
        </span>
      </span>
      <span>
        <Link to={`/settings/roles/edit/${admin.id}`} state={{ admin }} className="rl-link">
          Edit
        </Link>
        <span aria-hidden> · </span>
        <Link to="/settings/roles/delete" className="rl-link">
          Delete
        </Link>
      </span>
    </div>
  );
}

export default function SettingsRolesPage() {
  const { data, loading, error, reload } = useAsyncData(() => listStaff({ limit: 50 }));

  const [extraItems, setExtraItems] = useState<AdminStaffListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const items = data ? [...data.items, ...extraItems] : [];
  const effectiveCursor = extraItems.length > 0 ? cursor : data?.nextCursor ?? null;

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listStaff({ cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <>
      <AdminPageHeader title="Roles" hideSearch />
      <div className="rl-page">
        <div className="rl-action-row">
          <span aria-hidden />
          {/* There is no self-service admin/moderator account-creation
              endpoint (Decision Log #191) — accounts are provisioned by
              direct DB insert. Left disabled rather than inventing a
              registration path. */}
          <StubButton>Add Role</StubButton>
        </div>

        <p className="rl-note">
          Reassigning a role takes effect the next time that admin signs in — an already-active
          session keeps its current permissions until it refreshes. Demoting the last active
          superadmin is rejected, since there would then be no way to promote anyone back.
        </p>

        {loading ? <p className="rl-loading">Loading staff accounts…</p> : null}
        {error ? (
          <p className="rl-error" role="alert">
            {error}{" "}
            <button type="button" className="rl-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="rl-card">
            <h2 className="rl-card__title">No staff accounts</h2>
            <p className="rl-note">Nothing to show yet.</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="rl-table">
            <div className="rl-table__row rl-table__row--head">
              <span>Name</span>
              <span>Role</span>
              <span>Actions</span>
            </div>
            {items.map((a) => (
              <StaffRow key={a.id} admin={a} />
            ))}
          </div>
        ) : null}

        {effectiveCursor && !loading ? (
          <button type="button" className="rl-btn rl-btn--outline rl-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
