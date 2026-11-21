// Shared error-classification for the Community Groups write flows
// (create group / join / leave). Unlike Clubs (JwtAuthGuard-only
// join/leave), Community Groups' create/join/leave are ALL gated by
// GuardianConsentGuard (community-groups.controller.ts's own guard
// comments -- Section 5.7 names "joining a Banter Room or Community
// Group" literally), so a restricted-pending minor can 403 on any of the
// three. The server body carries { message: "This account is awaiting
// guardian consent and cannot access this feature yet." }
// (guardian-consent.guard.ts) -- surfaced with a link to /guardian-consent,
// matching PostComposer.tsx / grassroots/errors.ts.
//
// The error carries the server's machine `code` (guardian_consent_pending),
// which is what tells a guardian-consent 403 apart from any other failure
// (e.g. a "not found" 404, a duplicate-name 409). The message text is never
// read.
import { CommunityGroupsApiError } from "../../api/community-groups";
import { GUARDIAN_CONSENT_PENDING_CODE } from "../community/writeRefusal";

export function isAwaitingConsent(err: unknown): boolean {
  return (
    err instanceof CommunityGroupsApiError &&
    err.status === 403 &&
    err.code === GUARDIAN_CONSENT_PENDING_CODE
  );
}
