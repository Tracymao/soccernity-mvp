// Competition Created (Success) — Figma node 5569:7813.
//
// STUB: no competitions backend (Decision Log #72/#73). This success
// state is unreachable from a real flow — rendered for design fidelity.
import { Link } from "react-router-dom";
import AdminStubScreen from "../../components/stub/AdminStub";

export default function CompetitionCreatedPage() {
  return (
    <AdminStubScreen
      title="Competition created"
      backLink={<Link to="/competitions">← Create Competition</Link>}
      banner={
        <>
          No competitions backend exists (Decision Log #72/#73) — this success screen is not
          reachable from a real flow. Shown for design fidelity.
        </>
      }
    >
      <p className="admin-stub__note">
        “Matchday Predictions — August” would be live and appear on the Leaderboard’s Competition
        board <em>(sample)</em>.
      </p>
      <div className="admin-stub__actions">
        <span className="admin-stub__note">View competition board (not built)</span>
        <Link to="/competitions" className="admin-stub__linkbtn">
          Create another
        </Link>
      </div>
    </AdminStubScreen>
  );
}
