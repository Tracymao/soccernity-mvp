// Appeal Review — Figma node 5796:8753.
//
// STUB: no appeal backend (Sprint 5, Decision Log #135/#189). Reproduces
// the layout — the routing banner (Decision Log #138: an appeal is
// reviewed by a SECOND admin/moderator, never the original reviewer), the
// read-only original decision, the appeal, and the Uphold / Overturn
// actions. Nothing is actionable.
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton, StubField, StubSection } from "../../components/stub/AdminStub";

export default function AppealReviewPage() {
  return (
    <AdminStubScreen
      title="Appeal — Report #1042"
      backLink={<Link to="/moderation">← Moderation Queue</Link>}
      banner={
        <>
          No appeal-handling backend exists (Sprint 5, Decision Log #135/#189). The values below
          are sample data.
        </>
      }
    >
      <p className="admin-stub__note">
        You are reviewing this appeal because you were <strong>not</strong> the moderator who made
        the original decision (Decision Log #138). The outcome is final, and both the reporter and
        the reported user are notified.
      </p>

      <StubSection title="Original decision (read-only)">
        <StubField label="Reviewed by" value="Adaeze M." kind="readonly" />
        <StubField label="Action taken" value="Content removed" kind="readonly" />
        <StubField label="Decided" value="3 days ago" kind="readonly" />
        <StubField label="Original reason" value="Abusive language" kind="readonly" />
      </StubSection>

      <StubSection title="Appeal submitted by reported user">
        <StubField label="Submitted by" value="@strikerboy99" kind="readonly" />
        <StubField
          label="Appeal reason"
          value="“That post was frustration after a bad result, not meant as abuse.”"
          kind="readonly"
        />
      </StubSection>

      <StubSection title="Decide the appeal">
        <div className="admin-stub__actions">
          <StubButton variant="outline">Uphold Original Decision</StubButton>
          <StubButton>Overturn Decision</StubButton>
        </div>
      </StubSection>

      <p className="admin-stub__note">
        <Link to="/moderation">Back to the Moderation Queue</Link>.
      </p>
    </AdminStubScreen>
  );
}
