import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { RegistrationEmailService } from '../registration/email/registration-email.service';
import { GuardianConsentService } from './guardian-consent.service';
import { EXPLICIT_DECLINE_SOURCE, MAX_EXPLICIT_DECLINES, getDeclineLapseDays } from './guardian-decline-cap.constants';

export interface StaleDeclineSweepResult {
  // Guardian rows that were declined at decline 1 or 2, never reopened within
  // the window, and were therefore put on the lapse path: reopened as a fresh
  // pending request, with the one automatic re-send spent.
  chasedGuardianIds: string[];
}

// B-126 (Decision Log #406 item 1, #389, #395, #402).
//
// THE GAP. Since PR #416 (B-102/B-110) declines 1 and 2 are not final: the row
// becomes 'declined', the account stays 'active', and the MINOR decides whether
// to resend or change the guardian email. A minor who does neither left that row
// with no expiry at all: GuardianConsentExpirySweepService acts on 'pending'
// rows only, and the 30-day deletion path starts only at the third decline, the
// second lapse or a withdrawal. The account stayed restricted-pending for ever,
// holding a child's data, contradicting legal copy v0.8 Part 4.4.
//
// WHAT THIS DOES. A row that is 'declined' by an EXPLICIT decline with fewer than
// three recorded, belongs to an 'active' minor, and has not been reopened within
// GUARDIAN_DECLINE_LAPSE_DAYS (default 14) of Guardian.consentDeclinedAt is moved
// onto the lapse path of an unanswered request AT ITS FIRST STAGE:
//   1. the row is reopened as 'pending' with a fresh token and expiry (the same
//      reopen the minor's own resend performs, so token rotation and the email
//      to the guardian are not reimplemented);
//   2. consentAutoResentAt is stamped, i.e. the one automatic chase is spent;
//   3. the minor is emailed a warning that a second lapse closes the account.
// From there the EXISTING GuardianConsentExpirySweepService takes over: when that
// new request lapses, consentAutoResentAt is already set, so it goes straight to
// refuseConsentAndScheduleDeletion('expired') -- the ordinary 30-day grace path.
// This class writes no account state of its own.
//
// WHY THE FIRST STAGE AND NOT STRAIGHT TO CLOSURE. The unanswered-request path
// never closes an account without the minor having been warned first (that is
// why it is staged). A declined-and-abandoned row has had no email at all: the
// minor only ever saw the decline page inside the account. Closing it directly
// would be the one route to deletion with no warning. Entering at stage 1 gives
// the minor the warning and a further request window (72h by default) before
// closure, using existing code.
//
// WHAT IT DOES NOT DO. An expiry never counts among the three declines
// (declineCount is untouched here, and only reason 'declined' increments it);
// the third decline, withdrawal and expiry rows are never selected (they are
// terminal and already on the deletion path); and a row the minor reopened in
// time is 'pending', so it is not selected.
//
// Hourly, like the expiry sweep, for the same reason: the stages chain, so any
// interval is added to the real deadline.
@Injectable()
export class GuardianStaleDeclineSweepService {
  private readonly logger = new Logger(GuardianStaleDeclineSweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly guardianConsentService: GuardianConsentService,
    private readonly emailService: RegistrationEmailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    const result = await this.sweepStaleDeclines();
    // Logged unconditionally, like the expiry sweep: a sweep that logs nothing
    // is indistinguishable from one that never ran.
    this.logger.log(`Guardian stale-decline sweep complete: chased=${result.chasedGuardianIds.length}`);
  }

  // `now` is an explicit parameter so tests can prove the window boundary
  // without mocking global time (same convention as the expiry sweep).
  async sweepStaleDeclines(now: Date = new Date()): Promise<StaleDeclineSweepResult> {
    const cutoff = new Date(now.getTime() - getDeclineLapseDays(this.config) * 24 * 60 * 60 * 1000);

    const stale = await this.prisma.guardian.findMany({
      where: {
        consentStatus: 'declined',
        consentDeclineSource: EXPLICIT_DECLINE_SOURCE,
        declineCount: { lt: MAX_EXPLICIT_DECLINES },
        consentDeclinedAt: { lte: cutoff },
        // Same account conditions the reopen itself enforces: a minor, still
        // active. An adult reclassified at 18 (Decision Log #349) or an account
        // already on the deletion path is never chased.
        minorUser: { isMinor: true, accountStatus: 'active' },
      },
      select: {
        id: true,
        email: true,
        minorUser: { select: { email: true, displayName: true } },
      },
    });

    const chasedGuardianIds: string[] = [];

    for (const guardian of stale) {
      try {
        const reopened = await this.guardianConsentService.reissueConsentToken({
          guardianId: guardian.id,
          minorDisplayName: guardian.minorUser.displayName,
          markAutoResent: true,
          reopenDeclined: true,
        });
        // false = the row changed under us (reopened, made final, or the
        // account left 'active'): nothing was sent, so nothing to warn about.
        if (!reopened) continue;
        chasedGuardianIds.push(guardian.id);

        // After the re-send has committed, and never able to undo it: the same
        // posture the expiry sweep takes with its minor warning.
        try {
          await this.emailService.sendConsentDeclineLapseReminderEmail(
            guardian.minorUser.email,
            guardian.minorUser.displayName,
            guardian.email,
          );
        } catch (err) {
          this.logger.error(
            `Guardian stale-decline sweep: reopened guardian ${guardian.id} but failed to notify the minor: ` +
              `${(err as Error).message}`,
          );
        }
      } catch (err) {
        // One bad row must not strand the rest. Safe to retry: a failure before
        // the reopen commits leaves the row 'declined' and it is picked up again
        // next hour.
        this.logger.error(
          `Guardian stale-decline sweep: failed to process guardian ${guardian.id}: ` +
            `${(err as Error).message}. Left unchanged for the next run.`,
        );
      }
    }

    return { chasedGuardianIds };
  }
}
