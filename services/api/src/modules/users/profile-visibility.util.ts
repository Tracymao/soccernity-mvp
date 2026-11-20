import { Prisma } from '@prisma/client';

// backend/b060-public-profile-toggle (build register B-060; founder decision 2026-11-08).
// The ONE rule for the "Public profile" toggle (User.isProfilePublic), so every surface that has
// to honour it shares it, exactly like block/block.util.ts does for Block.
//
// A profile is "private" to a viewer when its owner turned the toggle OFF and the viewer is neither
// the owner nor an active follower of the owner. In plain terms, a profile is VISIBLE to a viewer when
// ANY of these holds:
//   - the owner left the toggle on (isProfilePublic = true, the default);
//   - the owner is under 18 (isMinor): an under-18 account cannot turn the toggle off and its
//     effective value is always "public" -- the existing safeguarding rules (restricted-pending 404s,
//     guardian contact, the age rules) decide, unchanged. The column is therefore only ever read
//     TOGETHER with isMinor, so an adult who turned it off and is later reclassified as a minor
//     (DOB correction, B-103) is treated as public from that moment, with no backfill;
//   - the viewer is the owner;
//   - the viewer follows the owner (a Follow row exists; following is instant, no approval).
// An anonymous viewer (no id) matches only the first two.
//
// Staff reading through the admin console use separate, admin-guarded routes that never go through
// this filter, so they see everything as before.

// For a User where clause: "this user's profile is visible to `viewerId`". Use it as
// `author: { is: profileVisibleTo(id) }` (posts) or spread it into a User where.
export function profileVisibleTo(viewerId?: string): Prisma.UserWhereInput {
  const or: Prisma.UserWhereInput[] = [{ isProfilePublic: true }, { isMinor: true }];
  if (viewerId) {
    or.push({ id: viewerId }, { followedBy: { some: { followerId: viewerId } } });
  }
  return { OR: or };
}

// For a Post where clause: "this post may be shown to `viewerId` as far as its AUTHOR'S PROFILE
// VISIBILITY goes". A post is shown when its author's profile is visible to the viewer, OR when it is
// public content by design, whoever wrote it:
//   - a Banter Room post (a room is an open public forum, Decision Log #403 item 16 / B-117);
//   - a Contest entry (entering a contest is a public act; the carousel and the entry pages stay as
//     they are). DEFAULT, founder-veto-able.
// Everything else (home feed, club feed, single post, comments, likes, saves, views, search, media
// reports) must AND this in.
export function postProfileVisibleTo(viewerId?: string): Prisma.PostWhereInput {
  return {
    OR: [
      { banterRoomId: { not: null } },
      { contestEntry: { isNot: null } },
      { author: { is: profileVisibleTo(viewerId) } },
    ],
  };
}

// The effective value shown to the OWNER on GET /users/me/settings, and used to decide whether a
// profile is private: an under-18 account is always effectively public.
//
// Only an explicit `false` makes a profile private: a missing or undefined value (a row from before the column,
// a partial mock) reads as the default, public. The column is NOT NULL DEFAULT true, so in the database this is
// always a real boolean.
export function effectiveProfilePublic(stored: boolean | null | undefined, isMinor: boolean): boolean {
  return isMinor ? true : stored !== false;
}

export const PROFILE_VISIBILITY_NOT_AVAILABLE_CODE = 'profile_visibility_not_available';
