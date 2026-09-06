// Media Preview — Figma node 396:442.
//
// STUB: no media backend (Build Plan Section 4.8). The Figma screen has
// no primary action — it's the library list with a preview pane.
import { Link } from "react-router-dom";
import AdminStubScreen from "../../components/stub/AdminStub";

export default function MediaPreviewPage() {
  return (
    <AdminStubScreen
      title="Media preview"
      backLink={<Link to="/media">← Media</Link>}
      banner={<>No media backend exists (`GET /admin/media`, Build Plan Section 4.8). Nothing to preview.</>}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          aspectRatio: "16 / 10",
          borderRadius: 10,
          border: "1px dashed var(--sn-icon-inactive)",
          background: "var(--sn-green-tint-12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--sn-text-secondary)",
          fontSize: 13,
        }}
      >
        Preview — no media
      </div>
      <p className="admin-stub__note">
        IMG987.jpg · September 11, 2022 · 4.1 MB <em>(sample)</em>
      </p>
    </AdminStubScreen>
  );
}
