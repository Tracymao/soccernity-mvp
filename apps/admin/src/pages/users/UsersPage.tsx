// Users — Figma node 917:218 ("Users - team members").
//
// Real data: GET/PATCH /admin/users (Build Plan Section 4.8, built by
// sprint-5/admin-users-dashboard-backend). This is the platform-user
// list (status, block, delete) — NOT admin/moderator role management
// (Decision Log #142). AdminRolesGuard('moderator', 'superadmin') on the
// whole backend endpoint — an editor token gets a real 403, so this
// screen is only reachable by a moderator/superadmin token (mirrors
// ModerationQueuePage.tsx's own role split, not ArticlesPage.tsx's).
//
// "Username" column — the Figma stub's own header — is bound to
// displayName, not a username: User has no username column anywhere in
// this codebase (Decision Log #58). Flagged here rather than silently
// mismatched or renamed away from the Figma-derived label.
import { useState } from "react";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import {
  listUsers,
  updateUserStatus,
  type AdminUserListItem,
  type AdminUserFilterStatus,
} from "../../api/adminUsers";
import { StubButton } from "../../components/stub/AdminStub";
import { formatDate, useAsyncData } from "./usersShared";
import "./users.css";

type Tab = "all" | "active" | "suspended";

function UserRow({
  user,
  onChanged,
  onDeleted,
}: {
  user: AdminUserListItem;
  onChanged: (updated: AdminUserListItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rowError, setRowError] = useState<string | null>(null);
  const isSuspended = user.accountStatus === "suspended";

  async function handleBlockToggle() {
    setRowError(null);
    setBusy(true);
    try {
      const result = await updateUserStatus(user.id, isSuspended ? "active" : "suspended");
      if (!result.deleted) onChanged(result.user);
    } catch (err) {
      setRowError(err instanceof AdminApiError ? err.message : "Couldn't update this user.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConfirmed() {
    setRowError(null);
    setBusy(true);
    try {
      await updateUserStatus(user.id, "deleted");
      onDeleted(user.id);
    } catch (err) {
      setRowError(err instanceof AdminApiError ? err.message : "Couldn't delete this user.");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="us-table__row" key={user.id}>
      <span className="us-cell--primary us-cell--truncate" title={user.email}>
        {user.displayName}
      </span>
      <span className="us-cell--secondary">{formatDate(user.createdAt)}</span>
      <span>
        <span className={`us-pill ${user.accountStatus === "active" ? "us-pill--strong" : "us-pill--soft"}`}>
          {user.accountStatus}
        </span>
      </span>
      <span className="us-actions">
        {confirmingDelete ? (
          <div className="us-confirm">
            <span>Delete this user? This cannot be undone.</span>
            <button type="button" className="us-btn us-btn--primary" onClick={handleDeleteConfirmed} disabled={busy}>
              {busy ? "Deleting…" : "Confirm delete"}
            </button>
            <button
              type="button"
              className="us-btn us-btn--outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="us-actions__row">
            <button type="button" className="us-btn us-btn--outline" onClick={handleBlockToggle} disabled={busy}>
              {busy ? "Updating…" : isSuspended ? "Unblock" : "Block"}
            </button>
            <button
              type="button"
              className="us-btn us-btn--outline"
              onClick={() => setConfirmingDelete(true)}
              disabled={busy}
            >
              Delete
            </button>
          </div>
        )}
        {rowError ? (
          <p className="us-error us-row-error" role="alert">
            {rowError}
          </p>
        ) : null}
      </span>
    </div>
  );
}

export default function UsersPage() {
  const [tab, setTab] = useState<Tab>("all");
  const filter: AdminUserFilterStatus | undefined = tab === "all" ? undefined : tab;
  const { data, loading, error, reload } = useAsyncData(() => listUsers({ status: filter, limit: 50 }), [filter]);

  const [extraItems, setExtraItems] = useState<AdminUserListItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, AdminUserListItem>>({});
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const baseItems = data ? [...data.items, ...extraItems] : [];
  const items = baseItems
    .filter((u) => !removedIds.has(u.id))
    .map((u) => overrides[u.id] ?? u);
  const effectiveCursor = extraItems.length > 0 ? cursor : data?.nextCursor ?? null;

  async function loadMore() {
    if (!effectiveCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listUsers({ status: filter, cursor: effectiveCursor, limit: 50 });
      setExtraItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  function switchTab(next: Tab) {
    setTab(next);
    setExtraItems([]);
    setOverrides({});
    setRemovedIds(new Set());
    setCursor(null);
  }

  return (
    <>
      <AdminPageHeader title="Users" hideSearch />
      <div className="us-page">
        <div className="us-action-row">
          <div className="us-tabs">
            <button type="button" className={`us-tab ${tab === "all" ? "us-tab--active" : ""}`} onClick={() => switchTab("all")}>
              All
            </button>
            <button
              type="button"
              className={`us-tab ${tab === "active" ? "us-tab--active" : ""}`}
              onClick={() => switchTab("active")}
            >
              Active
            </button>
            <button
              type="button"
              className={`us-tab ${tab === "suspended" ? "us-tab--active" : ""}`}
              onClick={() => switchTab("suspended")}
            >
              Suspended
            </button>
          </div>
          {/* Section 4.8 defines no admin-user-creation endpoint, and
              users self-register on this platform by design — left
              disabled rather than inventing a registration path (a
              Decision Log candidate for the founder, see
              admin-users/README.md). */}
          <StubButton>Add Member</StubButton>
        </div>

        <p className="us-note">
          Blocking a user sets a real, admin-only status (not the self-service "deactivated" state) —
          only an admin can undo it. Deleting a user is immediate; there is no 30-day grace period for
          an admin-triggered delete, unlike a user's own delete-account request.
        </p>

        {loading ? <p className="us-loading">Loading users…</p> : null}
        {error ? (
          <p className="us-error" role="alert">
            {error}{" "}
            <button type="button" className="us-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {!loading && !error && items.length === 0 ? (
          <div className="us-card">
            <h2 className="us-card__title">No users</h2>
            <p className="us-note">Nothing matches this filter.</p>
          </div>
        ) : null}

        {items.length > 0 ? (
          <div className="us-table">
            <div className="us-table__row us-table__row--head">
              <span>Username</span>
              <span>Date Joined</span>
              <span>Status</span>
              <span aria-hidden />
            </div>
            {items.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                onChanged={(updated) => setOverrides((prev) => ({ ...prev, [updated.id]: updated }))}
                onDeleted={(id) => setRemovedIds((prev) => new Set(prev).add(id))}
              />
            ))}
          </div>
        ) : null}

        {effectiveCursor && !loading ? (
          <button type="button" className="us-btn us-btn--outline us-btn--sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>
    </>
  );
}
