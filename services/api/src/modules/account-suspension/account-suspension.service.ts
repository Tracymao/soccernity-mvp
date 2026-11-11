import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { TokenService } from '../auth/token/token.service';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import { revokeEngagementPointsForAccount } from '../points/engagement-points.util';

// backend/b291-suspension-on-report (B-291; Decision Log #485, founder decision of 2026-11-11).
//
// ONE place that suspends and reinstates an account. Two routes use it, so they cannot drift:
//   - PATCH /admin/users/:id (status 'suspended' / 'active'), the user page;
//   - recording user_suspended on a report, and the overturn of that report's appeal (ModerationService).
//
// Each operation is split in two phases, because the report path has to write the account status in the SAME
// transaction as the report update, while sessions, points, the guardian notice and the email cannot be part of a
// database transaction (Redis, background sends):
//   applySuspensionInTx / applyReinstatementInTx  -- the status write, inside the caller's transaction.
//   completeSuspension / completeReinstatement     -- everything else, after the transaction has committed.
// suspend() / reinstate() are the user-page conveniences that run both around a transaction of their own.
//
// Rules this file owns (decided in #485):
//   - An account that is already suspended is not suspended, emailed or reported to its guardian again.
//   - An account whose status is 'deleted' is never touched (terminal: its row is anonymised).
//   - suspendedByReportId is set only when the suspension is caused by a report AND the account was not already
//     suspended, and is never overwritten. A manual reinstatement clears it; so does the overturn of THAT report's
//     appeal. A different report's overturned appeal changes nothing.
//   - The suspended person is emailed at once for every suspension (report or user page), with a reason in fixed
//     plain words chosen from the report category, never free text, never the reporter, never a duration.
//   - Points revoked at suspension are not restored on reinstatement.

export type SuspensionOutcome = 'suspended' | 'already_suspended' | 'deleted' | 'not_found';

export interface SuspensionApplied {
  userId: string;
  outcome: SuspensionOutcome;
  /** The accountStatus before this call (null when the user was not found). */
  previousStatus: string | null;
}

export type ReinstatementOutcome =
  // The account was suspended and is now active (the only outcome that sends a notice and an email).
  | 'reinstated'
  // The account was not suspended (for example deactivated or pending deletion) and is now active: the user page's
  // other move to 'active'. Not a safety action: nothing is sent.
  | 'activated'
  // Overturn only: the account is no longer suspended (reinstated by hand, or since deleted) so only the link was
  // cleared and nothing is sent.
  | 'link_cleared'
  // Overturn only: the account is not linked to this report, so nothing changed.
  | 'not_linked'
  | 'deleted'
  | 'not_found';

export interface ReinstatementApplied {
  userId: string;
  outcome: ReinstatementOutcome;
  previousStatus: string | null;
}

export interface ApplySuspensionOptions {
  /** The report whose user_suspended action causes this suspension. Absent for a user-page suspension. */
  reportId?: string;
}

export interface CompleteSuspensionOptions {
  /** The report reason category (or the one the admin chose on the user page). Null/unknown = the generic line. */
  reasonCategory?: string | null;
}

@Injectable()
export class AccountSuspensionService {
  private readonly logger = new Logger(AccountSuspensionService.name);

  constructor(
    private readonly prisma: PrismaService,
    // The SAME session revocation AuthService.deactivateAccount and the admin user page already use.
    private readonly tokenService: TokenService,
    // B-279: the guardian of a minor is told the kind of action, once, by this path and no other.
    private readonly guardianNotices: GuardianSecurityNoticeService,
    private readonly emailService: RegistrationEmailService,
  ) {}

  // -------------------------------------------------------------------
  // Suspension
  // -------------------------------------------------------------------

  /** Writes accountStatus 'suspended' inside the caller's transaction. Safe to call for any user id. */
  async applySuspensionInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    options: ApplySuspensionOptions = {},
  ): Promise<SuspensionApplied> {
    // The write is guarded on the status that was read, so two simultaneous suspensions give exactly one winner
    // (and so one set of side effects). A lost race is re-read: it resolves to "already suspended" or "deleted",
    // or to a retry against the new status.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
      if (!user) return { userId, outcome: 'not_found', previousStatus: null };
      if (user.accountStatus === 'deleted') return { userId, outcome: 'deleted', previousStatus: 'deleted' };
      if (user.accountStatus === 'suspended') {
        return { userId, outcome: 'already_suspended', previousStatus: 'suspended' };
      }

      const data: Prisma.UserUncheckedUpdateManyInput = { accountStatus: 'suspended' };
      // Clear a stale pendingDeletionAt when an account moves OUT of pending_deletion (same hygiene as the
      // reinstatement path): the deletion sweep also checks accountStatus, but a stale timestamp is needless debt.
      if (user.accountStatus === 'pending_deletion') data.pendingDeletionAt = null;
      // Only a report-caused suspension of an account that was not already suspended records the link.
      if (options.reportId) data.suspendedByReportId = options.reportId;

      const written = await tx.user.updateMany({
        where: { id: userId, accountStatus: user.accountStatus },
        data,
      });
      if (written.count === 1) return { userId, outcome: 'suspended', previousStatus: user.accountStatus };
    }
    throw new ConflictException('The account changed while it was being suspended. Try again.');
  }

  /**
   * Everything that follows a committed suspension: end the sessions, revoke baseline points, tell the guardian
   * of a minor once, email the suspended person. Does nothing unless this call actually suspended the account.
   * The session and points steps throw on failure (a suspended account with live sessions must not pass
   * silently); the guardian notice and the email are background and never throw.
   */
  async completeSuspension(applied: SuspensionApplied, options: CompleteSuspensionOptions = {}): Promise<void> {
    if (applied.outcome !== 'suspended') return;

    // Blocking future logins is meaningless if the person's current still-valid tokens keep working.
    await this.tokenService.revokeAllSessionsForUser(applied.userId);
    // backend/w12-points (B-093, spec 9b): a suspended account is restricted, so its baseline points are revoked
    // (what it earned, and what it earned others by engaging with them). Not undone if the suspension is lifted.
    await revokeEngagementPointsForAccount(this.prisma, applied.userId, new Date());

    this.guardianNotices.notifyInBackground(applied.userId, 'account_suspended');
    this.emailInBackground(applied.userId, (to) =>
      this.emailService.sendAccountSuspendedEmail(to, options.reasonCategory ?? null),
    );
  }

  /** The user page: apply in a transaction of its own, then complete. */
  async suspend(userId: string, options: CompleteSuspensionOptions = {}): Promise<SuspensionApplied> {
    const applied = await this.prisma.$transaction((tx) => this.applySuspensionInTx(tx, userId));
    await this.completeSuspension(applied, options);
    return applied;
  }

  // -------------------------------------------------------------------
  // Reinstatement
  // -------------------------------------------------------------------

  /**
   * Writes accountStatus 'active' inside the caller's transaction.
   *   - With no option (the user page): any account except a deleted one becomes active, the stored report link is
   *     cleared, and a stale pendingDeletionAt is cleared when the account was pending deletion.
   *   - With onlyIfSuspendedByReportId (an overturned appeal): acts only when the account's stored link IS that
   *     report. If the account is still suspended it becomes active; if it is no longer suspended only the link is
   *     cleared. Any other account is left exactly as it is.
   */
  async applyReinstatementInTx(
    tx: Prisma.TransactionClient,
    userId: string,
    options: { onlyIfSuspendedByReportId?: string } = {},
  ): Promise<ReinstatementApplied> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { accountStatus: true, suspendedByReportId: true },
    });
    if (!user) return { userId, outcome: 'not_found', previousStatus: null };

    if (options.onlyIfSuspendedByReportId) {
      const reportId = options.onlyIfSuspendedByReportId;
      if (user.suspendedByReportId !== reportId) {
        return { userId, outcome: 'not_linked', previousStatus: user.accountStatus };
      }
      const stillSuspended = user.accountStatus === 'suspended';
      const written = await tx.user.updateMany({
        where: { id: userId, suspendedByReportId: reportId },
        data: stillSuspended ? { accountStatus: 'active', suspendedByReportId: null } : { suspendedByReportId: null },
      });
      if (written.count !== 1) return { userId, outcome: 'not_linked', previousStatus: user.accountStatus };
      return { userId, outcome: stillSuspended ? 'reinstated' : 'link_cleared', previousStatus: user.accountStatus };
    }

    if (user.accountStatus === 'deleted') return { userId, outcome: 'deleted', previousStatus: 'deleted' };

    const data: Prisma.UserUncheckedUpdateInput = { accountStatus: 'active' };
    if (user.accountStatus === 'pending_deletion') data.pendingDeletionAt = null;
    // A manual reinstatement clears the stored report: the suspension is over, whoever caused it.
    if (user.accountStatus === 'suspended') data.suspendedByReportId = null;
    await tx.user.update({ where: { id: userId }, data });
    return {
      userId,
      outcome: user.accountStatus === 'suspended' ? 'reinstated' : 'activated',
      previousStatus: user.accountStatus,
    };
  }

  /** After the commit: the guardian notice (once) and the reinstatement email, only when a suspension was lifted. */
  async completeReinstatement(applied: ReinstatementApplied): Promise<void> {
    if (applied.outcome !== 'reinstated') return;
    this.guardianNotices.notifyInBackground(applied.userId, 'account_reinstated');
    this.emailInBackground(applied.userId, (to) => this.emailService.sendAccountReinstatedEmail(to));
  }

  /** The user page: apply in a transaction of its own, then complete. */
  async reinstate(userId: string): Promise<ReinstatementApplied> {
    const applied = await this.prisma.$transaction((tx) => this.applyReinstatementInTx(tx, userId));
    await this.completeReinstatement(applied);
    return applied;
  }

  // -------------------------------------------------------------------
  // Email (queued in the background; a lookup or send failure is logged and never thrown)
  // -------------------------------------------------------------------

  private emailInBackground(userId: string, send: (to: string) => Promise<void>): void {
    void (async () => {
      try {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, accountStatus: true },
        });
        // An anonymised account's placeholder address must never receive mail.
        if (!user || user.accountStatus === 'deleted' || !user.email) return;
        await send(user.email);
      } catch (err) {
        this.logger.warn(`Failed to queue an account email for user ${userId}: ${(err as Error).message}`);
      }
    })();
  }
}
