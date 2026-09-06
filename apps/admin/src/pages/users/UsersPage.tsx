// Users — Figma node 917:218 ("Users - team members").
//
// STUB: `GET /admin/users` and `PATCH /admin/users/:id` are not built
// (Build Plan Section 4.8). This is a list of platform users with a
// status and block/delete row actions — not admin-role management
// (Decision Log #142 corrected PR #124's misread of this screen). The
// table + actions are reproduced; nothing works.
import AdminStubScreen, { StubButton, StubTable } from "../../components/stub/AdminStub";

const ROWS: string[][] = [
  ["MatthewOhemu", "25/02/2022", "Active"],
  ["Marketwoman", "25/02/2022", "Active"],
  ["Mehere", "25/02/2022", "Active"],
  ["Amam", "25/02/2022", "Active"],
  ["ItoroPhilip", "25/02/2022", "Inactive"],
];

export default function UsersPage() {
  return (
    <AdminStubScreen
      title="Users"
      banner={
        <>
          `GET /admin/users` and `PATCH /admin/users/:id` are not built (Build Plan Section 4.8).
          The table is sample data and the row actions do nothing.
        </>
      }
    >
      <p className="admin-stub__note">
        This is the platform-user list (status, block, delete) — not admin/moderator role
        management (Decision Log #142).
      </p>
      <div className="admin-stub__actions">
        <StubButton>Add Member</StubButton>
      </div>
      <StubTable
        columns={["Username", "Date Joined", "Status", "Actions"]}
        rows={ROWS.map((r) => [...r, "Block · Delete"])}
      />
    </AdminStubScreen>
  );
}
