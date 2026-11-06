import { Prisma } from '@prisma/client';
import {
  isSuppressibleNotificationType,
  NEW_ACCOUNT_AGE_DAYS,
  QUALITY_FILTER_INTERACTION_WINDOW_DAYS,
} from './notification-policy.constants';

// backend/b062-notification-preferences (B-062; Decision Log #472 adopted default (c)).
//
// THE one place the notification preferences are applied. Called by the three creators that write a notification
// with an actor (FeedService.likePost, FeedService.addComment, UsersService.followUser) inside their transaction,
// AFTER the existing Block rule (which stays as it is and is applied first).
//
// Suppression means the notification is NOT stored (DEFAULT, founder-veto-able: the Figma note leaves "hidden or
// deleted" open). Muting hides nothing already received.
//
// Written as a function over a client (like block.util.ts's hasBlockBetween), not only as an injected service, so the
// creators can call it with their transaction client without a new constructor dependency.

const DAY_MS = 24 * 60 * 60 * 1000;

// The slice of a Prisma client / transaction client this rule reads.
export interface NotificationPolicyDb {
  notificationPreference: { findUnique: (args: Prisma.NotificationPreferenceFindUniqueArgs) => Promise<unknown> };
  follow: { findUnique: (args: Prisma.FollowFindUniqueArgs) => Promise<unknown> };
  user: { findUnique: (args: Prisma.UserFindUniqueArgs) => Promise<unknown> };
  like: { findFirst: (args: Prisma.LikeFindFirstArgs) => Promise<unknown> };
  comment: { findFirst: (args: Prisma.CommentFindFirstArgs) => Promise<unknown> };
  message: { findFirst: (args: Prisma.MessageFindFirstArgs) => Promise<unknown> };
}

interface PreferenceRow {
  qualityFilter: boolean;
  muteNonFollowing: boolean;
  muteNonFollowers: boolean;
  muteNewAccounts: boolean;
}

async function follows(db: NotificationPolicyDb, followerId: string, followeeId: string): Promise<boolean> {
  const row = await db.follow.findUnique({
    where: { followerId_followeeId: { followerId, followeeId } },
    select: { id: true },
  });
  return row !== null && row !== undefined;
}

// DEFAULT, founder-veto-able (the register leaves "interaction" open): within the window, the recipient liked or
// commented on a post BY the actor, or sent or received a message with the actor.
async function hasRecentInteraction(
  db: NotificationPolicyDb,
  recipientId: string,
  actorId: string,
  since: Date,
): Promise<boolean> {
  const like = await db.like.findFirst({
    where: { userId: recipientId, likedAt: { gte: since }, post: { authorId: actorId } },
    select: { id: true },
  });
  if (like) return true;
  const comment = await db.comment.findFirst({
    where: { authorId: recipientId, createdAt: { gte: since }, post: { authorId: actorId } },
    select: { id: true },
  });
  if (comment) return true;
  const message = await db.message.findFirst({
    where: { sentAt: { gte: since }, conversation: { participantIds: { hasEvery: [recipientId, actorId] } } },
    select: { id: true },
  });
  return message !== null && message !== undefined;
}

/**
 * Should a notification of `type`, caused by `actorId`, be stored for `recipientId`?
 * `false` = suppressed by the recipient's preferences. A missing preference row means all options are off, which
 * means "store it".
 */
export async function shouldCreateNotification(
  db: NotificationPolicyDb,
  recipientId: string,
  actorId: string,
  type: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isSuppressibleNotificationType(type)) return true;

  const pref = (await db.notificationPreference.findUnique({ where: { userId: recipientId } })) as PreferenceRow | null;
  if (!pref) return true;
  if (!pref.qualityFilter && !pref.muteNonFollowing && !pref.muteNonFollowers && !pref.muteNewAccounts) return true;

  // Muting people the recipient does not follow, and the Quality filter, both need "does the recipient follow the
  // actor". Looked up at most once.
  let recipientFollowsActor: boolean | undefined;
  const recipientFollows = async (): Promise<boolean> => {
    if (recipientFollowsActor === undefined) recipientFollowsActor = await follows(db, recipientId, actorId);
    return recipientFollowsActor;
  };

  if (pref.muteNonFollowing && !(await recipientFollows())) return false;

  if (pref.muteNonFollowers && !(await follows(db, actorId, recipientId))) return false;

  if (pref.muteNewAccounts) {
    const actor = (await db.user.findUnique({ where: { id: actorId }, select: { createdAt: true } })) as {
      createdAt: Date;
    } | null;
    // Younger than the threshold = new. Exactly the threshold old is no longer new.
    if (actor && actor.createdAt.getTime() > now.getTime() - NEW_ACCOUNT_AGE_DAYS * DAY_MS) return false;
  }

  if (pref.qualityFilter && !(await recipientFollows())) {
    const since = new Date(now.getTime() - QUALITY_FILTER_INTERACTION_WINDOW_DAYS * DAY_MS);
    if (!(await hasRecentInteraction(db, recipientId, actorId, since))) return false;
  }

  return true;
}
