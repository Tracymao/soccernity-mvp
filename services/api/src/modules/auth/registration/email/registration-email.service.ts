import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerClient } from 'postmark';

// sprint-1/guardian-consent-decline-withdraw-expiry added the five
// guardian-consent lifecycle templates below the original two. Four of
// them go to the MINOR (not the guardian) — Build Plan Section 8.3's flow
// only ever emailed the guardian, so a minor whose account was restricted
// had no way to learn what had happened to it. "Notify the minor plainly
// why" is a safeguarding requirement of that PR's brief, not a nicety.
// feat/public-report-submission added 'public-report-acknowledgement' —
// see RegistrationEmailService.sendPublicReportAcknowledgementEmail's
// own comment for why this generic email-service abstraction (built for
// the registration/guardian-consent flows) is the right place for a
// moderation-adjacent email too, rather than a new service.
export type RegistrationEmailTemplate =
  | 'verify-email'
  | 'guardian-consent'
  | 'guardian-consent-withdrawal-request'
  | 'guardian-consent-declined'
  | 'guardian-consent-withdrawn'
  | 'guardian-consent-reminder'
  | 'guardian-consent-expired'
  | 'guardian-minor-turned-18'
  | 'guardian-email-replaced'
  | 'public-report-acknowledgement'
  | 'report-actioned'
  | 'appeal-decision';

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

  // ---------------------------------------------------------------
  // sprint-1/guardian-consent-decline-withdraw-expiry
  // ---------------------------------------------------------------

  // To the GUARDIAN. Carries the fresh, single-use withdrawal token
  // (Guardian.withdrawalToken) issued by
  // POST /auth/guardian-consent/withdraw/request. Deliberately the only
  // way that token ever reaches anyone: the request endpoint takes the
  // MINOR's email and always responds generically, so even a caller who
  // guessed a real minor's address learns nothing and the link itself
  // only ever lands in the guardian's own inbox.
  async sendGuardianWithdrawalRequestEmail(
    to: string,
    withdrawalToken: string,
    minorDisplayName: string,
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: `Confirm withdrawing consent for ${minorDisplayName}'s Soccernity account`,
      template: 'guardian-consent-withdrawal-request',
      data: { withdrawalToken, minorDisplayName },
    });
  }

  // To the MINOR — their guardian actively declined the request.
  async sendConsentDeclinedEmail(to: string, minorDisplayName: string, graceDays: number): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity account was not approved',
      template: 'guardian-consent-declined',
      data: { minorDisplayName, graceDays: String(graceDays) },
    });
  }

  // To the MINOR — their guardian withdrew consent that had previously
  // been given. Distinct copy from a plain decline: the account really
  // did work before, and saying "was not approved" would be false.
  async sendConsentWithdrawnEmail(to: string, minorDisplayName: string, graceDays: number): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Guardian consent for your Soccernity account has been withdrawn',
      template: 'guardian-consent-withdrawn',
      data: { minorDisplayName, graceDays: String(graceDays) },
    });
  }

  // To the MINOR — first expiry. Nobody has answered, and the platform has
  // just automatically re-sent the request. This is a nudge to go and ask
  // their guardian in person, and the one warning they get before the
  // second lapse becomes terminal, so it says so explicitly.
  async sendConsentReminderEmail(
    to: string,
    minorDisplayName: string,
    guardianEmail: string,
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity account is still waiting for guardian approval',
      template: 'guardian-consent-reminder',
      data: { minorDisplayName, guardianEmail },
    });
  }

  // To the MINOR — second expiry. The re-sent request also lapsed
  // unanswered, so it is treated as an implicit decline.
  async sendConsentExpiredEmail(to: string, minorDisplayName: string, graceDays: number): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity account was not approved in time',
      template: 'guardian-consent-expired',
      data: { minorDisplayName, graceDays: String(graceDays) },
    });
  }

  // sprint-1/age-reclassification-notifications: To the GUARDIAN, purely
  // informational -- the child turned 18 and the account is no longer
  // guardian-consent-gated. Asks nothing of them. Copy is founder-approved
  // verbatim. Guardian.name is a single full-name column (Decision Log
  // #63), so the greeting uses its first whitespace-delimited token.
  async sendGuardianMinorTurned18Email(
    to: string,
    minorDisplayName: string,
    guardianName: string,
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: `An update on ${minorDisplayName}'s Soccernity account`,
      template: 'guardian-minor-turned-18',
      data: { minorDisplayName, guardianFirstName: guardianName.trim().split(/\s+/)[0] ?? '' },
    });
  }

  // safeguarding/guardian-email-change-endpoint (Decision Log #365): To the
  // PREVIOUS guardian address after a minor replaced it while consent was
  // pending. Tells the person who was originally asked that the request they
  // received no longer stands, so a minor cannot quietly swap a parent for
  // someone else with the parent none the wiser. Deliberately does NOT name
  // the new address (it may belong to a different person and the old holder
  // has no claim on it) and asks nothing of them beyond contacting support if
  // this is unexpected. Plain functional copy, NOT counsel-reviewed.
  async sendGuardianEmailReplacedEmail(to: string, minorDisplayName: string): Promise<void> {
    await this.dispatch({
      to,
      subject: `The Soccernity approval request for ${minorDisplayName} was withdrawn`,
      template: 'guardian-email-replaced',
      data: { minorDisplayName },
    });
  }

  // ---------------------------------------------------------------
  // feat/public-report-submission
  // ---------------------------------------------------------------

  // To the non-authenticated REPORTER (a parent, a school, a member of
  // the public with no Soccernity account) who just filed a report via
  // POST /reports/public. This service already existed as this
  // codebase's one generic "queue a transactional email" abstraction
  // (registration + the whole guardian-consent lifecycle), so this
  // reuses it rather than standing up a second one for one moderation
  // email — the same reasoning age-reclassification-sweep.service.ts
  // already applied when it needed to send a guardian a plain
  // notification email outside the registration flow proper.
  //
  // Deliberately makes no promise about outcome or timeline beyond "a
  // moderator will review this" — the report itself may take any amount
  // of time to review, may be dismissed, or may be escalated (see
  // Report's own severity/escalation fields), and none of that is known
  // at submission time.
  async sendPublicReportAcknowledgementEmail(to: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'We received your report',
      template: 'public-report-acknowledgement',
      data: {},
    });
  }

  // ---------------------------------------------------------------
  // feat/moderation-outcome-appeal-emails
  // ---------------------------------------------------------------

  // To the REPORTER (a logged-in user or a public, non-authenticated
  // contact) once an admin/moderator has actioned their report. Only the
  // outcome and a short, generic reason are shared. Deliberately names
  // nothing about the reported party: the reporter is told what was done,
  // not who it was done to or what the evidence was, so this email can't
  // be used to learn about another account's moderation history.
  //
  // `action` is ModerationService's own ReportAction value. Mapped here
  // rather than in ModerationService so this email service owns all of
  // its own copy, and an unknown value fails loudly before any send.
  async sendReportActionedEmail(to: string, action: string): Promise<void> {
    const copy = reportOutcomeCopy(action);
    await this.dispatch({
      to,
      subject: 'An update on your Soccernity report',
      template: 'report-actioned',
      data: { outcomeLabel: copy.label, outcomeReason: copy.reason },
    });
  }

  // To the APPELLANT (the reported party who appealed) once a second
  // reviewer has decided the appeal. `decision` is ModerationService's own
  // AppealDecision value ('upheld' | 'overturned').
  //
  // The copy for 'overturned' is worded to what the system actually does,
  // not what a reader might assume: the report is reopened for a fresh
  // decision. It does NOT claim any enforced reversal, because
  // Report.actionTaken is a recorded decision, not an enforced one (see
  // moderation/README.md's disclosed-limitation section).
  async sendAppealDecisionEmail(to: string, decision: string): Promise<void> {
    if (decision !== 'upheld' && decision !== 'overturned') {
      throw new Error(`Unknown appeal decision for email: ${decision}`);
    }
    await this.dispatch({
      to,
      subject: 'Your appeal has been reviewed',
      template: 'appeal-decision',
      data: { decision },
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
    case 'guardian-consent-withdrawal-request':
      return (
        `You asked to withdraw your consent for ${data.minorDisplayName}'s Soccernity account.

` +
        `Your withdrawal code is: ${data.withdrawalToken}

` +
        `Confirming will close the account and schedule it for deletion.

` +
        `If you did not request this, you can safely ignore this email — nothing changes unless the code above is used.`
      );
    case 'guardian-consent-declined':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your guardian did not approve your Soccernity account, so it cannot be activated.

` +
        `Your account has been closed and is scheduled to be permanently deleted in ${data.graceDays} days.

` +
        `If you think this was a mistake, speak to your guardian before then.`
      );
    case 'guardian-consent-withdrawn':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your guardian has withdrawn their consent for your Soccernity account, so it has been closed.

` +
        `It is scheduled to be permanently deleted in ${data.graceDays} days.

` +
        `If you think this was a mistake, speak to your guardian before then.`
      );
    case 'guardian-consent-reminder':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your Soccernity account is still waiting for your guardian to approve it, and the first request has now expired.

` +
        `We have sent a new request to ${data.guardianEmail}. Please ask them to check their email, including their spam folder.

` +
        `If this second request is not answered either, your account will be closed and scheduled for deletion.`
      );
    case 'guardian-consent-expired':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your guardian did not respond to either approval request, so your Soccernity account cannot be activated.

` +
        `Your account has been closed and is scheduled to be permanently deleted in ${data.graceDays} days.

` +
        `If you still want an account, ask your guardian to look out for the email and sign up again.`
      );
    case 'guardian-minor-turned-18':
      return (
        `Hi ${data.guardianFirstName},

` +
        `We're writing to let you know that ${data.minorDisplayName}'s Soccernity account has automatically moved from a minor's account to an adult account, now that they've turned 18.

` +
        `This means the guardian consent and oversight settings you originally set up no longer apply — ${data.minorDisplayName} now manages their own account the same way any adult user does. You don't need to do anything, and this isn't a request for action.

` +
        `If you have any questions about this change, or about the account generally, you can reach us at support@soccernity.com.

` +
        `Thanks for being part of ${data.minorDisplayName}'s Soccernity journey so far.

` +
        `— The Soccernity team`
      );
    case 'guardian-email-replaced':
      return (
        `You were asked to approve a Soccernity account for ${data.minorDisplayName}.\n\n` +
        `The guardian email on that account has since been changed, so the approval link we sent you no longer works and nothing further is needed from you.\n\n` +
        `If you are ${data.minorDisplayName}'s guardian and did not expect this, please contact support@soccernity.com.`
      );
    case 'public-report-acknowledgement':
      return (
        `Thank you for letting us know.\n\n` +
        `We've received your report and a moderator will review it. We won't be able to share the outcome or a timeline, but we take every report seriously.\n\n` +
        `If you have more information to add, you can reply to this email.`
      );
    case 'report-actioned':
      return (
        `Thank you for letting us know.

` +
        `We have reviewed your report.

` +
        `Outcome: ${data.outcomeLabel}

` +
        `${data.outcomeReason}

` +
        `For privacy reasons we can't share further details about any action taken on another account.`
      );
    case 'appeal-decision':
      return data.decision === 'overturned'
        ? `Hi,

` +
            `We have reviewed your appeal and overturned the original decision on this report.

` +
            `The report has been returned to our review queue so that it can be decided again.

` +
            `If you have more information to add, you can reply to this email.`
        : `Hi,

` +
            `We have reviewed your appeal. The original decision on this report has been upheld, so no change has been made.

` +
            `If you have more information to add, you can reply to this email.`;
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
    case 'guardian-consent-withdrawal-request':
      return (
        `<p>You asked to withdraw your consent for <strong>${data.minorDisplayName}</strong>'s Soccernity account.</p>` +
        `<p>Your withdrawal code is: <strong>${data.withdrawalToken}</strong></p>` +
        `<p>Confirming will close the account and schedule it for deletion.</p>` +
        `<p>If you did not request this, you can safely ignore this email — nothing changes unless the code above is used.</p>`
      );
    case 'guardian-consent-declined':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your guardian did not approve your Soccernity account, so it cannot be activated.</p>` +
        `<p>Your account has been closed and is scheduled to be permanently deleted in <strong>${data.graceDays} days</strong>.</p>` +
        `<p>If you think this was a mistake, speak to your guardian before then.</p>`
      );
    case 'guardian-consent-withdrawn':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your guardian has withdrawn their consent for your Soccernity account, so it has been closed.</p>` +
        `<p>It is scheduled to be permanently deleted in <strong>${data.graceDays} days</strong>.</p>` +
        `<p>If you think this was a mistake, speak to your guardian before then.</p>`
      );
    case 'guardian-consent-reminder':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your Soccernity account is still waiting for your guardian to approve it, and the first request has now expired.</p>` +
        `<p>We have sent a new request to <strong>${data.guardianEmail}</strong>. Please ask them to check their email, including their spam folder.</p>` +
        `<p>If this second request is not answered either, your account will be closed and scheduled for deletion.</p>`
      );
    case 'guardian-consent-expired':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your guardian did not respond to either approval request, so your Soccernity account cannot be activated.</p>` +
        `<p>Your account has been closed and is scheduled to be permanently deleted in <strong>${data.graceDays} days</strong>.</p>` +
        `<p>If you still want an account, ask your guardian to look out for the email and sign up again.</p>`
      );
    case 'guardian-minor-turned-18':
      return (
        `<p>Hi ${data.guardianFirstName},</p>` +
        `<p>We're writing to let you know that ${data.minorDisplayName}'s Soccernity account has automatically moved from a minor's account to an adult account, now that they've turned 18.</p>` +
        `<p>This means the guardian consent and oversight settings you originally set up no longer apply — ${data.minorDisplayName} now manages their own account the same way any adult user does. You don't need to do anything, and this isn't a request for action.</p>` +
        `<p>If you have any questions about this change, or about the account generally, you can reach us at support@soccernity.com.</p>` +
        `<p>Thanks for being part of ${data.minorDisplayName}'s Soccernity journey so far.</p>` +
        `<p>— The Soccernity team</p>`
      );
    case 'guardian-email-replaced':
      return (
        `<p>You were asked to approve a Soccernity account for ${data.minorDisplayName}.</p>` +
        `<p>The guardian email on that account has since been changed, so the approval link we sent you no longer works and nothing further is needed from you.</p>` +
        `<p>If you are ${data.minorDisplayName}'s guardian and did not expect this, please contact support@soccernity.com.</p>`
      );
    case 'public-report-acknowledgement':
      return (
        `<p>Thank you for letting us know.</p>` +
        `<p>We've received your report and a moderator will review it. We won't be able to share the outcome or a timeline, but we take every report seriously.</p>` +
        `<p>If you have more information to add, you can reply to this email.</p>`
      );
    case 'report-actioned':
      return (
        `<p>Thank you for letting us know.</p>` +
        `<p>We have reviewed your report.</p>` +
        `<p><strong>Outcome:</strong> ${data.outcomeLabel}</p>` +
        `<p>${data.outcomeReason}</p>` +
        `<p>For privacy reasons we can't share further details about any action taken on another account.</p>`
      );
    case 'appeal-decision':
      return data.decision === 'overturned'
        ? `<p>Hi,</p>` +
            `<p>We have reviewed your appeal and overturned the original decision on this report.</p>` +
            `<p>The report has been returned to our review queue so that it can be decided again.</p>` +
            `<p>If you have more information to add, you can reply to this email.</p>`
        : `<p>Hi,</p>` +
            `<p>We have reviewed your appeal. The original decision on this report has been upheld, so no change has been made.</p>` +
            `<p>If you have more information to add, you can reply to this email.</p>`;
    default:
      throw new Error(`Unknown registration email template: ${template as string}`);
  }
}

// feat/moderation-outcome-appeal-emails — plain, functional copy for the
// reporter-facing outcome email, keyed by ModerationService's ReportAction
// values. Unknown actions throw here, before anything is queued. Copy is
// functional placeholder wording pending safeguarding review, like the
// rest of this file's bodies.
function reportOutcomeCopy(action: string): { label: string; reason: string } {
  switch (action) {
    case 'content_removed':
      return {
        label: 'Content removed',
        reason: "The content you reported was found to break Soccernity's community guidelines and has been removed.",
      };
    case 'warning_issued':
      return {
        label: 'Warning issued',
        reason: "The account involved was given a warning for breaking Soccernity's community guidelines.",
      };
    case 'user_suspended':
      return {
        label: 'Account suspended',
        reason: "The account involved was suspended for breaking Soccernity's community guidelines.",
      };
    case 'dismissed':
      return {
        label: 'No action taken',
        reason: "We reviewed your report and found it did not breach Soccernity's community guidelines, so no action was taken.",
      };
    default:
      throw new Error(`Unknown report action for outcome email: ${action}`);
  }
}
