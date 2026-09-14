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
// api/community-groups.ts's CommunityGroupsApiError already carries the
// server's `message` (via errorMessageFrom) and `.status`, so a message
// match is enough to tell a guardian-consent 403 apart from any other
// failure (e.g. a "not found" 404, or -- for create -- a duplicate-name
// 409) without also threading a `code` field through.
import { CommunityGroupsApiError } from "../../api/community-groups";

export function isAwaitingConsent(err: unknown): boolean {
  return (
    err instanceof CommunityGroupsApiError &&
    err.status === 403 &&
    /guardian consent/i.test(err.message)
  );
}
