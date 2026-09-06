// Media Upload — Figma nodes 916:2362 (step 1: choose) and 917:24 (step
// 2: files selected).
//
// STUB: `POST /admin/media/upload` is not built and no file storage
// exists (Build Plan Section 4.8). Both steps of the Figma flow are shown
// as one disabled form.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton } from "../../components/stub/AdminStub";

const SAMPLE_FILES = ["image.jpg", "image1.jpg", "video.mp4"];

export default function MediaUploadPage() {
  return (
    <AdminStubScreen
      title="Upload media"
      backLink={<Link to="/media">← Media</Link>}
      banner={
        <>
          `POST /admin/media/upload` is not built and no file storage is configured (Build Plan
          Section 4.8). This form is not submittable.
        </>
      }
    >
      <div
        style={{
          maxWidth: 480,
          padding: 32,
          borderRadius: 10,
          border: "1px dashed var(--sn-icon-inactive)",
          background: "var(--sn-green-tint-12)",
          textAlign: "center",
          color: "var(--sn-text-secondary)",
          fontSize: 13,
        }}
      >
        Select up to 5 media files (each no larger than 50 MB).
      </div>

      <div>
        <p className="admin-stub__section-title">Selected files (sample)</p>
        <ul className="admin-stub__note" style={{ paddingLeft: 18 }}>
          {SAMPLE_FILES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>

      <div className="admin-stub__actions">
        <StubButton>Upload</StubButton>
      </div>
    </AdminStubScreen>
  );
}
