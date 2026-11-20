import { Prisma } from '@prisma/client';

// backend/w5-profile-block (B-039; Decision Log #396, #402 item 4, #404 items 8
// and 11). The two pure helpers every surface that has to honour a Block shares,
// so the rule lives in ONE place and a new list endpoint can adopt it with one
// clause.

// Prisma `where` fragment for a User: "there is NO block, in either direction,
// between this user and `viewerId`". Use it as `author: { is: notBlockedWith(id) }`
// (posts, comments) or spread it into a User where (rosters, search, suggested).
// Both directions, because a block hides content both ways (#402 item 4).
export function notBlockedWith(viewerId: string): Prisma.UserWhereInput {
  return {
    blockedBy: { none: { blockerId: viewerId } },
    blocksMade: { none: { blockedId: viewerId } },
  };
}

// The same rule for callers that already hold a list of ids.
export function blockedPairWhere(a: string, b: string): Prisma.BlockWhereInput {
  return {
    OR: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  };
}

// B-197 (Decision Log #411 item 5): no NEW Notification row is created where the
// actor and the recipient have a Block between them, in either direction. Used
// inside the trigger transactions so the check and the insert are one unit.
// Accepts a transaction client or the service (only `block.findFirst` is needed).
export async function hasBlockBetween(
  db: { block: { findFirst: (args: Prisma.BlockFindFirstArgs) => Promise<unknown> } },
  actorId: string,
  recipientId: string,
): Promise<boolean> {
  const row = await db.block.findFirst({ where: blockedPairWhere(actorId, recipientId), select: { id: true } });
  return row !== null && row !== undefined;
}

export type BlockRelation = 'none' | 'viewer_blocked_other' | 'other_blocked_viewer';

// What stands between `viewerId` and `otherId`. A pair can in principle be
// blocked both ways; the viewer's OWN block wins, because that is the direction
// the viewer is allowed to know about (a block never reveals itself to the user
// who was blocked, #404 item 11).
export function relationFromRows(
  rows: Array<{ blockerId: string; blockedId: string }>,
  viewerId: string,
  otherId: string,
): BlockRelation {
  if (rows.some((r) => r.blockerId === viewerId && r.blockedId === otherId)) return 'viewer_blocked_other';
  if (rows.some((r) => r.blockerId === otherId && r.blockedId === viewerId)) return 'other_blocked_viewer';
  return 'none';
}

// Code of the 403 the BLOCKER (and only the blocker) can get when they try to
// follow or message someone they blocked. The blocked user never receives it:
// they get the same 404 a non-existent user gets.
export const YOU_BLOCKED_THIS_USER_CODE = 'you_blocked_this_user';
export const YOU_BLOCKED_THIS_USER_MESSAGE = 'You have blocked this user. Unblock them to do that.';

// The one reason length the API and the CHECK constraint agree on.
export const BLOCK_REASON_MAX_LENGTH = 500;
