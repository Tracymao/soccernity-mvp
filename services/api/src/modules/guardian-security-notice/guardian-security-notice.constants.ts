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

export type GuardianSecurityEventKey =
  | 'two_factor_enabled'
  | 'two_factor_disabled'
  | 'backup_codes_regenerated'
  | 'password_changed'
  | 'password_reset'
  | 'login_locked';

export interface GuardianSecurityEventDefinition {
  // One sentence, no trailing time (the email adds "When: ..."). Only the minor's display name is available.
  summary: (minorDisplayName: string) => string;
  // Subject line. Uses only the display name the other guardian emails already use.
  subject: (minorDisplayName: string) => string;
  // If set, at most ONE notice of this event per account per this many seconds (atomic Redis SET NX). Events
  // without it send every time they happen.
  throttleSeconds?: number;
}

export const GUARDIAN_SECURITY_EVENTS: Record<GuardianSecurityEventKey, GuardianSecurityEventDefinition> = {
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
