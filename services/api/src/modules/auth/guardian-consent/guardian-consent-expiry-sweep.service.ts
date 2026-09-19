import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../prisma/prisma.service';
import { RegistrationEmailService } from '../registration/email/registration-email.service';
import { GuardianConsentService } from './guardian-consent.service';

export interface ConsentExpirySweepResult {
  // Guardian rows whose ORIGINAL consent request had lapsed and which
  // were given their one automatic re-send (plus a nudge to the minor).
  autoResentGuardianIds: string[];
  // Guardian rows whose RE-SENT request had also lapsed, and which were
  // therefore treated as an implicit decline.
  implicitlyDeclinedGuardianIds: string[];
}

// sprint-1/guardian-consent-decline-withdraw-expiry -- Build Plan Section
// 8.3, and the gap DPIA finding R5 left open.
//
// R5 added Guardian.consentTokenExpiresAt and a manual re-send endpoint,
// but nothing anywhere ever ACTED on that expiry. A guardian who simply
// never answered left the minor's account restricted-pending forever:
// unusable to them, and holding a child's personal data indefinitely with
// no resolution path and no further contact from the platform. This sweep
// is what finally resolves those rows, in two stages:
//
//   FIRST expiry  (consentAutoResentAt IS NULL)
//       -> one automatic re-send of the consent request to the guardian,
//          through GuardianConsentService.reissueConsentToken() -- the
//          exact same code path the manual re-send endpoint uses, not a
//          copy -- plus an email to the MINOR telling them it has lapsed,
//          that a new request has gone out, and that a second silent
//          lapse will close their account. That warning is the whole
//          point of staging this: nobody's account is closed without
//          having been told it was about to be.
//
//   SECOND expiry (consentAutoResentAt IS NOT NULL)
//       -> treated as an implicit decline, via the same
//          GuardianConsentService.refuseConsentAndScheduleDeletion()
//          primitive an explicit decline or withdrawal uses. From that
//          point the account is on the ordinary 30-day
//          AccountDeletionSweepService path (Decision Log #42/#44) --
//          this service invents no new account state of its own.
//
// With the default 72-hour TTL that is roughly six days from
// registration to closure, with one automatic chase and one explicit
// warning in between.
//
// WHY HOURLY, not daily like AccountDeletionSweepService: the two stages
// chain, so any sweep interval is added to BOTH windows. A daily tick
// would stretch a 72h+72h policy to as much as eight days and make the
// real deadline depend on what time of day someone happened to register.
// Hourly keeps the actual behaviour within about an hour of the
// configured TTL. This is a cheap, indexed query
// (Guardian.@@index([consentStatus, consentTokenExpiresAt])) over a table
// that only ever holds rows for minors, so the extra frequency costs
// effectively nothing.
@Injectable()
export class GuardianConsentExpirySweepService {
  private readonly logger = new Logger(GuardianConsentExpirySweepService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guardianConsentService: GuardianConsentService,
    private readonly emailService: RegistrationEmailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async runHourlySweep(): Promise<void> {
    const result = await this.sweepExpiredConsentRequests();
    // Logged unconditionally, including the all-zero case, matching
    // AccountDeletionSweepService.runDailySweep()'s own behaviour -- a
    // sweep that silently logs nothing is indistinguishable from a sweep
    // that never ran, which matters for a job whose end state is account
    // closure.
    this.logger.log(
      `Guardian consent expiry sweep complete: autoResent=${result.autoResentGuardianIds.length} ` +
        `implicitlyDeclined=${result.implicitlyDeclinedGuardianIds.length}`,
    );
  }

  // `now` defaults to the real clock but is an explicit parameter, exactly
  // like AccountDeletionSweepService.sweepPendingDeletions(now) and
  // LeaderboardRollupService.runRollup(now) -- so tests can prove the
  // first-expiry / second-expiry boundary deterministically without
  // mocking global time. @Cron() itself always calls the wrapper above
  // with no arguments, which the default covers.
  async sweepExpiredConsentRequests(now: Date = new Date()): Promise<ConsentExpirySweepResult> {
    // Only 'pending' rows are ever in scope. A confirmed guardian's token
    // expiring is meaningless (consent is already given, and the row is
    // kept for the audit trail), and a 'declined' row is already resolved
    // and already on the deletion path.
    const expired = await this.prisma.guardian.findMany({
      where: {
        consentStatus: 'pending',
        consentTokenExpiresAt: { lte: now },
      },
      select: {
        id: true,
        email: true,
        minorUserId: true,
        consentAutoResentAt: true,
        minorUser: { select: { email: true, displayName: true, accountStatus: true } },
      },
    });

    const autoResentGuardianIds: string[] = [];
    const implicitlyDeclinedGuardianIds: string[] = [];

    for (const guardian of expired) {
      try {
        if (guardian.consentAutoResentAt === null) {
          await this.autoResend(guardian);
          autoResentGuardianIds.push(guardian.id);
          continue;
        }

        await this.guardianConsentService.refuseConsentAndScheduleDeletion({
          guardianId: guardian.id,
          minorUserId: guardian.minorUserId,
          reason: 'expired',
        });
        implicitlyDeclinedGuardianIds.push(guardian.id);
      } catch (err) {
        // One bad row must not abort the whole run and strand every other
        // expired request until the next tick -- the same per-row
        // try/catch discipline AccountDeletionSweepService.
        // sweepPendingDeletions() applies for the same reason. Failing a
        // row here is safe to retry: the first-expiry branch has not yet
        // stamped consentAutoResentAt (so the row is picked up again next
        // hour and still gets its one chase), and the second-expiry branch
        // is idempotent by construction (refuseConsentAndScheduleDeletion
        // no-ops on an already-declined row).
        this.logger.error(
          `Guardian consent expiry sweep: failed to process guardian ${guardian.id}: ` +
            `${(err as Error).message}. Left unchanged for the next run.`,
        );
      }
    }

    return { autoResentGuardianIds, implicitlyDeclinedGuardianIds };
  }

  private async autoResend(guardian: {
    id: string;
    email: string;
    minorUser: { email: string; displayName: string; accountStatus: string } | null;
  }): Promise<void> {
    // Guardian.minorUserId is a real FK with ON DELETE RESTRICT, so a null
    // minorUser is not reachable in practice. If it somehow were, there is
    // no display name to address the guardian's email with and no minor to
    // nudge -- so skip rather than send a malformed request to a real
    // guardian's inbox.
    if (!guardian.minorUser) {
      this.logger.warn(
        `Guardian consent expiry sweep: guardian ${guardian.id} has no minor User row; skipped.`,
      );
      return;
    }

    // markAutoResent: true is what makes this row's NEXT lapse terminal.
    // Passed explicitly here and explicitly false at the manual-resend
    // call site, so the two can never silently swap behaviour -- see
    // reissueConsentToken()'s own comment.
    await this.guardianConsentService.reissueConsentToken({
      guardianId: guardian.id,
      minorDisplayName: guardian.minorUser.displayName,
      markAutoResent: true,
    });

    // The minor's warning. Sent AFTER the re-send succeeds, so it can
    // never promise "we have sent a new request" when no new request
    // actually went out. Failure to notify must not undo the re-send
    // itself (which has already committed), so it is caught and logged
    // rather than thrown -- the same posture
    // GuardianConsentService.notifyMinorOfRefusal() takes.
    try {
      await this.emailService.sendConsentReminderEmail(
        guardian.minorUser.email,
        guardian.minorUser.displayName,
        guardian.email,
      );
    } catch (err) {
      this.logger.error(
        `Guardian consent expiry sweep: re-sent consent request for guardian ${guardian.id} ` +
          `but failed to notify the minor: ${(err as Error).message}`,
      );
    }
  }
}
