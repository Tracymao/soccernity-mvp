// Add / Edit / Delete Role — Figma nodes 1658:2456, 1658:2592, 5403:7205.
//
// Real data (Edit only): PATCH /admin/staff/:id/role (Build Plan Section
// 4.8, built by feat/admin-role-management) reassigns AdminUser.role;
// PATCH /admin/staff/:id/status (feat/admin-staff-status, Decision Log
// #193) sets AdminUser.accountStatus (active/deactivated) — deactivating
// revokes every existing session for that admin and (a 409) is refused
// if the target is the last active superadmin, mirroring the role
// endpoint's own last-active-superadmin guard; PATCH
// /admin/users/:id/child-safety-vetting
// (schema/report-severity-escalation-admin-vetting-application) records
// — but does NOT itself perform — child-safety vetting for that admin.
// All three are AdminRolesGuard('superadmin')-only; see
// admin-staff-roles/README.md's "Response shape" section for why the
// vetting fields ride along on GET/PATCH /admin/staff's own response
// even though this module doesn't write them.
//
// AddRolePage/DeleteRolePage remain disclosed stubs — per Decision Log
// #191 there is still no self-service admin/moderator account
// creation/deletion endpoint (admin-staff-roles/README.md's own "Not
// built" list explicitly leaves both out of scope). "Add a New Role" is
// really "create an admin/moderator account". Delete Role is navy, not
// red — no destructive token (CLAUDE.md non-negotiable #3).
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { StubBanner, StubButton, StubField } from "../../components/stub/AdminStub";
import { AdminApiError } from "../../api/adminClient";
import {
  ADMIN_STAFF_ROLES,
  findStaffById,
  updateAdminRole,
  updateAdminStatus,
  type AdminStaffAccountStatus,
  type AdminStaffListItem,
  type AdminStaffRole,
} from "../../api/adminStaff";
import { setChildSafetyVetting } from "../../api/adminStaffVetting";
import { formatDateTime } from "./settingsShared";
import "./settings.css";

function StubShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="rl-back">
        <Link to="/settings">← Roles</Link>
      </div>
      <AdminPageHeader title={title} hideSearch />
      <StubBanner>
        There is no self-service admin/moderator account creation or deletion endpoint — accounts
        are provisioned by direct DB insert (Decision Log #191).
      </StubBanner>
      <div className="admin-stub__body">{children}</div>
    </>
  );
}

export function AddRolePage() {
  return (
    <StubShell title="Add a new role">
      <p className="admin-stub__note">
        This screen really creates an admin/moderator account (name, email, password) — see
        Decision Log #191 for why that is not self-service.
      </p>
      <StubField label="Name" value="" />
      <StubField label="Email" value="" />
      <StubField label="Role" kind="select" value="Moderator" />
      <StubField label="Create password" value="" />
      <StubField label="Confirm password" value="" />
      <div className="admin-stub__actions">
        <StubButton>Submit</StubButton>
      </div>
    </StubShell>
  );
}

type LoadState = "loading" | "loaded" | "not-found" | "error";

export function EditRolePage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { admin?: AdminStaffListItem } };
  const navigate = useNavigate();

  const [admin, setAdmin] = useState<AdminStaffListItem | null>(location.state?.admin ?? null);
  const [loadState, setLoadState] = useState<LoadState>(admin ? "loaded" : "loading");

  const [role, setRole] = useState<AdminStaffRole>(admin?.role ?? "editor");
  const [savingRole, setSavingRole] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleSaved, setRoleSaved] = useState(false);

  const [vettingBusy, setVettingBusy] = useState(false);
  const [vettingError, setVettingError] = useState<string | null>(null);

  const [statusBusy, setStatusBusy] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (admin) return;
    let cancelled = false;
    findStaffById(id)
      .then((found) => {
        if (cancelled) return;
        if (found) {
          setAdmin(found);
          setRole(found.role);
          setLoadState("loaded");
        } else {
          setLoadState("not-found");
        }
      })
      .catch(() => {
        if (!cancelled) setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
    // Only re-runs if `id` changes — `admin` is intentionally excluded so
    // a successful save/toggle below doesn't trigger a refetch.
  }, [id]);

  const backLink = (
    <div className="rl-back">
      <Link to="/settings">← Roles</Link>
    </div>
  );

  async function handleSaveRole() {
    setRoleError(null);
    setRoleSaved(false);
    setSavingRole(true);
    try {
      const updated = await updateAdminRole(id, role);
      setAdmin(updated);
      setRole(updated.role);
      setRoleSaved(true);
    } catch (err) {
      setRoleError(err instanceof AdminApiError ? err.message : "Couldn't update this role.");
    } finally {
      setSavingRole(false);
    }
  }

  async function handleToggleVetting() {
    if (!admin) return;
    setVettingError(null);
    setVettingBusy(true);
    const next = !admin.childSafetyVetted;
    try {
      const updated = await setChildSafetyVetting(id, next);
      // Merge only the vetting-specific fields this endpoint actually
      // owns — id/email/fullName/role come from AdminStaffListItem's own
      // wider (and more precisely typed) shape and are left untouched.
      setAdmin((prev) =>
        prev
          ? {
              ...prev,
              childSafetyVetted: updated.childSafetyVetted,
              vettedAt: updated.vettedAt,
              vettedByAdminId: updated.vettedByAdminId,
            }
          : prev,
      );
    } catch (err) {
      setVettingError(err instanceof AdminApiError ? err.message : "Couldn't update the vetting record.");
    } finally {
      setVettingBusy(false);
    }
  }

  async function handleToggleStatus() {
    if (!admin) return;
    setStatusError(null);
    setStatusBusy(true);
    const next: AdminStaffAccountStatus = admin.accountStatus === "active" ? "deactivated" : "active";
    try {
      const updated = await updateAdminStatus(id, next);
      setAdmin(updated);
    } catch (err) {
      setStatusError(err instanceof AdminApiError ? err.message : "Couldn't update this account's status.");
    } finally {
      setStatusBusy(false);
    }
  }

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Edit role" hideSearch />
        <div className="rl-page">
          {backLink}
          <p className="rl-loading">Loading this admin account…</p>
        </div>
      </>
    );
  }

  if (loadState === "not-found" || loadState === "error" || !admin) {
    return (
      <>
        <AdminPageHeader title="Edit role" hideSearch />
        <div className="rl-page">
          {backLink}
          <div className="rl-card">
            <h2 className="rl-card__title">Admin account not found</h2>
            <p className="rl-note">
              {loadState === "error"
                ? "Couldn't load this admin account. Please try again from the Roles list."
                : "This admin account isn't in the first 250 staff records — open it directly from the Roles list instead of a bookmarked link."}
            </p>
            <div className="rl-action-row">
              <button type="button" className="rl-btn rl-btn--primary" onClick={() => navigate("/settings")}>
                Back to Roles
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader title="Edit role" hideSearch />
      <div className="rl-page">
        {backLink}

        <div className="rl-card">
          <h2 className="rl-card__title">Account</h2>
          <div className="rl-field-row">
            <span className="rl-field-row__label">Name</span>
            <span className="rl-field-row__value">{admin.fullName}</span>
          </div>
          <div className="rl-field-row">
            <span className="rl-field-row__label">Email</span>
            <span className="rl-field-row__value">{admin.email}</span>
          </div>

          <label className="rl-field">
            <span>Role</span>
            <select value={role} onChange={(e) => setRole(e.target.value as AdminStaffRole)} disabled={savingRole}>
              {ADMIN_STAFF_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>

          {roleError ? (
            <p className="rl-error" role="alert">
              {roleError}
            </p>
          ) : null}
          {roleSaved && !roleError ? <p className="rl-success">Role updated.</p> : null}

          <div className="rl-action-row">
            <button type="button" className="rl-btn rl-btn--primary" onClick={handleSaveRole} disabled={savingRole}>
              {savingRole ? "Saving…" : "Submit"}
            </button>
          </div>
        </div>

        <div className="rl-card">
          <h2 className="rl-card__title">Account status</h2>

          <div className="rl-callout">
            <span className="rl-callout__bar" aria-hidden />
            <p>
              Deactivating this account signs it out of every existing session immediately and
              blocks it from logging back in until it's reactivated. Only a superadmin may set or
              clear this.
            </p>
          </div>

          <span className={`rl-pill ${admin.accountStatus === "active" ? "rl-pill--strong" : "rl-pill--soft"}`}>
            {admin.accountStatus}
          </span>

          {statusError ? (
            <p className="rl-error" role="alert">
              {statusError}
            </p>
          ) : null}

          <div className="rl-action-row">
            <button
              type="button"
              className="rl-btn rl-btn--outline"
              onClick={handleToggleStatus}
              disabled={statusBusy}
            >
              {statusBusy
                ? "Updating…"
                : admin.accountStatus === "active"
                  ? "Deactivate account"
                  : "Reactivate account"}
            </button>
          </div>
        </div>

        <div className="rl-card">
          <h2 className="rl-card__title">Child safety vetting</h2>

          <div className="rl-callout">
            <span className="rl-callout__bar" aria-hidden />
            <p>
              This records that a real-world DBS/background check has been completed for this
              staff member <strong>outside of Soccernity's systems</strong> — toggling it performs
              no verification of its own. Only a superadmin may set or clear it.
            </p>
          </div>

          <span className={`rl-pill ${admin.childSafetyVetted ? "rl-pill--strong" : "rl-pill--soft"}`}>
            {admin.childSafetyVetted ? "Vetted" : "Not vetted"}
          </span>

          {admin.childSafetyVetted ? (
            <p className="rl-note">
              Recorded {formatDateTime(admin.vettedAt)}
              {admin.vettedByAdminId ? ` by admin ${admin.vettedByAdminId}` : ""}.
            </p>
          ) : (
            <p className="rl-note">No vetting record is on file for this staff member.</p>
          )}

          {vettingError ? (
            <p className="rl-error" role="alert">
              {vettingError}
            </p>
          ) : null}

          <div className="rl-action-row">
            <button
              type="button"
              className="rl-btn rl-btn--outline"
              onClick={handleToggleVetting}
              disabled={vettingBusy}
            >
              {vettingBusy ? "Updating…" : admin.childSafetyVetted ? "Clear vetting record" : "Mark as vetted"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function DeleteRolePage() {
  return (
    <StubShell title="Delete this role?">
      <p className="admin-stub__note">
        Members currently assigned this role would lose its permissions.
      </p>
      <div className="admin-stub__actions">
        <StubButton>Delete Role</StubButton>
        <Link to="/settings" className="admin-stub__linkbtn">
          Cancel
        </Link>
      </div>
    </StubShell>
  );
}
