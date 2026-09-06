// Media library — Figma nodes 361:553 (list) and 396:442 (preview).
//
// STUB: `GET /admin/media` / `POST /admin/media/upload` are not built,
// AND no file storage is configured anywhere (Build Plan Section 4.8; S3
// is wired but not live per CLAUDE.md). Nothing here can be functional
// even in principle yet.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubTable } from "../../components/stub/AdminStub";

const ROWS: string[][] = [
  ["IMG987.jpg", "September 11, 2022", "4.1 MB"],
  ["IMG988.jpg", "September 11, 2022", "3.4 MB"],
  ["clip-042.mp4", "September 12, 2022", "18.2 MB"],
];

export default function MediaLibraryPage() {
  return (
    <AdminStubScreen
      title="Media"
      banner={
        <>
          `GET /admin/media` and `POST /admin/media/upload` are not built, and no file storage is
          configured (Build Plan Section 4.8). The list is sample data.
        </>
      }
    >
      <div className="admin-stub__actions">
        <Link to="/media/upload" className="admin-stub__linkbtn">
          Add Media
        </Link>
        <Link to="/media/preview" className="admin-stub__note">
          Preview screen (also a stub) →
        </Link>
      </div>
      <StubTable columns={["Name", "Time of Upload", "File Size"]} rows={ROWS} />
    </AdminStubScreen>
  );
}
