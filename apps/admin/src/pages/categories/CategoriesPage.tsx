// Categories — Figma node 128:488.
//
// STUB: `POST /admin/categories` is not built and Section 4.8 defines no
// categories-list endpoint. Layout reproduced (table + "Add Category").
import { Link } from "react-router-dom";
import AdminStubScreen, { StubTable } from "../../components/stub/AdminStub";

const ROWS: string[][] = [
  ["Premier League", "25", "Active"],
  ["Champions League", "25", "Active"],
  ["NPFL", "25", "Active"],
  ["More", "25", "Active"],
  ["La Liga", "25", "Inactive"],
];

export default function CategoriesPage() {
  return (
    <AdminStubScreen
      title="Categories"
      banner={
        <>
          `POST /admin/categories` is not built, and Build Plan Section 4.8 defines no
          categories-list endpoint. The table is sample data.
        </>
      }
    >
      <div className="admin-stub__actions">
        <Link to="/categories/new" className="admin-stub__linkbtn">
          Add Category
        </Link>
      </div>
      <StubTable columns={["Name", "Post Count", "Status"]} rows={ROWS} />
    </AdminStubScreen>
  );
}
