// What to tell someone whose write (post, comment) the server refused with a 403.
//
// A 403 on a community write is NOT always the guardian-consent restriction. The routes sit behind several
// guards, and the server tells them apart with a machine-readable `code` (services/api: GuardianConsentGuard
// -> guardian_consent_pending, EmailVerifiedGuard -> email_verification_required, plus profile_incomplete,
// under_16_restricted, contest_* and others). Reading the code -- never the message text -- keeps an
// unverified ADULT from being told their account is "restricted pending guardian consent".
import { Link } from "react-router";
import { UNDER_16_MESSAGE, UNDER_16_RESTRICTED_CODE } from "../../lib/under16";

export const GUARDIAN_CONSENT_PENDING_CODE = "guardian_consent_pending";
export const EMAIL_VERIFICATION_REQUIRED_CODE = "email_verification_required";

export const PROFILE_INCOMPLETE_CODE = "profile_incomplete";

export type WriteRefusal = "guardian-consent" | "verify-email" | "profile-incomplete" | "under-16" | "other";

/**
 * Classifies a refused write. Works for any of the web API error classes (feed, contest, Bants, messaging,
 * Community Groups, Grassroots): they all carry the HTTP `status` and the server's `code`. Returns null when
 * the error is not a 403 (the caller then shows its own failure). A 403 with an unknown or missing code is
 * "other".
 */
export function classifyWriteRefusal(err: unknown): WriteRefusal | null {
  if (!(err instanceof Error)) return null;
  const { status, code } = err as { status?: unknown; code?: unknown };
  if (status !== 403) return null;
  if (code === GUARDIAN_CONSENT_PENDING_CODE) return "guardian-consent";
  if (code === EMAIL_VERIFICATION_REQUIRED_CODE) return "verify-email";
  if (code === PROFILE_INCOMPLETE_CODE) return "profile-incomplete";
  if (code === UNDER_16_RESTRICTED_CODE) return "under-16";
  return "other";
}

/**
 * The refusal when it is one of the four reasons the person can act on (or must simply be told about), or null
 * for anything else. Screens that already show a specific server message for other 403s (a block, "join the
 * room first") use this and keep their own text when it returns null.
 */
export function specificWriteRefusal(err: unknown): WriteRefusal | null {
  const refusal = classifyWriteRefusal(err);
  return refusal === null || refusal === "other" ? null : refusal;
}

interface WriteRefusalNoticeProps {
  refusal: WriteRefusal;
  /** What the person tried to do, as a verb phrase: "post", "comment", "join a room", "send messages". */
  verb: string;
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
  if (refusal === "profile-incomplete") {
    return (
      <p className={className} role="alert">
        <Link to="/create-profile">Choose a username</Link> to {verb}.
      </p>
    );
  }
  if (refusal === "under-16") {
    // The server's own text names the age threshold, so the shared plain line is shown instead (lib/under16.ts).
    return (
      <p className={className} role="alert">
        {UNDER_16_MESSAGE}
      </p>
    );
  }
  return (
    <p className={className} role="alert">
      You can&rsquo;t do that right now.
    </p>
  );
}
