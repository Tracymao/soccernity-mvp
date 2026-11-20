// The inline "Please rephrase" state for Bio and Preferred Club (build register
// B-194; Decision Log #394 A3, #411 item 2). Figma: Create Profile flagged
// frames 6672:29251 (desktop) / 6672:29235 (mobile), Edit Profile 6800:29476 /
// 6800:29492.
//
// The server answers a flagged value with a coded 422
// (`sensitive_content_rephrase_required`), saves NOTHING, and names the flagged
// request field(s) without echoing the text. The decision is final: there is no
// "share anyway" and no override control, and the screen never retries on its
// own. The person's typed text stays in the field so they can edit it; typing
// in a flagged field clears its flag (the next save is screened again by the
// server, the only place the decision is made).
import { SENSITIVE_REPHRASE_CODE, UsersApiError } from "../../api/users";
import "./rephrase.css";

export type RephraseField = "bio" | "preferredClub";
export type FlaggedFields = Record<RephraseField, boolean>;

export const NOT_FLAGGED: FlaggedFields = { bio: false, preferredClub: false };

/**
 * The fields a 422 flagged, or null when the error is anything else. An
 * unrecognised or missing field list on the right code flags both, so the
 * state is never silently dropped.
 */
export function flaggedFieldsFrom(error: unknown): FlaggedFields | null {
  if (!(error instanceof UsersApiError) || error.code !== SENSITIVE_REPHRASE_CODE) return null;
  const names = new Set((error.flaggedFields ?? []).map((f) => f.field));
  const known = names.has("bio") || names.has("preferredClub");
  return known ? { bio: names.has("bio"), preferredClub: names.has("preferredClub") } : { bio: true, preferredClub: true };
}

export function RephraseNote({ id }: { id: string }) {
  return (
    <p className="profile-rephrase" id={id} role="alert">
      <span className="profile-rephrase__bar" aria-hidden="true" />
      Please rephrase
    </p>
  );
}
