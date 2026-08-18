import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerClient } from 'postmark';

// Decision Log #17 (Build Plan Section 9): Postmark is the chosen
// transactional email provider — same pattern as
// registration/email/registration-email.service.ts and
// src/instrument.ts's Sentry DSN (PR #8): wired to activate
// automatically the instant a real value replaces .env.example's
// EMAIL_PROVIDER_API_KEY placeholder. Creating the actual Postmark
// account and swapping in a real key is a human action (billing,
// domain/DKIM verification), out of this PR's scope; until then,
// `isLive` stays false and this service logs the would-be send instead
// of calling Postmark.
//
// Unlike the not-live branch (which deliberately logs the full reset
// link, including the token, purely for dev/manual testing — see
// buildResetLink's own note), the live branch below never logs the
// link or token, only send success/failure and Postmark's MessageID.
@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);
  private readonly isLive: boolean;
  private readonly postmarkClient?: ServerClient;
  private readonly fromEmail?: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_API_KEY')?.trim();
    this.isLive = Boolean(apiKey) && apiKey !== 'replace-me';
    if (this.isLive) {
      this.postmarkClient = new ServerClient(apiKey!);
      this.fromEmail = this.config.get<string>('POSTMARK_FROM_EMAIL')?.trim();
    }
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetLink = this.buildResetLink(resetToken);

    if (!this.isLive) {
      // Graceful no-op, matching src/instrument.ts's Sentry pattern: log
      // that the send was queued/simulated rather than silently dropping
      // it or throwing. The full link (including token) is logged here —
      // server logs, not the HTTP response — purely so a developer can
      // exercise the reset flow locally without a real inbox; this must
      // not be treated as an acceptable place to log tokens once a real
      // provider is wired in.
      this.logger.log(
        `[email:not-live] EMAIL_PROVIDER_API_KEY not set — password-reset email to ${email} ` +
          `was NOT actually sent. Would have contained: ${resetLink}`,
      );
      return;
    }

    // Never let a Postmark failure (network error, invalid/bounced
    // address, etc.) propagate — PasswordResetService already treats
    // this whole call as fire-and-forget-with-logging (see its own
    // .catch() call site), so the failure is caught and logged here, as
    // close to the actual API call as possible, rather than bubbling up
    // and failing the reset flow itself.
    try {
      const result = await this.postmarkClient!.sendEmail({
        From: this.fromEmail ?? '',
        To: email,
        Subject: 'Reset your Soccernity password',
        HtmlBody: `<p>We received a request to reset your Soccernity password.</p><p><a href="${resetLink}">Reset your password</a></p><p>If you did not request this, you can safely ignore this email.</p>`,
        TextBody: `We received a request to reset your Soccernity password.\n\n${resetLink}\n\nIf you did not request this, you can safely ignore this email.`,
        MessageStream: 'outbound',
      });
      this.logger.log(`[email] sent password-reset email to ${email} (MessageID=${result.MessageID})`);
    } catch (err) {
      this.logger.error(
        `[email] failed to send password-reset email to ${email}: ${(err as Error).message}`,
      );
    }
  }

  private buildResetLink(resetToken: string): string {
    const webBaseUrl = this.config.get<string>('WEB_APP_BASE_URL') ?? 'https://app.soccernity.example';
    return `${webBaseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  }
}
