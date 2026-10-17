// profile/username-column-and-display-convention (legal-copy Part C row 33;
// Decision Log #364), tightened by B-027 (Decision Log #369, #403 item 15).
// THE single place the public-name convention lives. Every API payload that
// shows a user's name to OTHER people exposes the result as `publicName` and
// does NOT also send the raw displayName -- otherwise a user who picked a
// username would still have their real name readable straight off the
// response. The owner's own profile and email copy keep using displayName
// directly.
//
// B-027 / #369: "no user, minor or adult, is shown to other users under a real
// name." #364 fell back to the real displayName when there was no username;
// that fallback is GONE. Until the profile is complete (a username is set) the
// account is shown as the neutral placeholder below -- legacy accounts that
// never chose a username included (#392 item 9).

// Decision Log #403 (item 15). Founder-decided wording; do not change without
// a new decision, the web app and tests assert it.
export const INCOMPLETE_PROFILE_PUBLIC_NAME = 'Soccernity member';

// Decision Log #341: an anonymized account keeps its Post / Comment / Message
// rows, attributed to this name. Anonymization overwrites displayName with it
// and nulls the username, so without a special case those authors would turn
// into the INCOMPLETE-profile placeholder above -- wrong, and a regression of
// #341 ("survive as '[deleted user]'"). The account-deletion sweep writes this
// same constant (it imports it from here), so there is one source of truth.
export const DELETED_USER_PUBLIC_NAME = '[deleted user]';

export interface NameSource {
  username?: string | null;
  // Still accepted so call sites that already hold the whole row can pass it
  // straight in, but it is deliberately never read: the real name is not a
  // public name.
  displayName?: string;
}

export function resolvePublicName(user: NameSource): string {
  if (user.username) return user.username;
  // Only the anonymization sentinel is ever honoured from displayName: any other
  // value is a real name and must never be shown (the displayName argument is
  // otherwise deliberately ignored).
  if (user.displayName === DELETED_USER_PUBLIC_NAME) return DELETED_USER_PUBLIC_NAME;
  return INCOMPLETE_PROFILE_PUBLIC_NAME;
}

// Prisma `select` fragment. displayName stays in it because the roster /
// people-search cursors and ordering still use it (build register B-034 is the
// open follow-up that removes that real-name leak); resolvePublicName ignores it.
export const PUBLIC_NAME_SELECT = { username: true, displayName: true } as const;

// `{ id, publicName }` -- the standard other-facing user reference.
export function toPublicUser(user: { id: string } & NameSource): { id: string; publicName: string } {
  return { id: user.id, publicName: resolvePublicName(user) };
}

// Prisma `where` fragment for "this user's PUBLIC name contains q": matches the
// username only. An account with no username has no searchable public name (its
// public name is the shared placeholder, which would match every such account),
// and matching the real displayName would let anyone search a real name and
// find the account behind it.
export function publicNameContains(q: string): {
  OR: Array<Record<string, unknown>>;
} {
  return {
    OR: [{ username: { contains: q, mode: 'insensitive' } }],
  };
}
