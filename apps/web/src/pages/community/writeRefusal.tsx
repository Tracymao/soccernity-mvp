// What to tell someone whose write (post, comment) the server refused with a 403.
//
// A 403 on a community write is NOT always the guardian-consent restriction. The routes sit behind several
// guards, and the server tells them apart with a machine-readable `code` (services/api: GuardianConsentGuard
// -> guardian_consent_pending, EmailVerifiedGuard -> email_verification_required, plus profile_incomplete,
// under_16_restricted, contest_* and others). Reading the code -- never the message text -- keeps an
// unverified ADULT from being told their account is "restricted pending guardian consent".
import { Link } from "react-router";
import { ContestApiError } from "../../api/contest";
import { FeedApiError } from "../../api/feed";

export const GUARDIAN_CONSENT_PENDING_CODE = "guardian_consent_pending";
export const EMAIL_VERIFICATION_REQUIRED_CODE = "email_verification_required";

export type WriteRefusal = "guardian-consent" | "verify-email" | "other";

/**
 * Classifies a refused write. Returns null when the error is not a 403 from the feed or contest API (the
 * caller then shows its own generic failure). A 403 with an unknown or missing code is "other".
 */
export function classifyWriteRefusal(err: unknown): WriteRefusal | null {
  if (!(err instanceof FeedApiError) && !(err instanceof ContestApiError)) return null;
  if (err.status !== 403) return null;
  if (err.code === GUARDIAN_CONSENT_PENDING_CODE) return "guardian-consent";
  if (err.code === EMAIL_VERIFICATION_REQUIRED_CODE) return "verify-email";
  return "other";
}

interface WriteRefusalNoticeProps {
  refusal: WriteRefusal;
  /** "post" or "comment": the thing the person tried to do. */
  verb: "post" | "comment";
  className: string;
}

export function WriteRefusalNotice({ refusal, verb, className }: WriteRefusalNoticeProps) {
  if (refusal === "guardian-consent") {
    return (
      <p className={className} role="alert">
        Your account is restricted pending guardian consent, so you can&rsquo;t {verb} yet.{" "}
        <Link to="/guardian-consent">Check your consent status</Link>.
      </p>
    );
  }
  if (refusal === "verify-email") {
    return (
      <p className={className} role="alert">
        <Link to="/verify-email/prompt">Verify your email</Link> to {verb}.
      </p>
    );
  }
  return (
    <p className={className} role="alert">
      You can&rsquo;t do that right now.
    </p>
  );
}
