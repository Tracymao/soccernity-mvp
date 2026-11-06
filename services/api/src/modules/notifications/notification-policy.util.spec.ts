import {
  NEW_ACCOUNT_AGE_DAYS,
  QUALITY_FILTER_INTERACTION_WINDOW_DAYS,
  SUPPRESSIBLE_NOTIFICATION_TYPES,
} from './notification-policy.constants';
import { NotificationPolicyDb, shouldCreateNotification } from './notification-policy.util';

// backend/b062-notification-preferences. Every rule and boundary of the one notification-preference rule.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-06T12:00:00.000Z');
const RECIPIENT = 'recipient';
const ACTOR = 'actor';

const OFF = { qualityFilter: false, muteNonFollowing: false, muteNonFollowers: false, muteNewAccounts: false };

interface World {
  pref: Partial<typeof OFF> | null;
  recipientFollowsActor?: boolean;
  actorFollowsRecipient?: boolean;
  actorCreatedAt?: Date;
  // An interaction (like, comment or message) at this many days before NOW, or none.
  likeDaysAgo?: number;
  commentDaysAgo?: number;
  messageDaysAgo?: number;
}

function build(w: World) {
  const within = (daysAgo: number | undefined, gte: Date) =>
    daysAgo !== undefined && NOW.getTime() - daysAgo * DAY >= gte.getTime();

  const db = {
    notificationPreference: {
      findUnique: jest.fn(async () => (w.pref ? { ...OFF, ...w.pref } : null)),
    },
    follow: {
      findUnique: jest.fn(async (args: { where: { followerId_followeeId: { followerId: string; followeeId: string } } }) => {
        const { followerId, followeeId } = args.where.followerId_followeeId;
        if (followerId === RECIPIENT && followeeId === ACTOR) return w.recipientFollowsActor ? { id: 'f1' } : null;
        if (followerId === ACTOR && followeeId === RECIPIENT) return w.actorFollowsRecipient ? { id: 'f2' } : null;
        return null;
      }),
    },
    user: {
      findUnique: jest.fn(async () => (w.actorCreatedAt ? { createdAt: w.actorCreatedAt } : null)),
    },
    like: {
      findFirst: jest.fn(async (args: { where: { likedAt: { gte: Date } } }) =>
        within(w.likeDaysAgo, args.where.likedAt.gte) ? { id: 'l1' } : null,
      ),
    },
    comment: {
      findFirst: jest.fn(async (args: { where: { createdAt: { gte: Date } } }) =>
        within(w.commentDaysAgo, args.where.createdAt.gte) ? { id: 'c1' } : null,
      ),
    },
    message: {
      findFirst: jest.fn(async (args: { where: { sentAt: { gte: Date } } }) =>
        within(w.messageDaysAgo, args.where.sentAt.gte) ? { id: 'm1' } : null,
      ),
    },
  };
  return db;
}

const run = (w: World, type = 'like') =>
  shouldCreateNotification(build(w) as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, type, NOW);

describe('shouldCreateNotification', () => {
  it('only like, comment and follow are suppressible', () => {
    expect([...SUPPRESSIBLE_NOTIFICATION_TYPES]).toEqual(['like', 'comment', 'follow']);
  });

  it('uses 30 days for both windows, as separate constants', () => {
    expect(QUALITY_FILTER_INTERACTION_WINDOW_DAYS).toBe(30);
    expect(NEW_ACCOUNT_AGE_DAYS).toBe(30);
  });

  describe('defaults', () => {
    it('no preference row means store it, after one read and nothing else', async () => {
      const db = build({ pref: null });
      expect(await shouldCreateNotification(db as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, 'like', NOW)).toBe(true);
      expect(db.notificationPreference.findUnique).toHaveBeenCalledTimes(1);
      expect(db.follow.findUnique).not.toHaveBeenCalled();
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it('a row with every option false changes nothing and reads nothing more', async () => {
      const db = build({ pref: OFF });
      for (const type of ['like', 'comment', 'follow']) {
        expect(await shouldCreateNotification(db as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, type, NOW)).toBe(true);
      }
      expect(db.follow.findUnique).not.toHaveBeenCalled();
      expect(db.like.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('types that are never affected', () => {
    it.each([
      'message',
      'fixture_scheduled',
      'result_logged',
      'contest_win',
      'contest_week_opens',
      'moderation_decision',
      'age_milestone',
      'match_kickoff',
      'profile_image_rejected',
      'username_review_decided',
    ])('%s is stored even with every option on and a stranger actor', async (type) => {
      const db = build({
        pref: { qualityFilter: true, muteNonFollowing: true, muteNonFollowers: true, muteNewAccounts: true },
        actorCreatedAt: new Date(NOW.getTime() - DAY),
      });
      expect(await shouldCreateNotification(db as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, type, NOW)).toBe(true);
      expect(db.notificationPreference.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('mute people you do not follow (muteNonFollowing)', () => {
    const w = { pref: { muteNonFollowing: true } };
    it.each(['like', 'comment', 'follow'])('suppresses %s from someone the recipient does not follow', async (type) => {
      expect(await run({ ...w, recipientFollowsActor: false }, type)).toBe(false);
    });
    it.each(['like', 'comment', 'follow'])('keeps %s from someone the recipient follows', async (type) => {
      expect(await run({ ...w, recipientFollowsActor: true }, type)).toBe(true);
    });
    it('does not look at whether the actor follows the recipient', async () => {
      expect(await run({ ...w, recipientFollowsActor: true, actorFollowsRecipient: false })).toBe(true);
    });
  });

  describe('mute people who do not follow you (muteNonFollowers)', () => {
    const w = { pref: { muteNonFollowers: true } };
    it.each(['like', 'comment', 'follow'])('suppresses %s when the actor does not follow the recipient', async (type) => {
      expect(await run({ ...w, actorFollowsRecipient: false }, type)).toBe(false);
    });
    it.each(['like', 'comment', 'follow'])('keeps %s when the actor follows the recipient', async (type) => {
      expect(await run({ ...w, actorFollowsRecipient: true }, type)).toBe(true);
    });
    it('does not look at whether the recipient follows the actor', async () => {
      expect(await run({ ...w, actorFollowsRecipient: true, recipientFollowsActor: false })).toBe(true);
    });
  });

  describe('mute new accounts (muteNewAccounts)', () => {
    const w = { pref: { muteNewAccounts: true } };
    it('suppresses an actor whose account is 29 days old', async () => {
      expect(await run({ ...w, actorCreatedAt: new Date(NOW.getTime() - 29 * DAY) })).toBe(false);
    });
    it('suppresses an account created a moment ago', async () => {
      expect(await run({ ...w, actorCreatedAt: new Date(NOW.getTime() - 1000) })).toBe(false);
    });
    it('keeps an actor whose account is exactly 30 days old (no longer new)', async () => {
      expect(await run({ ...w, actorCreatedAt: new Date(NOW.getTime() - 30 * DAY) })).toBe(true);
    });
    it('keeps an actor whose account is 31 days old', async () => {
      expect(await run({ ...w, actorCreatedAt: new Date(NOW.getTime() - 31 * DAY) })).toBe(true);
    });
    it('does not depend on who follows whom', async () => {
      expect(
        await run({ ...w, actorCreatedAt: new Date(NOW.getTime() - 5 * DAY), recipientFollowsActor: true, actorFollowsRecipient: true }),
      ).toBe(false);
    });
    it('keeps the notification if the actor row cannot be read', async () => {
      expect(await run({ ...w })).toBe(true);
    });
  });

  describe('quality filter (qualityFilter)', () => {
    const w = { pref: { qualityFilter: true } };

    it('keeps everything from someone the recipient follows, with no interaction at all', async () => {
      expect(await run({ ...w, recipientFollowsActor: true })).toBe(true);
    });

    it('suppresses a stranger with no interaction', async () => {
      expect(await run({ ...w, recipientFollowsActor: false })).toBe(false);
    });

    it('reads the interactions only when the recipient does not follow the actor', async () => {
      const db = build({ ...w, recipientFollowsActor: true });
      await shouldCreateNotification(db as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, 'like', NOW);
      expect(db.like.findFirst).not.toHaveBeenCalled();
      expect(db.comment.findFirst).not.toHaveBeenCalled();
      expect(db.message.findFirst).not.toHaveBeenCalled();
    });

    describe.each([
      ['a like by the recipient on a post by the actor', 'likeDaysAgo'],
      ['a comment by the recipient on a post by the actor', 'commentDaysAgo'],
      ['a message sent or received with the actor', 'messageDaysAgo'],
    ] as const)('%s', (_label, field) => {
      it('on day 29 counts as an interaction (keeps the notification)', async () => {
        expect(await run({ ...w, recipientFollowsActor: false, [field]: 29 })).toBe(true);
      });
      it('on exactly day 30 still counts', async () => {
        expect(await run({ ...w, recipientFollowsActor: false, [field]: 30 })).toBe(true);
      });
      it('on day 31 no longer counts (suppresses)', async () => {
        expect(await run({ ...w, recipientFollowsActor: false, [field]: 31 })).toBe(false);
      });
    });

    it('asks for the right things: the recipient liked / commented on a post BY the actor, and a thread holding both people', async () => {
      const db = build({ ...w, recipientFollowsActor: false });
      await shouldCreateNotification(db as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, 'like', NOW);
      expect(db.like.findFirst.mock.calls[0][0]).toMatchObject({
        where: { userId: RECIPIENT, post: { authorId: ACTOR } },
      });
      expect(db.comment.findFirst.mock.calls[0][0]).toMatchObject({
        where: { authorId: RECIPIENT, post: { authorId: ACTOR } },
      });
      expect(db.message.findFirst.mock.calls[0][0]).toMatchObject({
        where: { conversation: { participantIds: { hasEvery: [RECIPIENT, ACTOR] } } },
      });
    });
  });

  describe('options combined', () => {
    it('any option that says suppress wins', async () => {
      // Follows the actor and the actor follows back, but the account is new.
      expect(
        await run({
          pref: { muteNonFollowing: true, muteNonFollowers: true, muteNewAccounts: true },
          recipientFollowsActor: true,
          actorFollowsRecipient: true,
          actorCreatedAt: new Date(NOW.getTime() - 2 * DAY),
        }),
      ).toBe(false);
    });

    it('the follow lookup the recipient-side options share is made once', async () => {
      const db = build({
        pref: { muteNonFollowing: true, qualityFilter: true },
        recipientFollowsActor: true,
      });
      await shouldCreateNotification(db as unknown as NotificationPolicyDb, RECIPIENT, ACTOR, 'like', NOW);
      expect(db.follow.findUnique).toHaveBeenCalledTimes(1);
    });

    it('keeps it when every enabled option is satisfied', async () => {
      expect(
        await run({
          pref: { muteNonFollowing: true, muteNonFollowers: true, muteNewAccounts: true, qualityFilter: true },
          recipientFollowsActor: true,
          actorFollowsRecipient: true,
          actorCreatedAt: new Date(NOW.getTime() - 90 * DAY),
        }),
      ).toBe(true);
    });
  });
});
