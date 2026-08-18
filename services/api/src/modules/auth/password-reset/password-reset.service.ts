import { BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { PasswordService } from '../password/password.service';
import { TokenService } from '../token/token.service';
import { PasswordResetEmailService } from './email/password-reset-email.service';
import { DEFAULT_RESET_TOKEN_TTL_MINUTES } from './reset-token.constants';
import { InvalidResetTokenError } from './reset-token.errors';
import { ConsumedResetToken, ResetTokenStore } from './reset-token.store';

// Deliberately generic and identical for both branches (existing account
// vs. no such account) — never let a caller distinguish "we found your
// email" from "we didn't" via this response. See forgotPassword() below
// for how the two branches are kept response-identical.
export const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If an account exists for that email address, a password reset link has been sent to it.';

// Section 5.7 doesn't set a password policy for reset (or register); this
// is a conservative, standard-practice minimum, applied here so
// /auth/reset-password can't be used to set a trivially weak password.
// If B2's /auth/register lands with a different minimum, that mismatch is
// a merge-time reconciliation item, not something this PR can pre-empt
// without seeing B2's code.
const MIN_PASSWORD_LENGTH = 8;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  private readonly resetTokenTtlMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resetTokenStore: ResetTokenStore,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly emailService: PasswordResetEmailService,
    configService: ConfigService,
  ) {
    this.resetTokenTtlMinutes =
      Number(configService.get('RESET_TOKEN_TTL_MINUTES')) || DEFAULT_RESET_TOKEN_TTL_MINUTES;
  }

  // Always resolves — never throws for "email not found", and always
  // returns void so the controller can return one fixed generic message
  // regardless of what happened here. Anti-enumeration is enforced at
  // this boundary, not left to the controller to remember.
  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      // No account: do real, comparable-cost work anyway (a no-op hash
      // verify against a fixed dummy hash) so this branch's timing is
      // closer to the found-account branch below. This is a best-effort
      // mitigation, not a guarantee of constant-time behavior over a real
      // network — Node/HTTP stacks make true constant-time responses
      // impractical — but it avoids the cheapest, most obvious timing
      // tell (skipping the expensive hash/Redis work entirely).
      await this.passwordService.verify(
        '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$dGltaW5nLWRlY295aGFzaA',
        'timing-decoy',
      );
      this.logger.debug(
        `forgot-password requested for an email with no matching account (details withheld from response)`,
      );
      return;
    }

    const issued = await this.resetTokenStore.issue(user.id, this.resetTokenTtlMinutes);
    await this.emailService.sendPasswordResetEmail(user.email, issued.token);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`newPassword must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    let consumed: ConsumedResetToken;
    try {
      consumed = await this.resetTokenStore.verifyAndConsume(rawToken);
    } catch (err) {
      if (err instanceof InvalidResetTokenError) {
        throw new UnauthorizedException(err.message);
      }
      throw err;
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({
      where: { id: consumed.userId },
      data: { passwordHash },
    });

    // Sensible-security-practice per the task spec: a password reset means
    // any previously-issued refresh token (e.g. from a device an attacker
    // who knew the old password was using) should stop working. B1's
    // TokenService already exposes exactly this (revokeAllSessionsForUser
    // -> RefreshTokenStore.revokeAllForUser), so this reuses it rather
    // than building a parallel mechanism.
    await this.tokenService.revokeAllSessionsForUser(consumed.userId);
  }
}
