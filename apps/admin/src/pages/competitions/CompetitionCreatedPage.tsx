// Competition Created (Success) — Figma node 5569:7813.
//
// STUB: no competitions backend (Decision Log #72/#73). This success
// state is unreachable from a real flow — rendered for design fidelity.
import { Link } from "react-router";
import AdminStubScreen from "../../components/stub/AdminStub";

export default function CompetitionCreatedPage() {
  return (
    <AdminStubScreen
      title="Competition created"
      backLink={<Link to="/competitions">← Create Competition</Link>}
      banner={
        <>
          Competitions can't be created yet, so this screen can't be reached. It is shown as a
          preview of the success message.
        </>
      }
    >
      <p className="admin-stub__note">
        “Matchday Predictions — August” would be live and appear on the Leaderboard’s Competition
        board <em>(sample)</em>.
      </p>
      <div className="admin-stub__actions">
        <span className="admin-stub__note">View competition board (not available yet)</span>
        <Link to="/competitions" className="admin-stub__linkbtn">
          Create another
        </Link>
      </div>
    </AdminStubScreen>
  );
}
