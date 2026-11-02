// backend/b275-guardian-security-notices (build register B-275; Decision Log #456, founder 2026-11-01).
//
// The registry of security events that email a minor's confirmed guardian. ONE entry per event: a later PR (the
// recovery steps, B-276) adds an event by adding an entry here and calling GuardianSecurityNoticeService.notify
// with its key; nothing else in the service changes.
//
// Wording: plain, short, addressed to a guardian, says WHAT happened and WHEN (the "when" is added by the
// template, from the time the notice is made). It carries no IP address, device, location or other account data,
// and the `summary` functions receive only the minor's display name, so they cannot leak anything else.
// ALL of it is [COPY PENDING LEGAL REVIEW] (standing convention; listed in docs/pending-copy-manifest.md). The tag
// does not hold the build.

export type GuardianSecurityOnlyEventKey =
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'backup_codes_regenerated'
  | 'password_changed'
  | 'password_reset'
  | 'login_locked';

// backend/b279-guardian-safety-notices (B-279; Decision Log #456 groups A and C). Safety actions the PLATFORM
// took on a minor's account or content. Defined in the safety block below.
export type GuardianSafetyEventKey =
  | 'content_removed'
  | 'warning_issued'
  | 'account_suspended'
  | 'account_reinstated'
  | 'account_removed'
  | 'username_removed'
  | 'room_deactivated'
  | 'media_not_approved'
  | 'profile_image_not_approved'
  | 'appeal_upheld'
  | 'appeal_overturned';

export type GuardianSecurityEventKey = GuardianSecurityOnlyEventKey | GuardianSafetyEventKey;

// Which email shape an event uses. 'security' (B-275) is a change the account's own holder made or triggered
// (two-factor, password, sign-in lock); 'safety' (B-279) is something SOCCERNITY did to the account or its
// content. A safety email also points the guardian to the Contact Us page; a security email does not.
export type GuardianNoticeKind = 'security' | 'safety';

export interface GuardianSecurityEventDefinition {
  // Omitted = 'security' (every B-275 event).
  kind?: GuardianNoticeKind;
  // One sentence, no trailing time (the email adds "When: ..."). Only the minor's display name is available.
  summary: (minorDisplayName: string) => string;
  // Subject line. Uses only the display name the other guardian emails already use.
  subject: (minorDisplayName: string) => string;
  // If set, at most ONE notice of this event per account per this many seconds (atomic Redis SET NX). Events
  // without it send every time they happen.
  throttleSeconds?: number;
}

// ---------------------------------------------------------------------------------------------------------------
// backend/b279-guardian-safety-notices (B-279; Decision Log #456, founder, 2026-11-01).
//
// SAFETY events: the guardian of a minor is told that SOCCERNITY took a safety action on the minor's account or
// content. Three rules decide what is in and what is out (the full inventory is in README.md):
//   (A) an action the platform takes (a moderator, an admin, or an automatic process such as image screening)
//       on a minor's account or content: IN.
//   (C) a report made ABOUT a minor by someone else: the guardian hears only the OUTCOME, and that outcome is an
//       action under (A). The notice never says a report exists and never says who made it. A dismissed report
//       is not an action, so it sends nothing.
//   (B) anything the minor does (reporting someone, blocking someone, muting): OUT, always. A child may be
//       reporting someone in their own household. Nothing here is called from those paths, and tests pin it.
//
// What a safety notice may say: the KIND of action, when, and where to contact support. Never the reason, the
// rule that was broken, a report, a reporter, a moderator, or any content of a post. The sentences below are
// therefore deliberately generic ("content ... was removed", not which content or why).
//
// Holds (legal hold, bad-faith hold, a report-based hold) are NOT in this list on purpose: see README.md. A hold
// notice would reveal that a report or investigation exists, which (C) forbids, and the held user is already
// not told (Decision Log #398 D1, #403 item 8).
//
// Repeats of the same kind for the same account are throttled to one per hour so a burst of actions cannot
// flood a guardian (the extra ones are dropped, not queued).
//
// ALL wording is [COPY PENDING LEGAL REVIEW] (standing convention; docs/pending-copy-manifest.md).
// ---------------------------------------------------------------------------------------------------------------

const SAFETY_THROTTLE_SECONDS = 60 * 60;
const safetySubject = (name: string) => `An update on ${name}'s Soccernity account`;

const GUARDIAN_SAFETY_EVENTS: Record<GuardianSafetyEventKey, GuardianSecurityEventDefinition> = {
  content_removed: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `Soccernity removed content that was posted from ${name}'s account.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  warning_issued: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `Soccernity recorded a warning on ${name}'s account.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  account_suspended: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `${name}'s Soccernity account was suspended.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  account_reinstated: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `The suspension on ${name}'s Soccernity account was lifted.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  account_removed: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `${name}'s Soccernity account was removed by Soccernity.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  username_removed: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `Soccernity removed the username on ${name}'s account.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  room_deactivated: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `Soccernity deactivated a Banter Room that was created from ${name}'s account.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  media_not_approved: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `A photo or video uploaded from ${name}'s account was not approved and is not shown.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  profile_image_not_approved: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `A profile picture or cover photo on ${name}'s account was not approved and is not shown.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  // Appeal outcomes say the outcome only. "Upheld" means the original decision stands; "overturned" means it
  // was reversed. Neither says what the decision was about.
  appeal_upheld: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `A review of an earlier decision on ${name}'s account is finished. The earlier decision was upheld.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
  appeal_overturned: {
    kind: 'safety',
    subject: safetySubject,
    summary: (name) => `A review of an earlier decision on ${name}'s account is finished. The earlier decision was overturned.`,
    throttleSeconds: SAFETY_THROTTLE_SECONDS,
  },
};

const GUARDIAN_SECURITY_ONLY_EVENTS: Record<GuardianSecurityOnlyEventKey, GuardianSecurityEventDefinition> = {
  two_factor_enabled: {
    subject: (name) => `Security change on ${name}'s Soccernity account`,
    summary: (name) => `Two-factor authentication was turned on for ${name}'s Soccernity account.`,
  },
  two_factor_disabled: {
    subject: (name) => `Security change on ${name}'s Soccernity account`,
    summary: (name) => `Two-factor authentication was turned off for ${name}'s Soccernity account.`,
  },
  backup_codes_regenerated: {
    subject: (name) => `Security change on ${name}'s Soccernity account`,
    summary: (name) =>
      `New two-factor backup codes were created for ${name}'s Soccernity account. The old backup codes no longer work.`,
  },
  password_changed: {
    subject: (name) => `Security change on ${name}'s Soccernity account`,
    summary: (name) => `The password on ${name}'s Soccernity account was changed.`,
  },
  password_reset: {
    subject: (name) => `Security change on ${name}'s Soccernity account`,
    summary: (name) => `The password on ${name}'s Soccernity account was reset using the "forgot password" link.`,
  },
  login_locked: {
    subject: (name) => `Sign-in locked on ${name}'s Soccernity account`,
    summary: (name) =>
      `Sign-in to ${name}'s Soccernity account was temporarily locked after several incorrect password attempts.`,
    // At most one lock notice per account per 24 hours (founder, Decision Log #456). A missed notice is better
    // than a flood, so if Redis cannot be reached the notice is skipped (see the service).
    throttleSeconds: 24 * 60 * 60,
  },
};

export const GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX = 'guardian-security-notice:';

// The one registry the service reads: B-275 security events plus B-279 safety events.
export const GUARDIAN_SECURITY_EVENTS: Record<GuardianSecurityEventKey, GuardianSecurityEventDefinition> = {
  ...GUARDIAN_SECURITY_ONLY_EVENTS,
  ...GUARDIAN_SAFETY_EVENTS,
};
