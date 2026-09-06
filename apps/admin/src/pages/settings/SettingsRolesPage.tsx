// Settings / Roles — Figma node 1658:2303.
//
// STUB: there is NO admin role-management endpoint. `AdminUser.role` is a
// fixed enum (editor | moderator | superadmin) with no self-service way
// to change it, and there is no self-service admin/moderator registration
// endpoint — accounts are provisioned by direct DB insert (Decision Log
// #191). "Add a New Role" is really "create an admin/moderator account".
import { Link } from "react-router-dom";
import AdminStubScreen, { StubTable } from "../../components/stub/AdminStub";

const ROWS: string[][] = [
  ["Kuponiyi Abraham", "Super Admin"],
  ["Adaeze M.", "Moderator"],
  ["Tunde Bakare", "Moderator"],
  ["Chidera O.", "Editor"],
];

export default function SettingsRolesPage() {
  return (
    <AdminStubScreen
      title="Roles"
      banner={
        <>
          There is no admin role-management endpoint. `AdminUser.role` is a fixed enum and there is
          no self-service admin/moderator registration — accounts are provisioned by direct DB
          insert (Decision Log #191). Nothing on this screen is functional.
        </>
      }
    >
      <div className="admin-stub__actions">
        <Link to="/settings/roles/new" className="admin-stub__linkbtn">
          Add Role
        </Link>
      </div>
      <StubTable columns={["Name", "Role", "Actions"]} rows={ROWS.map((r) => [...r, "Edit · Delete"])} />
      <p className="admin-stub__note">
        <Link to="/settings/roles/edit">Edit Role</Link> ·{" "}
        <Link to="/settings/roles/delete">Delete Role</Link> (both stubs).
      </p>
    </AdminStubScreen>
  );
}
