// Add Category — Figma node 138:93.
//
// STUB: no `POST /admin/categories` endpoint (Build Plan Section 4.8).
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton, StubField } from "../../components/stub/AdminStub";

export default function AddCategoryPage() {
  return (
    <AdminStubScreen
      title="Add a new category"
      backLink={<Link to="/categories">← Categories</Link>}
      banner={<>`POST /admin/categories` is not built (Build Plan Section 4.8). This form is not submittable.</>}
    >
      <StubField label="Category name" value="" />
      <div className="admin-stub__actions">
        <StubButton>Submit</StubButton>
      </div>
    </AdminStubScreen>
  );
}
