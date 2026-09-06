// Moderation Queue — Figma node 5794:8635.
//
// STUB: no moderation-queue backend exists. Build Plan Section 4.8 spec's
// `GET /admin/moderation/reports` + `PATCH /admin/moderation/reports/:id`
// but neither is built — Sprint 5 scope (Decision Log #135/#189). The
// layout (Open Reports / Appeals tabs, the report table, Export Queue) is
// reproduced; the rows are sample data and nothing is actionable.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton, StubTable } from "../../components/stub/AdminStub";

const REPORT_ROWS: string[][] = [
  ['Post — "Ref was blind again..."', "Post", "Abusive language", "Emeka John", "Open"],
  ['Comment on "Sunday league final"', "Comment", "Harassment", "Chidera O.", "Open"],
  ["User — @strikerboy99", "User", "Impersonation", "Rowe Park FC", "Open"],
  ["Post — match highlight clip", "Post", "Spam", "Blessing A.", "Open"],
  ["Comment on club fan page", "Comment", "Off-topic abuse", "Tunde Bakare", "Reviewed"],
  ["User — @coach_musa", "User", "Fake account", "Adaeze M.", "Reviewed"],
];

export default function ModerationQueuePage() {
  return (
    <AdminStubScreen
      title="Moderation Queue"
      banner={
        <>
          `GET /admin/moderation/reports` is not built — Sprint 5 scope (Build Plan Section 4.8,
          Decision Log #135/#189). The table below is sample data.
        </>
      }
    >
      <div className="admin-stub__tabs">
        <span className="admin-stub__tab admin-stub__tab--active">Open Reports (6)</span>
        <span className="admin-stub__tab">Appeals (2)</span>
      </div>

      <p className="admin-stub__note">
        Appeals are reviewed by a <strong>different</strong> admin or moderator than the one who
        made the original decision (Decision Log #138). Both the reporter and the reported user are
        notified of the outcome (Build Plan Section 8.4).
      </p>

      <div className="admin-stub__actions">
        <StubButton variant="outline">Export Queue</StubButton>
      </div>

      <StubTable
        columns={["Reported", "Type", "Reason", "Reporter", "Status", "Action"]}
        rows={REPORT_ROWS.map((r) => [...r, "Review"])}
      />

      <p className="admin-stub__note">
        A real “Review” link opens{" "}
        <Link to="/moderation/reports/sample">the Report Detail screen</Link> (also a stub); an
        appeal opens <Link to="/moderation/appeals/sample">the Appeal Review screen</Link>.
      </p>
    </AdminStubScreen>
  );
}
