// Route stub only -- do not build the guardian-consent flow here.
//
// Reminder (CLAUDE.md non-negotiable #1): the safeguarding fields this
// screen collects/displays (is_minor, guardian_id, consent_status,
// consent_token, consent_timestamp) must never be weakened or removed
// once this is built for real.
//
// PR F5 replaces this file's contents with the real, Figma-derived screen(s).
import PlaceholderPage from "./PlaceholderPage";

export default function GuardianConsentPage() {
  return <PlaceholderPage title="Guardian consent" owner="PR F5" />;
}
