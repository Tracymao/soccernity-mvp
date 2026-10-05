// profile/username-column-and-display-convention (legal-copy Part C row 33;
// Decision Log #364). THE single place the "username first, display name as
// fallback" convention lives. Every API payload that shows a user's name to
// OTHER people exposes the result as `publicName` and does NOT also send the
// raw displayName -- otherwise a user who picked a username would still have
// their real name readable straight off the response. The owner's own
// profile and email copy keep using displayName directly.

export interface NameSource {
  username?: string | null;
  displayName: string;
}

export function resolvePublicName(user: NameSource): string {
  return user.username ? user.username : user.displayName;
}

// Prisma `select` fragment: the two columns resolvePublicName needs.
export const PUBLIC_NAME_SELECT = { username: true, displayName: true } as const;

// `{ id, publicName }` -- the standard other-facing user reference.
export function toPublicUser(user: { id: string } & NameSource): { id: string; publicName: string } {
  return { id: user.id, publicName: resolvePublicName(user) };
}

// Prisma `where` fragment for "this user's PUBLIC name contains q": matches
// the username if set, the displayName only when no username is set. Using a
// plain displayName match would let anyone search a real name and find the
// pseudonymous account behind it.
export function publicNameContains(q: string): {
  OR: Array<Record<string, unknown>>;
} {
  return {
    OR: [
      { username: { contains: q, mode: 'insensitive' } },
      { AND: [{ username: null }, { displayName: { contains: q, mode: 'insensitive' } }] },
    ],
  };
}
