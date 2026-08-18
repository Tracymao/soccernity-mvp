import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerClient } from 'postmark';

export type RegistrationEmailTemplate = 'verify-email' | 'guardian-consent';

export interface OutboundRegistrationEmail {
  to: string;
  subject: string;
  template: RegistrationEmailTemplate;
  data: Record<string, string>;
}

// Decision Log #17 (Build Plan Section 9): Postmark is the chosen
// transactional email provider. Wired to activate automatically the
// instant a real value replaces .env.example's EMAIL_PROVIDER_API_KEY
// placeholder ("replace-me") — exactly src/instrument.ts's existing
// Sentry-DSN pattern (PR #8). Creating the actual Postmark account and
// swapping in a real key is a human action (billing, domain/DKIM
// verification) outside this PR's scope; until that happens,
// `isConfigured` stays false and this service logs the would-be send
// instead of calling Postmark, so the existing test suite (and any
// dev/local run) never needs a live account or network access.
//
// No Postmark message templates exist yet (that's also account-side
// setup) — the live branch below builds a minimal inline HTML/text body
// per template rather than calling `sendEmailWithTemplate`. Also note:
// unlike the not-live branch (which deliberately logs the raw token for
// dev/manual testing), the live branch never logs email content or
// tokens — only send success/failure and Postmark's MessageID.
@Injectable()
export class RegistrationEmailService {
  private readonly logger = new Logger(RegistrationEmailService.name);
  private readonly isConfigured: boolean;
  private readonly postmarkClient?: ServerClient;
  private readonly fromEmail?: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('EMAIL_PROVIDER_API_KEY')?.trim();
    this.isConfigured = Boolean(apiKey) && apiKey !== 'replace-me';
    if (this.isConfigured) {
      this.postmarkClient = new ServerClient(apiKey!);
      this.fromEmail = this.config.get<string>('POSTMARK_FROM_EMAIL')?.trim();
    }
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

    // Never let a Postmark failure (network error, invalid/bounced
    // address, etc.) propagate — RegistrationService already treats
    // this whole call as fire-and-forget-with-logging (see its own
    // .catch() call sites), so the failure is caught and logged here,
    // as close to the actual API call as possible, rather than bubbling
    // up and failing registration itself.
    try {
      const result = await this.postmarkClient!.sendEmail({
        From: this.fromEmail ?? '',
        To: email.to,
        Subject: email.subject,
        HtmlBody: renderHtmlBody(email.template, email.data),
        TextBody: renderTextBody(email.template, email.data),
        MessageStream: 'outbound',
      });
      this.logger.log(
        `[email] sent "${email.template}" to ${email.to} (MessageID=${result.MessageID})`,
      );
    } catch (err) {
      this.logger.error(
        `[email] failed to send "${email.template}" to ${email.to}: ${(err as Error).message}`,
      );
    }
  }
}

// Minimal, functional inline bodies — not final consent-flow copy.
// Section 8.3 step 4's actual guardian-facing language belongs to the
// safeguarding-drafter agent / legal review (CLAUDE.md non-negotiable
// #2), same as the DPIA and consent-screen copy; this is just enough
// content to make a real Postmark send meaningful, not a design
// deliverable.
function renderTextBody(template: RegistrationEmailTemplate, data: Record<string, string>): string {
  switch (template) {
    case 'verify-email':
      return `Your Soccernity email verification code is: ${data.token}\n\nIf you did not request this, you can safely ignore this email.`;
    case 'guardian-consent':
      return (
        `${data.minorDisplayName} has registered for a Soccernity account and listed you as their guardian.\n\n` +
        `Your consent code is: ${data.consentToken}\n\n` +
        `If you did not expect this email, you can safely ignore it.`
      );
    default:
      throw new Error(`Unknown registration email template: ${template as string}`);
  }
}

function renderHtmlBody(template: RegistrationEmailTemplate, data: Record<string, string>): string {
  switch (template) {
    case 'verify-email':
      return `<p>Your Soccernity email verification code is: <strong>${data.token}</strong></p><p>If you did not request this, you can safely ignore this email.</p>`;
    case 'guardian-consent':
      return (
        `<p><strong>${data.minorDisplayName}</strong> has registered for a Soccernity account and listed you as their guardian.</p>` +
        `<p>Your consent code is: <strong>${data.consentToken}</strong></p>` +
        `<p>If you did not expect this email, you can safely ignore it.</p>`
      );
    default:
      throw new Error(`Unknown registration email template: ${template as string}`);
  }
}
