// Shared error-classification for the Grassroots organiser flows
// (register team / schedule fixture / manage fixture). All three write
// paths can 403 for two different reasons, both status 403:
//
//   - GuardianConsentGuard: the caller is a restricted-pending minor.
//     The server body carries { code: "guardian_consent_pending",
//     message: "This account is awaiting guardian consent and cannot
//     access this feature yet." } (guardian-consent.guard.ts). Surfaced
//     with a link to /guardian-consent, matching PostComposer.tsx.
//   - ForbiddenException: the caller is not the relevant team's
//     organiser (Decision Log #255) -- "You may only create fixtures for
//     a team you registered", etc. Surfaced as the server's own message.
//
// api/grassroots.ts's GrassrootsApiError carries the server's `status` and
// machine `code`; the guardian-consent 403 is told apart by its code, never
// by the message text.
import {
  GrassrootsApiError,
  SENSITIVE_CONTENT_REVIEW_REQUIRED_CODE,
  type SensitiveFieldFlag,
} from "../../api/grassroots";import { GUARDIAN_CONSENT_PENDING_CODE } from "../community/writeRefusal";

export function isAwaitingConsent(err: unknown): boolean {
  return (
    err instanceof GrassrootsApiError &&
    err.status === 403 &&
    err.code === GUARDIAN_CONSENT_PENDING_CODE
  );
}

// The pre-publication sensitive-content screen refused a submission (422,
// nothing saved) and wants the person to confirm or edit. Returns the
// flagged fields, or null for any other error.
export function sensitiveContentFlags(err: unknown): SensitiveFieldFlag[] | null {
  if (
    err instanceof GrassrootsApiError &&
    err.status === 422 &&
    err.code === SENSITIVE_CONTENT_REVIEW_REQUIRED_CODE
  ) {
    return err.flaggedFields ?? [];
  }
  return null;
}
