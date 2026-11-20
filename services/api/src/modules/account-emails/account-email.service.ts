import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GRACE_PERIOD_DAYS } from '../account-deletion/account-deletion-sweep.service';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';

// backend/b069-transactional-emails (B-069; Decision Log #472, adopted default (a)).
//
// One place that decides WHEN each of the plain account emails is sent to a USER (the staff-account email is sent
// by AdminStaffRolesService, which already holds the admin's details). The templates live on
// RegistrationEmailService, the shared Postmark sender.
//
// Every method here is FIRE-AND-LOG: it never throws, and the callers use the *InBackground forms, which return
// at once, so the action that caused the email (a password change, a deletion request, an email verification, a
// guardian's approval) is never failed or delayed by it. The lookup of the person's name and address happens here,
// after the action has committed, so the callers carry no extra reads.
//
// Callers inject this with @Optional(): a unit test or module that does not provide it simply sends nothing.

// "Hi [First name]" in the frames. The account holds one display name (their real name), so the first word of it
// is used; with no usable name the greeting is "there". DEFAULT, founder-veto-able.
export function firstNameOf(displayName: string | null | undefined): string {
  const first = (displayName ?? '').trim().split(/\s+/)[0];
  return first ? first : 'there';
}

interface Recipient {
  email: string;
  displayName: string;
  accountStatus: string;
}

@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: RegistrationEmailService,
  ) {}

  // After a password change made while signed in (AuthService.changePassword).
  passwordChangedInBackground(userId: string): void {
    void this.passwordChanged(userId);
  }

  async passwordChanged(userId: string): Promise<void> {
    await this.run('password-changed', userId, async () => {
      const user = await this.recipient(userId);
      if (!user) return;
      await this.email.sendPasswordChangedEmail(user.email, firstNameOf(user.displayName));
    });
  }

  // After a password change made through the emailed reset link (PasswordResetService.resetPassword).
  passwordResetCompletedInBackground(userId: string): void {
    void this.passwordResetCompleted(userId);
  }

  async passwordResetCompleted(userId: string): Promise<void> {
    await this.run('password-reset-completed', userId, async () => {
      const user = await this.recipient(userId);
      if (!user) return;
      await this.email.sendPasswordResetCompletedEmail(user.email, firstNameOf(user.displayName));
    });
  }

  // After a SELF-SERVICE deletion request (AuthService.deleteAccount / deleteInactiveAccount). Deliberately not
  // called for a deletion that starts because a guardian declined, withdrew or let a request lapse: that person
  // did not ask for it, and the minor is already told through the guardian-consent emails.
  deletionRequestedInBackground(userId: string): void {
    void this.deletionRequested(userId);
  }

  async deletionRequested(userId: string): Promise<void> {
    await this.run('account-deletion-requested', userId, async () => {
      const user = await this.recipient(userId);
      if (!user) return;
      await this.email.sendAccountDeletionRequestedEmail(user.email, firstNameOf(user.displayName), GRACE_PERIOD_DAYS);
    });
  }

  // Called after each of the two events that can complete "fully active": the email being verified, and a
  // guardian approving. The account is ready, and the welcome is sent, only when ALL of these hold: the account is
  // 'active', the email is verified, and (for a minor) the guardian has confirmed consent. Whichever event comes
  // SECOND therefore sends it; the first one finds the account not ready yet and sends nothing. An adult is ready
  // at email verification. It never sends before that, for an adult or a minor. Each event happens once, so the welcome is sent once; a verification and
  // an approval landing in the very same instant could in principle send it twice or not at all (no sent-flag
  // exists, and none was added: DEFAULT, founder-veto-able).
  welcomeIfReadyInBackground(userId: string): void {
    void this.welcomeIfReady(userId);
  }

  async welcomeIfReady(userId: string): Promise<void> {
    await this.run('welcome', userId, async () => {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          displayName: true,
          accountStatus: true,
          verificationStatus: true,
          isMinor: true,
          guardian: { select: { consentStatus: true } },
        },
      });
      if (!user) return;
      if (user.accountStatus !== 'active') return;
      if (user.verificationStatus !== 'verified') return;
      if (user.isMinor && user.guardian?.consentStatus !== 'confirmed') return;
      await this.email.sendWelcomeEmail(user.email, firstNameOf(user.displayName));
    });
  }

  // The address and name to write to. An anonymised account ('deleted') has a made-up address and is never
  // emailed.
  private async recipient(userId: string): Promise<Recipient | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true, accountStatus: true },
    });
    if (!user || user.accountStatus === 'deleted') return null;
    return user;
  }

  // Never throws: a lookup or send problem becomes a log line, never a failure of the caller's action. The log
  // carries the template and the user id only (no address, no name).
  private async run(template: string, userId: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (err) {
      this.logger.warn(`Could not send the "${template}" email for user ${userId}: ${(err as Error)?.message ?? err}`);
    }
  }
}
