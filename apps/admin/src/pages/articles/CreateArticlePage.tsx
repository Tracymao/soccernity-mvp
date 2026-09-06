// Create New Post — Figma node 124:313.
//
// STUB: no `POST /admin/articles` endpoint, and no image storage exists
// anywhere (Build Plan Section 4.8). The form is reproduced with every
// field disabled.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton, StubField } from "../../components/stub/AdminStub";

export default function CreateArticlePage() {
  return (
    <AdminStubScreen
      title="Create New Post"
      backLink={<Link to="/articles">← Articles</Link>}
      banner={
        <>
          `POST /admin/articles` is not built and no image storage is configured (Build Plan
          Section 4.8). Nothing on this form is submittable.
        </>
      }
    >
      <StubField label="Title" value="" />
      <StubField label="Article body" kind="textarea" value="" />
      <StubField label="Category" kind="select" value="Select category…" />
      <div>
        <p className="admin-stub__note">Add up to 5 images, each no larger than 50 MB.</p>
        <div className="admin-stub__actions">
          <StubButton variant="outline">Upload Images</StubButton>
        </div>
      </div>
      <div className="admin-stub__actions">
        <StubButton>Submit Post</StubButton>
      </div>
    </AdminStubScreen>
  );
}
