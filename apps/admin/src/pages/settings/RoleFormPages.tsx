// Add / Edit / Delete Role — Figma nodes 1658:2456, 1658:2592, 5403:7205.
//
// STUB: no role-management endpoint (Decision Log #191). Forms reproduced
// and disabled. "Delete Role" is navy, not red — no destructive token
// (CLAUDE.md non-negotiable #3).
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { StubBanner, StubButton, StubField } from "../../components/stub/AdminStub";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <div className="admin-stub__back">
        <Link to="/settings">← Roles</Link>
      </div>
      <AdminPageHeader title={title} hideSearch />
      <StubBanner>
        No admin role-management endpoint exists, and there is no self-service admin/moderator
        registration — accounts are provisioned by direct DB insert (Decision Log #191).
      </StubBanner>
      <div className="admin-stub__body">{children}</div>
    </>
  );
}

export function AddRolePage() {
  return (
    <Shell title="Add a new role">
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
    </Shell>
  );
}

export function EditRolePage() {
  return (
    <Shell title="Edit role">
      <StubField label="Name" value="Adaeze M." />
      <StubField label="Role" kind="select" value="Moderator" />
      <div className="admin-stub__actions">
        <StubButton>Submit</StubButton>
      </div>
    </Shell>
  );
}

export function DeleteRolePage() {
  return (
    <Shell title="Delete this role?">
      <p className="admin-stub__note">
        Members currently assigned this role would lose its permissions.
      </p>
      <div className="admin-stub__actions">
        <StubButton>Delete Role</StubButton>
        <Link to="/settings" className="admin-stub__linkbtn">
          Cancel
        </Link>
      </div>
    </Shell>
  );
}
