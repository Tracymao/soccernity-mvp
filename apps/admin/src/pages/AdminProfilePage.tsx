// Admin Profile — Figma node 5403:7327 ("Admin - Admin Profile") + the
// card 5405:7173.
//
// View mode shows Full name / Email / Role / Phone and two actions:
// "Edit Profile" and "Change Password".
//
// - Edit Profile → PATCH /admin/profile. Only fullName + phone are
//   editable (services/api update-admin-profile.dto.ts's allowlist);
//   Email and Role render as read-only in edit mode with a disclosed
//   "changed by a superadmin, not here" note.
// - Change Password → POST /admin/auth/change-password. NO FIGMA FRAME
//   exists for this form (the Figma screen only has the button) — built
//   plainly as an inline panel, disclosed. On success the backend revokes
//   every other admin session for this account, which the success copy
//   states.
import { useState } from "react";
import AdminPageHeader from "../layout/AdminPageHeader";
import { useAdminAuth } from "../auth/AdminAuthContext";
import {
  changeAdminPassword,
  updateAdminProfile,
  type AdminSummary,
} from "../api/adminAuth";
import { AdminApiError } from "../api/adminClient";
import "./AdminProfilePage.css";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// services/api AdminUser.role is a fixed enum: editor | moderator |
// superadmin. Map to the display labels the Figma screen uses; fall back
// to a plain title-case for any future value.
const ROLE_LABELS: Record<string, string> = {
  editor: "Editor",
  moderator: "Moderator",
  superadmin: "Super Admin",
};

function roleLabel(role: string): string {
  return (
    ROLE_LABELS[role] ??
    role
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ")
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-profile__field">
      <span className="admin-profile__label">{label}</span>
      <div className="admin-profile__value">{value || "—"}</div>
    </div>
  );
}

function ProfileView({ admin, onEdit, onChangePassword }: {
  admin: AdminSummary;
  onEdit: () => void;
  onChangePassword: () => void;
}) {
  return (
    <>
      <ReadOnlyField label="Full name" value={admin.fullName} />
      <ReadOnlyField label="Email address" value={admin.email} />
      <ReadOnlyField label="Role" value={roleLabel(admin.role)} />
      <ReadOnlyField label="Phone" value={admin.phone ?? ""} />
      <div className="admin-profile__actions">
        <button type="button" className="admin-btn admin-btn--primary" onClick={onEdit}>
          Edit Profile
        </button>
        <button type="button" className="admin-btn admin-btn--outline" onClick={onChangePassword}>
          Change Password
        </button>
      </div>
    </>
  );
}

function ProfileEdit({ admin, onDone }: { admin: AdminSummary; onDone: (updated?: AdminSummary) => void }) {
  const { applyProfile } = useAdminAuth();
  const [fullName, setFullName] = useState(admin.fullName);
  const [phone, setPhone] = useState(admin.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const updated = await updateAdminProfile({ fullName: fullName.trim(), phone: phone.trim() });
      applyProfile(updated);
      onDone(updated);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Couldn’t save your changes. Please try again.",
      );
      setSaving(false);
    }
  };

  return (
    <>
      {error ? (
        <p className="admin-profile__error" role="alert">
          {error}
        </p>
      ) : null}
      <label className="admin-profile__field">
        <span className="admin-profile__label">Full name</span>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={150} />
      </label>
      <div className="admin-profile__field">
        <span className="admin-profile__label">Email address</span>
        <div className="admin-profile__value admin-profile__value--locked">{admin.email}</div>
        <span className="admin-profile__hint">
          Email and role are changed by a superadmin, not here.
        </span>
      </div>
      <div className="admin-profile__field">
        <span className="admin-profile__label">Role</span>
        <div className="admin-profile__value admin-profile__value--locked">{roleLabel(admin.role)}</div>
      </div>
      <label className="admin-profile__field">
        <span className="admin-profile__label">Phone</span>
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+234 800 000 0000"
          inputMode="tel"
        />
      </label>
      <div className="admin-profile__actions">
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={() => onDone()}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

function ChangePasswordPanel({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (next.length < 8) {
      setError("Your new password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The new passwords don’t match.");
      return;
    }
    setSaving(true);
    try {
      await changeAdminPassword(current, next);
      setDone(true);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        setError("Your current password is incorrect.");
      } else {
        setError(
          err instanceof AdminApiError ? err.message : "Couldn’t change your password. Please try again.",
        );
      }
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="admin-profile__panel">
        <h2 className="admin-profile__panel-title">Password changed</h2>
        <p className="admin-profile__panel-note">
          Your password has been updated. You’ve been signed out of every other Admin Console session.
        </p>
        <div className="admin-profile__actions">
          <button type="button" className="admin-btn admin-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-profile__panel">
      <h2 className="admin-profile__panel-title">Change password</h2>
      {error ? (
        <p className="admin-profile__error" role="alert">
          {error}
        </p>
      ) : null}
      <label className="admin-profile__field">
        <span className="admin-profile__label">Current password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </label>
      <label className="admin-profile__field">
        <span className="admin-profile__label">New password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <span className="admin-profile__hint">Use at least 8 characters.</span>
      </label>
      <label className="admin-profile__field">
        <span className="admin-profile__label">Confirm new password</span>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      <p className="admin-profile__panel-note">
        Changing your password signs you out of every other Admin Console session.
      </p>
      <div className="admin-profile__actions">
        <button
          type="button"
          className="admin-btn admin-btn--primary"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? "Updating…" : "Update password"}
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={onClose}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

type Mode = "view" | "edit" | "password";

export default function AdminProfilePage() {
  const { admin } = useAdminAuth();
  const [mode, setMode] = useState<Mode>("view");

  if (!admin) {
    return (
      <>
        <AdminPageHeader title="Admin Profile" hideSearch />
        <p className="admin-profile__loading">Loading your profile…</p>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title="Admin Profile" hideSearch />
      <div className="admin-profile__card">
        <div className="admin-profile__header">
          <span className="admin-profile__avatar" aria-hidden>
            {initialsFor(admin.fullName || admin.email)}
          </span>
          <div className="admin-profile__identity">
            <span className="admin-profile__name">{admin.fullName || "—"}</span>
            <span className="admin-profile__role">{roleLabel(admin.role)}</span>
          </div>
        </div>

        {mode === "view" ? (
          <ProfileView
            admin={admin}
            onEdit={() => setMode("edit")}
            onChangePassword={() => setMode("password")}
          />
        ) : null}
        {mode === "edit" ? (
          <ProfileEdit admin={admin} onDone={() => setMode("view")} />
        ) : null}
        {mode === "password" ? <ChangePasswordPanel onClose={() => setMode("view")} /> : null}
      </div>
    </>
  );
}
