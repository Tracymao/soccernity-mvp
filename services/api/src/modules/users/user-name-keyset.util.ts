import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// B-034 (Decision Log #369, #404): the ONE ordering and cursor every list that
// pages through USERS alphabetically uses (club roster, Community Group roster,
// people search). Before this, those lists ordered by User.displayName -- the
// real name -- and put it, base64-encoded, into the cursor, so a client could
// read the real name of an account that had hidden it behind a username (or
// behind the 'Soccernity member' placeholder) straight out of the cursor, and
// the visible order followed the real name.
//
// NEW ORDER: username ascending, accounts WITHOUT a username last, then id.
//   * Only the PUBLIC identifier ever feeds the order or the cursor. The
//     username is already public (it is what other users see), and an account
//     with none contributes `null`, never its real name.
//   * Usernames are stored lowercase and unique, so (username, id) is a total
//     order; the id tiebreak only ever separates the NULL group.
//   * Every account without a username shows the same placeholder name, so
//     they have no meaningful relative order: id gives a stable one without
//     revealing anything.
//
// The cursor stays the opaque base64url JSON envelope every other cursor in
// this codebase is. A cursor minted before this change (carrying `name` or
// `displayName`) no longer decodes and is refused with the ordinary 400; a
// client simply restarts the list.

export interface UserNameKeysetCursor {
  username: string | null;
  id: string;
}

export const USER_NAME_ORDER_BY: Prisma.UserOrderByWithRelationInput[] = [
  { username: { sort: 'asc', nulls: 'last' } },
  { id: 'asc' },
];

export function encodeUserNameCursor(cursor: UserNameKeysetCursor): string {
  return Buffer.from(JSON.stringify({ username: cursor.username, id: cursor.id }), 'utf8').toString('base64url');
}

export function decodeUserNameCursor(raw: string): UserNameKeysetCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid pagination cursor');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  const { username, id } = parsed as { username?: unknown; id?: unknown };
  // `username` must be present as a string or an explicit null: a legacy
  // displayName-keyed cursor has neither, so it is rejected here.
  if (typeof id !== 'string' || !(typeof username === 'string' || username === null)) {
    throw new BadRequestException('Invalid pagination cursor');
  }
  return { username, id };
}

// The cursor for the last row of a page.
export function userNameCursorOf(row: { username: string | null; id: string }): string {
  return encodeUserNameCursor({ username: row.username, id: row.id });
}

// "Strictly after this (username, id)" under USER_NAME_ORDER_BY. SQL comparison
// operators never match NULL, so the NULL group has to be named explicitly:
//   after a named user ... a later username, the same username with a later id
//                          (impossible while it is unique, kept for safety), or
//                          ANY account without a username;
//   after a NULL user ..... another NULL account with a later id.
export function userNameAfterCursor(cursor: UserNameKeysetCursor): Prisma.UserWhereInput {
  if (cursor.username === null) {
    return { username: null, id: { gt: cursor.id } };
  }
  return {
    OR: [
      { username: { gt: cursor.username } },
      { username: cursor.username, id: { gt: cursor.id } },
      { username: null },
    ],
  };
}
