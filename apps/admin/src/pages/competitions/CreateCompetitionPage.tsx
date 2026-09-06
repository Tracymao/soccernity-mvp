// Create Competition — Figma node 5566:8033.
//
// STUB: there is NO competitions admin endpoint anywhere. The Competition
// umbrella (admin-created Prediction / Commentary types, votes) is
// deliberately parked — Build Plan Section 2.2 defers it, Decision Log
// #72/#73. `sprint-2/contest-data-model-backend` built the CONTEST half
// only; `PointsLedgerEntry.source` reserves `competition_result` for
// this. The whole form is reproduced and disabled.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton, StubField, StubSection } from "../../components/stub/AdminStub";

export default function CreateCompetitionPage() {
  return (
    <AdminStubScreen
      title="Create Competition"
      banner={
        <>
          No competitions admin endpoint exists. The Competition umbrella (Prediction / Commentary
          types, votes) is parked — Build Plan Section 2.2, Decision Log #72/#73. This form is not
          submittable.
        </>
      }
    >
      <StubField label="Competition name" value="" />
      <StubField label="Competition type" kind="select" value="Prediction" />
      <StubSection title="Scoring mechanism">
        <StubField label="Mechanism" kind="select" value="Accuracy-scored" />
        <StubField label="Custom scoring method" kind="textarea" value="" />
        <p className="admin-stub__note">Only required when the mechanism is Custom.</p>
      </StubSection>
      <StubField label="Entry brief" kind="textarea" value="" />
      <StubSection title="Entry window">
        <StubField label="Opens" value="01 Aug 2026" />
        <StubField label="Closes" value="28 Aug 2026" />
      </StubSection>
      <StubField label="Entries allowed per player" value="" />
      <StubSection title="Leaderboard visibility">
        <p className="admin-stub__note">Show on the public Competition leaderboard — Public.</p>
      </StubSection>
      <div className="admin-stub__actions">
        <StubButton>Create Competition</StubButton>
        <Link to="/competitions/created" className="admin-stub__note">
          Success screen (also a stub) →
        </Link>
      </div>
    </AdminStubScreen>
  );
}
