// /terms and /privacy -- functional access to the draft legal copy. Plain,
// readable pages; no design-system polish (a legal-access gap, not a design
// task). The "NOT APPROVED" banner is derived from the source document itself
// (see legalDocument.ts), so unapproved policy text is never shown as final.
import { Link } from "react-router";
import SimpleMarkdown from "./SimpleMarkdown";
import {
  IS_NOT_APPROVED,
  PRIVACY_MARKDOWN,
  SOURCE_VERSION,
  TERMS_MARKDOWN,
} from "./legalDocument";
import "./LegalPage.css";

function LegalPage({ title, markdown, other }: { title: string; markdown: string; other: { to: string; label: string } }) {
  return (
    <main className="legal-page">
      {IS_NOT_APPROVED && (
        <div className="legal-banner" role="note">
          <strong>Draft — not approved.</strong> This {title} is a first-pass draft
          {SOURCE_VERSION ? ` (version ${SOURCE_VERSION})` : ""}. It has not been reviewed or signed off by
          legal counsel, is not final, and must not be relied on as Soccernity's binding policy. Bracketed
          [PROPOSAL] and [OPEN] markers show points still to be decided.
        </div>
      )}
      <SimpleMarkdown source={markdown} />
      <p className="legal-page__other">
        See also: <Link to={other.to}>{other.label}</Link>
      </p>
    </main>
  );
}

export function TermsPage() {
  return <LegalPage title="Terms of Service" markdown={TERMS_MARKDOWN} other={{ to: "/privacy", label: "Privacy Policy" }} />;
}

export function PrivacyPage() {
  return <LegalPage title="Privacy Policy" markdown={PRIVACY_MARKDOWN} other={{ to: "/terms", label: "Terms of Service" }} />;
}
