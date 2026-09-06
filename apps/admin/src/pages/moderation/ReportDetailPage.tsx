// Report Detail & Action — Figma node 5796:8635.
//
// STUB: no `GET/PATCH /admin/moderation/reports/:id` backend (Sprint 5,
// Decision Log #135/#189). The layout (reported content, report details,
// the four moderator actions) is reproduced with sample values; no action
// button does anything. Delete/suspend actions are navy, not red — no
// destructive-colour token exists (CLAUDE.md non-negotiable #3).
import { Link } from "react-router-dom";
import AdminStubScreen, { StubButton, StubField, StubSection } from "../../components/stub/AdminStub";

export default function ReportDetailPage() {
  return (
    <AdminStubScreen
      title="Report #1042"
      backLink={<Link to="/moderation">← Moderation Queue</Link>}
      banner={
        <>
          `GET /admin/moderation/reports/:id` and `PATCH /admin/moderation/reports/:id` are not
          built (Sprint 5, Decision Log #135/#189). The values below are sample data.
        </>
      }
    >
      <StubSection title="Reported content">
        <StubField label="Type" value="Post" kind="readonly" />
        <StubField label="Author" value="@strikerboy99 (Kelechi Ude)" kind="readonly" />
        <StubField
          label="Content preview"
          value="“Ref was blind again today, absolute disgrace, shouldn’t be allowed near a pitch.”"
          kind="readonly"
        />
      </StubSection>

      <StubSection title="Report details">
        <StubField label="Reporter" value="Emeka John" kind="readonly" />
        <StubField label="Reason" value="Abusive language" kind="readonly" />
        <StubField label="Submitted" value="2 hours ago" kind="readonly" />
        <StubField label="Status" value="Open" kind="readonly" />
      </StubSection>

      <StubSection title="Take action">
        <div className="admin-stub__actions">
          <StubButton variant="outline">Dismiss Report</StubButton>
          <StubButton>Remove Content</StubButton>
          <StubButton>Warn User</StubButton>
          <StubButton>Suspend User</StubButton>
        </div>
        <p className="admin-stub__note">
          Once actioned, both the reporter and the reported user are notified of the outcome (Build
          Plan Section 8.4).
        </p>
      </StubSection>
    </AdminStubScreen>
  );
}
