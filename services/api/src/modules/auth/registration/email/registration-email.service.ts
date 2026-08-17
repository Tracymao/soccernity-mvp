import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RegistrationEmailTemplate = 'verify-email' | 'guardian-consent';

export interface OutboundRegistrationEmail {
  to: string;
  subject: string;
  template: RegistrationEmailTemplate;
  data: Record<string, string>;
}

// "Wired, not live" — the same honest pattern src/instrument.ts already
// established for Sentry (PR #8): .env.example's EMAIL_PROVIDER_API_KEY
// is still the literal placeholder string "replace-me" because no real
// email provider is configured yet (Build Plan Section 8.3 references the
// guardian-consent email's content but not a chosen vendor — that
// selection isn't made anywhere in Sections 3/4/5/9, so it's a Decision
// Log candidate this PR surfaces rather than guesses). With the
// placeholder in place, this service logs the would-be send (including
// the token, so it's retrievable from server logs for manual/dev
// verification) and resolves successfully — it does not attempt real
// delivery, and it does not fabricate a fake "delivered" provider
// response. Callers (RegistrationService) must never block registration
// on this succeeding — see the fire-and-forget-with-logging call sites
// there.
@Injectable()
export class RegistrationEmailService {
  private readonly logger = new Logger(RegistrationEmailService.name);
  private readonly isConfigured: boolean;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_API_KEY')?.trim();
    this.isConfigured = Boolean(apiKey) && apiKey !== 'replace-me';
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Verify your Soccernity email',
      template: 'verify-email',
      data: { token },
    });
  }

  // Build Plan Section 8.3, step 3: "An email is sent to the guardian's
  // address with a unique, single-use consent link — no app install
  // required on the guardian's side." The link itself (a web page, per
  // step 4) is a frontend concern; this only queues the email carrying
  // the token.
  async sendGuardianConsentEmail(
    to: string,
    consentToken: string,
    minorDisplayName: string,
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: `Consent requested for ${minorDisplayName}'s Soccernity account`,
      template: 'guardian-consent',
      data: { consentToken, minorDisplayName },
    });
  }

  private async dispatch(email: OutboundRegistrationEmail): Promise<void> {
    if (!this.isConfigured) {
      this.logger.log(
        `[email] EMAIL_PROVIDER_API_KEY not set — wired but inactive. ` +
          `Would send "${email.template}" to ${email.to} with data=${JSON.stringify(email.data)}`,
      );
      return;
    }

    // No real provider integration exists yet even once a key is present
    // — throwing here (rather than silently no-op'ing) means a real key
    // without a real integration fails loudly instead of pretending to
    // deliver. Wiring an actual provider (SendGrid/Postmark/SES/etc. —
    // vendor choice itself is a Decision Log candidate, see class comment
    // above) is future work, not something to fake here.
    throw new Error(
      'EMAIL_PROVIDER_API_KEY is set but no email provider integration exists yet — ' +
        'wire a real provider client before enabling this key.',
    );
  }
}
