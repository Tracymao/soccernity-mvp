import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import {
  GUARDIAN_SECURITY_EVENTS,
  GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX,
  GuardianSecurityEventKey,
} from './guardian-security-notice.constants';

export type GuardianSecurityNoticeOutcome =
  | 'sent'
  | 'skipped_not_minor'
  | 'skipped_withheld'
  | 'skipped_no_user'
  | 'skipped_guardian_not_confirmed'
  | 'skipped_no_guardian_email'
  | 'skipped_throttled'
  | 'skipped_throttle_unavailable'
  | 'failed';

// backend/b275-guardian-security-notices (B-275; Decision Log #456). When a MINOR's account has a security event,
// the guardian gets one plain email saying what happened and when.
//
// Rules, in the order they are checked:
//   1. Only a user with isMinor = true. Adults never trigger a guardian notice (a Guardian row can outlive minority;
//      isMinor is the gate, not the row).
//   2. Only a CONFIRMED guardian (Guardian.consentStatus 'confirmed') with an email on file. For pending, declined
//      or expired consent the address has not been confirmed as the guardian's, so nothing is sent; the skip is
//      logged (reason only: no address, no name).
//   3. Events with a throttle (login_locked: 24 h; every B-279 safety event: 1 h) send at most once per account
//      per kind per window, claimed atomically in
//      Redis with SET NX EX. If Redis is unavailable the notice is SKIPPED and logged: a missed notice is better
//      than a flood. There is deliberately no in-memory fallback.
//
// The email carries the minor's display name (as the other guardian emails do), the event sentence and a UTC
// timestamp, and nothing else: no IP address, device, location or other account data.
//
// notify() NEVER throws. A caller must be able to run it after its own action has committed without any risk to
// that action: every failure (lookup, Redis, send) becomes a logged outcome. notifyInBackground() is the form the
// routes use: it returns immediately, so the user's response is not delayed by the lookup or the email.
export interface GuardianNoticeRecipient {
  to: string;
  displayName: string;
}

// Outcome of the single "may this account's guardian be emailed at all?" decision.
type RecipientDecision =
  | { send: true; recipient: GuardianNoticeRecipient }
  | { send: false; outcome: Exclude<GuardianSecurityNoticeOutcome, 'sent' | 'failed' | 'skipped_throttled' | 'skipped_throttle_unavailable'> };

// backend/b279-guardian-safety-notices (B-279). Everything that decides WHETHER a guardian may be emailed lives in
// decide() below, in one place: a later rule (for example a child-protection exception for a particular kind of
// action) is added there and nowhere else. None exists now.
//
// Two kinds of event share this service (see guardian-security-notice.constants.ts): 'security' (B-275: the
// account holder's own security changes) and 'safety' (B-279: something Soccernity did). The rules are the same.
//
// An action that destroys the Guardian row (an admin removing the account) must read the recipient BEFORE it
// runs: prepare() makes the same decision up front and returns the recipient, and notify()/notifyInBackground()
// take it as an optional last argument. prepare() never throws.
@Injectable()
export class GuardianSecurityNoticeService {
  private readonly logger = new Logger(GuardianSecurityNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: RegistrationEmailService,
  ) {}

  notifyInBackground(userId: string, eventKey: GuardianSecurityEventKey, recipient?: GuardianNoticeRecipient): void {
    void this.notify(userId, eventKey, new Date(), recipient);
  }

  // The recipient the notice WOULD go to, or null when it would not be sent. For callers whose action removes
  // the data this reads. Never throws.
  async prepare(userId: string): Promise<GuardianNoticeRecipient | null> {
    try {
      const decision = await this.decide(userId);
      return decision.send ? decision.recipient : null;
    } catch (err) {
      this.logger.warn(`Guardian notice recipient lookup failed: ${(err as Error)?.message ?? err}`);
      return null;
    }
  }

  async notify(
    userId: string,
    eventKey: GuardianSecurityEventKey,
    now: Date = new Date(),
    prepared?: GuardianNoticeRecipient,
  ): Promise<GuardianSecurityNoticeOutcome> {
    try {
      const definition = GUARDIAN_SECURITY_EVENTS[eventKey];
      if (!definition) {
        // A programming error (an unregistered key), logged rather than thrown so it cannot break the caller.
        this.logger.error(`Unknown guardian security event "${String(eventKey)}"; nothing sent.`);
        return 'failed';
      }

      let recipient: GuardianNoticeRecipient;
      if (prepared) {
        recipient = prepared;
      } else {
        const decision = await this.decide(userId);
        if (!decision.send) return this.skip(decision.outcome, eventKey);
        recipient = decision.recipient;
      }

      let throttleKey: string | null = null;
      if (definition.throttleSeconds) {
        throttleKey = `${GUARDIAN_SECURITY_THROTTLE_KEY_PREFIX}${eventKey}:${userId}`;
        let claimed: boolean;
        try {
          claimed = (await this.redis.set(throttleKey, '1', 'EX', definition.throttleSeconds, 'NX')) === 'OK';
        } catch (err) {
          this.logger.warn(
            `Guardian "${eventKey}" notice skipped: the throttle store (Redis) is unavailable (${(err as Error)?.message ?? err}).`,
          );
          return 'skipped_throttle_unavailable';
        }
        if (!claimed) return this.skip('skipped_throttled', eventKey);
      }

      try {
        // RegistrationEmailService.dispatch() logs and swallows provider failures itself, so this resolves once the
        // send has been attempted (or logged as "wired but inactive" while Postmark is not live).
        const subject = definition.subject(recipient.displayName);
        const summary = definition.summary(recipient.displayName);
        const when = formatNoticeTime(now);
        if (definition.kind === 'safety') {
          await this.email.sendGuardianSafetyNoticeEmail(recipient.to, subject, summary, when);
        } else {
          await this.email.sendGuardianSecurityNoticeEmail(recipient.to, subject, summary, when);
        }
      } catch (err) {
        // Nothing was sent: give the throttle claim back so a later event can try again.
        if (throttleKey) await this.redis.del(throttleKey).catch(() => undefined);
        throw err;
      }
      return 'sent';
    } catch (err) {
      this.logger.warn(`Guardian "${eventKey}" notice failed: ${(err as Error)?.message ?? err}`);
      return 'failed';
    }
  }

  // THE one place that decides whether a guardian may be emailed about this account. Rules, in order:
  //   1. Only a user with isMinor = true. Adults never trigger a guardian notice (a Guardian row can outlive
  //      minority; isMinor is the gate, not the row).
  //   2. Not when guardian notices are WITHHELD for the account (B-280, Decision Log #458). Silent.
  //   3. Only a CONFIRMED guardian (Guardian.consentStatus 'confirmed') with an email on file. For pending,
  //      declined or expired consent the address has not been confirmed as the guardian's.
  // Only the B-275 security and B-279 safety notices come through here. The consent request, withdrawal, expiry, the
  // turned-18 notice and the guardian-email-replaced notice do NOT (see README, "What the withhold flag gates").
  private async decide(userId: string): Promise<RecipientDecision> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isMinor: true,
        displayName: true,
        guardian: { select: { email: true, consentStatus: true } },
        // B-280: existence of the row is the flag; the reason is never selected here.
        guardianNoticeWithhold: { select: { id: true } },
      },
    });
    if (!user) return { send: false, outcome: 'skipped_no_user' };
    if (!user.isMinor) return { send: false, outcome: 'skipped_not_minor' };
    // B-280 (Decision Log #458): a child-safety-vetted admin switched guardian notices OFF for this account. Skipped
    // silently: an internal log line only (no reason, no admin, no address). Checked BEFORE the Guardian rule and,
    // because decide() runs before the throttle claim, a withheld account never takes (or burns) a throttle slot.
    if (user.guardianNoticeWithhold) return { send: false, outcome: 'skipped_withheld' };
    if (user.guardian?.consentStatus !== 'confirmed') return { send: false, outcome: 'skipped_guardian_not_confirmed' };
    const to = user.guardian.email?.trim();
    if (!to) return { send: false, outcome: 'skipped_no_guardian_email' };
    return { send: true, recipient: { to, displayName: user.displayName } };
  }

  private skip(outcome: GuardianSecurityNoticeOutcome, eventKey: GuardianSecurityEventKey): GuardianSecurityNoticeOutcome {
    // Adults are the normal case on this path (every password change by an adult), so they are not logged.
    if (outcome !== 'skipped_not_minor') {
      this.logger.log(`Guardian "${eventKey}" notice not sent: ${outcome.replace('skipped_', '').replace(/_/g, ' ')}.`);
    }
    return outcome;
  }
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// "1 November 2026, 14:32 UTC". Built by hand from UTC parts so the output does not depend on the runtime's ICU.
export function formatNoticeTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}
