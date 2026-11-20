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
// "Remove account" (B-058, Decision Log #472) is the existing deactivate action relabelled -- PATCH
// /admin/staff/:id/status { status: "deactivated" }: the account and its history are kept and it can no longer sign in.
// The row's Delete link still points at the unbuilt Delete Role stub (there is no DELETE /admin/staff/:id).
//
// "Add Role" opens AddRolePage (B-057, POST /admin/staff, PR #340, Decision
// Log #191). "Delete Role" remains a disclosed stub: there is still no
// DELETE /admin/staff/:id. Reassigning an EXISTING admin's role, or
// setting their accountStatus, happens via "Edit".
//
// The Status column (feat/admin-staff-status, Decision Log #193) reads
// accountStatus straight off the same AdminStaffListItem this page's
// GET /admin/staff already fetches — no second request. Reassigning it
// happens on EditRolePage, not inline here.
import { Link } from "react-router";
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { listStaff, type AdminStaffListItem } from "../../api/adminStaff";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import { useAsyncData } from "./settingsShared";
import RemoveAccountDialog, { type RemoveDialogKind } from "./RemoveAccountDialog";
import "./settings.css";
import "./removeAccount.css";

interface RowProps {
  admin: AdminStaffListItem;
  /** Whether to offer Remove account at all (hidden for an admin known not to be a super admin). */
  canRemove: boolean;
  onRemove: (admin: AdminStaffListItem) => void;
}

function StaffRow({ admin, canRemove, onRemove }: RowProps) {
  const removed = admin.accountStatus === "deactivated";
  return (
    <div className={`rl-table__row${removed ? " rl-table__row--removed" : ""}`}>
      <span className="rl-name-cell">
        <span className="rl-cell--primary rl-cell--truncate" title={admin.email}>
          {admin.fullName}
        </span>
        {removed ? <span className="rl-pill rl-pill--soft rl-pill--keep-case">Removed</span> : null}
      </span>
      <span>
        <span className={`rl-pill ${admin.role === "superadmin" ? "rl-pill--strong" : "rl-pill--soft"}`}>
          {admin.role}
        </span>
      </span>
      <span>
        {/* accountStatus (Decision Log #193/feat/admin-staff-status) —
            same strong=active/soft=otherwise convention UsersPage.tsx's
            own accountStatus pill already uses. */}
        <span className={`rl-pill ${admin.accountStatus === "active" ? "rl-pill--strong" : "rl-pill--soft"}`}>
          {admin.accountStatus}
        </span>
      </span>
      <span>
        {/* twoFactorEnabled (backend/two-factor-api-codes): the word is always shown, not only the colour. */}
        <span
          className={`rl-pill rl-pill--keep-case ${admin.twoFactorEnabled ? "rl-pill--soft" : "rl-pill--neutral"}`}
        >
          {admin.twoFactorEnabled ? "On" : "Off"}
        </span>
      </span>
      <span className="rl-row-actions">
        <Link to={`/settings/roles/edit/${admin.id}`} state={{ admin }} className="rl-link">
          Edit
        </Link>
        <span aria-hidden> · </span>
        <Link to="/settings/roles/delete" className="rl-link">
          Delete
        </Link>
        {canRemove && !removed ? (
          <button
            type="button"
            className="rl-btn rl-btn--outline rl-btn--sm"
            aria-label={`Remove account: ${admin.fullName}`}
            onClick={() => onRemove(admin)}
          >
            Remove account
          </button>
        ) : null}
      </span>
    </div>
  );
}

export default function SettingsRolesPage() {
  const { data, loading, error, reload } = useAsyncData(() => listStaff({ limit: 50 }));

  const [extraItems, setExtraItems] = useState<AdminStaffListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const auth = useOptionalAdminAuth();
  // Known and not a super admin -> no Remove action (the route is super-admin only on the server). Unknown (no provider or
  // profile not loaded yet) -> offer it; the server decides.
  const callerRole = auth?.admin?.role;
  const canRemove = callerRole === undefined || callerRole === "superadmin";
  const myId = auth?.admin?.id;

  // Rows removed in this session (id -> the updated row the server returned), the dialog, and the Done banner.
  const [removedRows, setRemovedRows] = useState<Record<string, AdminStaffListItem>>({});
  const [dialog, setDialog] = useState<{ admin: AdminStaffListItem; kind: RemoveDialogKind } | null>(null);
  const [removedName, setRemovedName] = useState<string | null>(null);

  const items = (data ? [...data.items, ...extraItems] : []).map((a) => removedRows[a.id] ?? a);

  function openRemove(admin: AdminStaffListItem) {
    // Your own row: the dialog explains and never calls the server (a client rule, see RemoveAccountDialog).
    setDialog({ admin, kind: admin.id === myId ? "own" : "confirm" });
  }

  function handleRemoved(updated: AdminStaffListItem) {
    // Keep the name the admin was shown if the answer carries none.
    const name = updated.fullName || dialog?.admin.fullName || "";
    setRemovedRows((prev) => ({ ...prev, [updated.id]: { ...updated, accountStatus: "deactivated" } }));
    setRemovedName(name);
    setDialog(null);
  }
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
      <AdminPageHeader title="Roles" />
      <div className="rl-page">
        <div className="rl-action-row">
          <span aria-hidden />
          <Link to="/settings/roles/new" className="rl-btn rl-btn--primary">
            Add Role
          </Link>
        </div>

        <p className="rl-note">
          Reassigning a role takes effect the next time that admin signs in — an already-active
          session keeps its current permissions until it refreshes. Demoting the last active
          superadmin is rejected, since there would then be no way to promote anyone back.
        </p>

        {removedName ? (
          <div className="rl-callout" role="status">
            <span className="rl-callout__bar" aria-hidden />
            <div>
              <p>
                <strong>Account removed</strong>
              </p>
              <p>{removedName} can no longer sign in. Their account and history are kept.</p>
            </div>
          </div>
        ) : null}

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
              <span>Status</span>
              <span>Two-factor</span>
              <span>Actions</span>
            </div>
            {items.map((a) => (
              <StaffRow key={a.id} admin={a} canRemove={canRemove} onRemove={openRemove} />
            ))}
          </div>
        ) : null}

        {effectiveCursor && !loading ? (
          <button type="button" className="rl-btn rl-btn--outline rl-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
      {dialog ? (
        <RemoveAccountDialog
          admin={dialog.admin}
          kind={dialog.kind}
          onRemoved={handleRemoved}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
