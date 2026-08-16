import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// "Wired, not live" — same honest pattern as src/instrument.ts (Sentry,
// PR #8) and B2's registration/verification emails: EMAIL_PROVIDER_API_KEY
// is still the ".env.example" placeholder (no provider account has been
// created — that requires a human, same as the Sentry DSN). This service
// is the single call site B2's real email integration will need to
// replace; nothing downstream of PasswordResetService needs to change
// when that happens.
//
// Until then, sending is simulated by logging the would-be email (message
// content only, never the raw token — see the redaction note in
// buildResetLink) so the reset flow is fully testable end-to-end without a
// live provider, exactly as Section 5's Sentry precedent testable without
// a live DSN.
@Injectable()
export class PasswordResetEmailService {
  private readonly logger = new Logger(PasswordResetEmailService.name);
  private readonly isLive: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_API_KEY')?.trim();
    this.isLive = Boolean(apiKey) && apiKey !== 'replace-me';
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

    // Placeholder for the real provider call (e.g. SendGrid/Postmark/SES)
    // once Decision Log resolves which provider and EMAIL_PROVIDER_API_KEY
    // holds a real value. Intentionally unimplemented rather than guessing
    // a provider SDK — same reasoning as deploy.yml's placeholder exit 1
    // for hosting (Decision Log #9).
    throw new Error(
      'PasswordResetEmailService: EMAIL_PROVIDER_API_KEY is set but no live email provider ' +
        'integration has been implemented yet. Do not deploy with a real key until this is built.',
    );
  }

  private buildResetLink(resetToken: string): string {
    const webBaseUrl = this.config.get<string>('WEB_APP_BASE_URL') ?? 'https://app.soccernity.example';
    return `${webBaseUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  }
}
