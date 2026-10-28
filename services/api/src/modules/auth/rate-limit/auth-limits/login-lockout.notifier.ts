import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { RegistrationEmailService } from '../../registration/email/registration-email.service';
import { LOCKOUT_NOTICE_WINDOW_SECONDS } from './auth-limits.constants';
import { AuthLimitsStore, limitKey } from './auth-limits.store';

// The lockout notice: the first time an (account, IP) pair spends its failed-login budget, the account's
// registered address gets ONE plain security email. Rules (all deliberate):
//
// - Only if an account exists for that email. An unknown address does nothing, so the feature cannot be used
//   to probe which addresses are registered (and the lookup runs in the background for real and unknown
//   addresses alike, so the login response and its timing are identical either way).
// - Fire-and-forget. notifyInBackground() returns immediately; the lookup, the claim and the send all happen
//   after the response is on its way, and any failure is logged, never raised.
// - At most ONE notice per account per 24 hours, enforced with an atomic Redis SET NX (claim()). A claim is
//   given back if nothing could be sent (no usable web-app link), so a later lockout can try again.
// - The email says nothing about the guesser: no IP, no times, no count.
// - For a minor's account the notice goes to the account's OWN email only. Guardian notification is NOT built;
//   it is an open question for the founder.
@Injectable()
export class LoginLockoutNotifier {
  private readonly logger = new Logger(LoginLockoutNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AuthLimitsStore,
    private readonly email: RegistrationEmailService,
  ) {}

  // `normalisedEmail` must already be trimmed and lower-cased (the login lookup key).
  notifyInBackground(normalisedEmail: string): void {
    void this.notify(normalisedEmail).catch((err) => {
      this.logger.warn(`Login lockout notice failed: ${(err as Error)?.message ?? err}`);
    });
  }

  async notify(normalisedEmail: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalisedEmail },
      select: { email: true, accountStatus: true },
    });
    // No account, or an anonymised one whose address is a placeholder nobody can read.
    if (!user || user.accountStatus === 'deleted') return;

    const claimKey = limitKey('login-lockout-notice', normalisedEmail);
    const claimed = await this.store.claim(claimKey, LOCKOUT_NOTICE_WINDOW_SECONDS);
    if (claimed !== true) return;

    const sent = await this.email.sendLoginLockoutNoticeEmail(user.email);
    if (!sent) await this.store.clear(claimKey);
  }
}
