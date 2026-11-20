// backend/b062-notification-preferences (B-062; Decision Log #472 adopted default (c)).

// The only notification types a preference can ever suppress: the ones that have an ACTOR (a person who did
// something). Messages, fixtures, results, Contest, moderation, age and every other type are never affected.
export const SUPPRESSIBLE_NOTIFICATION_TYPES = ['like', 'comment', 'follow'] as const;
export type SuppressibleNotificationType = (typeof SUPPRESSIBLE_NOTIFICATION_TYPES)[number];

export function isSuppressibleNotificationType(type: string): type is SuppressibleNotificationType {
  return (SUPPRESSIBLE_NOTIFICATION_TYPES as readonly string[]).includes(type);
}

// DEFAULT, founder-veto-able (a borrowed figure, the register says so): the Quality filter looks back 30 days for
// an interaction between the recipient and the actor. An interaction exactly this old still counts.
export const QUALITY_FILTER_INTERACTION_WINDOW_DAYS = 30;

// DEFAULT, founder-veto-able (a borrowed figure, deliberately a SEPARATE constant from the one above so the two can
// be tuned apart): an account younger than this is a "new account" for the mute-new-accounts option. An account that
// is exactly this old is no longer new.
export const NEW_ACCOUNT_AGE_DAYS = 30;

export const NOTIFICATION_PREFERENCE_KEYS = [
  'qualityFilter',
  'muteNonFollowing',
  'muteNonFollowers',
  'muteNewAccounts',
] as const;
export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_KEYS)[number];
