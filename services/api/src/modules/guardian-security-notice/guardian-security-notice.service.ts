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
//   3. Events with a throttle (login_locked) send at most once per account per window, claimed atomically in
//      Redis with SET NX EX. If Redis is unavailable the notice is SKIPPED and logged: a missed notice is better
//      than a flood. There is deliberately no in-memory fallback.
//
// The email carries the minor's display name (as the other guardian emails do), the event sentence and a UTC
// timestamp, and nothing else: no IP address, device, location or other account data.
//
// notify() NEVER throws. A caller must be able to run it after its own action has committed without any risk to
// that action: every failure (lookup, Redis, send) becomes a logged outcome. notifyInBackground() is the form the
// routes use: it returns immediately, so the user's response is not delayed by the lookup or the email.
@Injectable()
export class GuardianSecurityNoticeService {
  private readonly logger = new Logger(GuardianSecurityNoticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly email: RegistrationEmailService,
  ) {}

  notifyInBackground(userId: string, eventKey: GuardianSecurityEventKey): void {
    void this.notify(userId, eventKey);
  }

  async notify(
    userId: string,
    eventKey: GuardianSecurityEventKey,
    now: Date = new Date(),
  ): Promise<GuardianSecurityNoticeOutcome> {
    try {
      const definition = GUARDIAN_SECURITY_EVENTS[eventKey];
      if (!definition) {
        // A programming error (an unregistered key), logged rather than thrown so it cannot break the caller.
        this.logger.error(`Unknown guardian security event "${String(eventKey)}"; nothing sent.`);
        return 'failed';
      }

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          isMinor: true,
          displayName: true,
          guardian: { select: { email: true, consentStatus: true } },
        },
      });
      if (!user) return this.skip('skipped_no_user', eventKey);
      if (!user.isMinor) return this.skip('skipped_not_minor', eventKey);
      if (user.guardian?.consentStatus !== 'confirmed') return this.skip('skipped_guardian_not_confirmed', eventKey);
      const to = user.guardian.email?.trim();
      if (!to) return this.skip('skipped_no_guardian_email', eventKey);

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
        await this.email.sendGuardianSecurityNoticeEmail(
          to,
          definition.subject(user.displayName),
          definition.summary(user.displayName),
          formatNoticeTime(now),
        );
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
