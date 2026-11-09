import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerClient } from 'postmark';
import {
  RECOVERY_CANCEL_PATH,
  RECOVERY_CONFIRM_PATH,
  RECOVERY_GUARDIAN_PATH,
} from '../../../two-factor/recovery/two-factor-recovery.constants';
import { DEFAULT_EMAIL_VERIFICATION_TTL_MS } from '../email-verification/email-verification-token.store';
import { buildWebAppLink } from './web-app-link.util';

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
  | 'guardian-approved-minor'
  | 'guardian-consent-declined'
  | 'guardian-consent-withdrawn'
  | 'guardian-consent-reminder'
  | 'guardian-consent-decline-lapse-reminder'
  | 'guardian-consent-expired'
  | 'guardian-minor-turned-18'
  | 'guardian-email-replaced'
  | 'guardian-security-notice'
  | 'guardian-safety-notice'
  | 'two-factor-recovery-link'
  | 'two-factor-recovery-guardian-link'
  | 'two-factor-recovery-minor-notice'
  | 'two-factor-recovery-waiting'
  | 'two-factor-recovery-completed'
  | 'two-factor-recovery-approved'
  | 'two-factor-recovery-declined'
  | 'public-report-acknowledgement'
  | 'report-actioned'
  | 'appeal-decision'
  | 'username-revoked'
  | 'login-lockout-notice'
  | 'social-email-code'
  | 'contact-enquiry-notification'
  | 'email-change-verify'
  | 'email-change-notice'
  | 'email-change-unavailable'
  | 'password-changed'
  | 'password-reset-completed'
  | 'welcome'
  | 'staff-account-created'
  | 'account-deletion-requested';

export interface OutboundRegistrationEmail {
  to: string;
  subject: string;
  template: RegistrationEmailTemplate;
  data: Record<string, string>;
}

// backend/b276-two-factor-recovery (B-276). The two-factor RECOVERY emails carry single-use links that remove a
// security control, and they go to a named person's mailbox. For these templates nothing identifying is written to
// the log (no recipient, no data, so no token and no link), live or not. The older templates keep their existing
// logging, which is deliberate for dev (see dispatch()).
const RECOVERY_TEMPLATES: ReadonlySet<RegistrationEmailTemplate> = new Set<RegistrationEmailTemplate>([
  'two-factor-recovery-link',
  'two-factor-recovery-guardian-link',
  'two-factor-recovery-minor-notice',
  'two-factor-recovery-waiting',
  'two-factor-recovery-completed',
  'two-factor-recovery-approved',
  'two-factor-recovery-declined',
  // B-084: carries a one-time code that proves ownership of an email address; the code must not reach a log.
  'social-email-code',
  // backend/email-change: the verify email carries a single-use link that changes the account's address; the link
  // must not reach a log. The notice (to the OLD address) is quiet too: it names an account holder's mailbox.
  'email-change-verify',
  'email-change-notice',
  // Decision Log #476: goes to an address that belongs to SOMEONE ELSE, so it is quiet too.
  'email-change-unavailable',
]);

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

  // B-016: carries a LINK to apps/web's /verify-email page (which reads
  // ?token=), not a bare code -- no screen accepts a typed code.
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = this.linkFor('verify-email', '/verify-email', token);
    if (!link) return;
    await this.dispatch({
      to,
      subject: 'Verify your Soccernity email',
      template: 'verify-email',
      data: { link },
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
    // B-016: the link opens apps/web's unauthenticated /guardian-consent/confirm
    // page (reads ?token=). No account, no app install, as step 3 requires.
    const link = this.linkFor('guardian-consent', '/guardian-consent/confirm', consentToken);
    if (!link) return;
    // B-112 / B-225 (Decision Log #414 item 1): a second link to the guardian
    // withdrawal REQUEST page, WITHOUT a token. The guardian keeps this email
    // after approving, and it is where they would look to take consent back
    // later. No token: a withdrawal token is only issued on request
    // (POST /auth/guardian-consent/withdraw/request, Decision Log #340), so the
    // page asks for the minor's email first. buildWebAppLink cannot return null
    // here because linkFor() above already accepted the same base URL.
    // [COPY PENDING LEGAL REVIEW]: the sentence that introduces this link, in
    // both bodies below, is guardian-facing wording counsel has not approved.
    const withdrawalPageLink = buildWebAppLink(
      this.config.get<string>('WEB_APP_BASE_URL'),
      '/guardian-consent/withdraw',
      {},
    );
    if (!withdrawalPageLink) return;
    await this.dispatch({
      to,
      subject: `Consent requested for ${minorDisplayName}'s Soccernity account`,
      template: 'guardian-consent',
      data: { link, minorDisplayName, withdrawalPageLink },
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
    // B-016 / B-112. The link carries the single-use token as ?token= so the
    // page opens its Confirm step with the code pre-filled (Decision Log #414
    // item 1; the same route without a token is the request step). The code
    // stays in the body too: the designed confirm screen (Figma 6654:57) has a
    // "withdrawal code" input, so a guardian can paste it if the link fails.
    // The web page itself is FC6 (B-080); this path is the contract it adopts.
    const link = this.linkFor('guardian-consent-withdrawal-request', '/guardian-consent/withdraw', withdrawalToken);
    if (!link) return;
    await this.dispatch({
      to,
      subject: `Confirm withdrawing consent for ${minorDisplayName}'s Soccernity account`,
      template: 'guardian-consent-withdrawal-request',
      data: { link, withdrawalToken, minorDisplayName },
    });
  }

  // B-028 (Decision Log #373, #394 A5): To the MINOR, when their guardian
  // approves. Closes the audit's finding that confirmConsent sent nothing.
  // The wording is "approved, continue registration" -- NOT "everything is
  // switched on": approval is only the middle of the sign-up flow (#367), and
  // the account still has to complete its profile. Plain functional copy,
  // [COPY PENDING LEGAL REVIEW], not counsel-reviewed.
  //
  // The link goes to /login, deliberately and not to a Create Profile route:
  // the minor is usually logged out when this arrives, and the login response
  // tells the web app where to send them (`nextStep`, B-030), so /login is
  // correct before and after the Create Profile screen exists. It carries no
  // token, so unlike the other link emails there is nothing to protect in the
  // URL. As everywhere in this file, an unusable WEB_APP_BASE_URL means NO
  // email (a dead link is worse than none) -- see linkFor().
  async sendGuardianApprovedMinorEmail(to: string, minorDisplayName: string): Promise<void> {
    const link = buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), '/login', {});
    if (!link) {
      this.logger.error(
        `[email] WEB_APP_BASE_URL is missing, a placeholder, or not https -- NOT sending ` +
          `"guardian-approved-minor" because it would contain no usable link. ` +
          `Set WEB_APP_BASE_URL (docs/deployment.md).`,
      );
      return;
    }
    await this.dispatch({
      to,
      subject: 'Your guardian approved your Soccernity account',
      template: 'guardian-approved-minor',
      data: { minorDisplayName, link },
    });
  }

  // To the MINOR — the FINAL explicit decline. Since B-102 (Decision Log #389,
  // #395 B2) this is sent only for the THIRD decline of a consent request;
  // declines 1 and 2 send nothing (the minor sees the decline page inside the
  // account). The wording says the account is closed after the limit was
  // reached, without exposing a running count. [COPY PENDING LEGAL REVIEW]:
  // functional wording only, not counsel-reviewed.
  async sendConsentDeclinedEmail(to: string, minorDisplayName: string, graceDays: number): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity account has been closed',
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

  // B-126 (Decision Log #406 item 1). To the MINOR -- the platform's own chase of
  // a row that was declined at decline 1 or 2 and never reopened for
  // GUARDIAN_DECLINE_LAPSE_DAYS (default 14). It is NOT the 'guardian-consent-
  // reminder' above: that one says "the first request has now expired", which is
  // untrue here (the guardian answered; the minor did nothing). A new request
  // has gone to the guardian, and a second lapse of THAT request closes the
  // account, so this is the warning the unanswered-request path always gives
  // before closure. No decline count is mentioned (#395 B2).
  //
  // backend/b158-clear-guardian-email-tags (B-158, founder decision 2026-11-04): the founder has read this
  // wording and the accuracy check was done (the days come from GRACE_PERIOD_DAYS, the same constant the
  // deletion sweep uses; the lapse path is refuseConsentAndScheduleDeletion; the change-guardian-email screen
  // it points to exists). It is deliberately NOT tagged [COPY PENDING LEGAL REVIEW] and is not on the counsel
  // list.
  async sendConsentDeclineLapseReminderEmail(
    to: string,
    minorDisplayName: string,
    guardianEmail: string,
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity account still needs guardian approval',
      template: 'guardian-consent-decline-lapse-reminder',
      data: { minorDisplayName, guardianEmail },
    });
  }

  // To the MINOR — second expiry. The re-sent request also lapsed
  // unanswered, so it is treated as an implicit decline.
  // Wording fix (backend/w3e, Decision Log #407 follow-up): this email is also reached by a
  // request that was DECLINED once or twice, reopened by the stale-decline sweep
  // (B-126) and then not answered. The old text said "Your guardian did not
  // respond to either approval request", which is untrue for a guardian who did
  // respond (by declining). The wording now says only what is true on every
  // route here: the account was not approved in time. It names no history, no
  // decline count (#395 B2) and no guardian action.
  //
  // backend/b158-clear-guardian-email-tags (B-158, founder decision 2026-11-04): the founder has read this
  // wording and the accuracy check was done (graceDays comes from GRACE_PERIOD_DAYS, the same constant the
  // deletion sweep uses; "closed and scheduled for deletion" matches the second-lapse path through
  // refuseConsentAndScheduleDeletion). It is deliberately NOT tagged [COPY PENDING LEGAL REVIEW] and is not on
  // the counsel list.
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

  // backend/b275-guardian-security-notices (B-275; Decision Log #456). To the CONFIRMED guardian of a minor, when a
  // security-related action happened on the minor's account (two-factor on/off, backup codes regenerated, password
  // changed or reset, sign-in locked). ONE template for every event: the caller (GuardianSecurityNoticeService)
  // passes the subject, the one-sentence summary and the time, all taken from the registry in
  // guardian-security-notice.constants.ts, so a new event needs no change here. The email says what happened and
  // when and NOTHING else: no IP address, device, location or other account data, no link. [COPY PENDING LEGAL
  // REVIEW]: functional wording only, not counsel-reviewed (docs/pending-copy-manifest.md).
  async sendGuardianSecurityNoticeEmail(to: string, subject: string, summary: string, when: string): Promise<void> {
    await this.dispatch({
      to,
      subject,
      template: 'guardian-security-notice',
      data: { summary, when },
    });
  }

  // backend/b279-guardian-safety-notices (B-279; Decision Log #456 groups A and C). To the CONFIRMED guardian of a
  // minor when SOCCERNITY took a safety action on the minor's account or content. Same shape as the security
  // notice (subject, one-sentence summary, time, all from the registry in guardian-security-notice.constants.ts)
  // plus a pointer to the Contact Us page. The email says the KIND of action and when, and NOTHING else: never
  // the reason, the rule, a report, a reporter, a moderator or any content of a post. The Contact Us link is
  // built from WEB_APP_BASE_URL; when that is unusable the email is still sent, without the link, because the
  // notice itself matters more than its pointer (unlike a token email, nothing here depends on the link).
  // [COPY PENDING LEGAL REVIEW]: functional wording only (docs/pending-copy-manifest.md).
  async sendGuardianSafetyNoticeEmail(to: string, subject: string, summary: string, when: string): Promise<void> {
    const contactLink = buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), '/contact', {}) ?? '';
    await this.dispatch({
      to,
      subject,
      template: 'guardian-safety-notice',
      data: { summary, when, contactLink },
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

  // B-033 (Decision Log #398 D3): to the user whose username an admin has just
  // revoked. [COPY PENDING LEGAL REVIEW] -- plain functional wording, not
  // counsel-reviewed. It deliberately carries NO free-text from the admin's
  // reason (that is an internal note and can name other people or reports); it
  // states only the categories the username rules cover, what changes for the
  // account until a new name is chosen, and that the old name cannot be used
  // again. No link and no token: the next login routes the user to pick a new
  // username (nextStep = create_profile), so there is nothing to protect in a URL.
  //
  // backend/b139-username-review (B-139 part (c), Decision Log #467, as amended 2026-11-03): the email also says
  // the person can ASK FOR A REVIEW of the removal, and how (the "Ask for a review" button on the screen where
  // they choose a new username, when they next log in) and until which day. The founder reviews that added
  // paragraph himself: it is deliberately NOT tagged [COPY PENDING LEGAL REVIEW] and is not on the counsel list.
  // Every earlier sentence is unchanged. `lastDayToAsk` is computed by the caller from the same helper and the
  // same revokedAt the review route uses (username-review-window.util.ts), so the two cannot disagree.
  async sendUsernameRevokedEmail(to: string, displayName: string, lastDayToAsk: Date): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity username was removed',
      template: 'username-revoked',
      data: { displayName, lastDayToAsk: formatLongDateUtc(lastDayToAsk) },
    });
  }

  // To the account's own address, the first time repeated wrong passwords spent the sign-in budget for it
  // (LoginLockoutNotifier). Plain security notice: it says only that someone entered the wrong password several
  // times, that nothing needs doing if it was the owner, and where to reset the password if it was not. It
  // carries nothing about the guesser (no IP, no times, no count) and makes no legal or safety promise, so it
  // is not tagged [COPY PENDING LEGAL REVIEW]. Returns false (sending nothing) when WEB_APP_BASE_URL is
  // unusable, because the reset link is the point of the email; a send failure inside dispatch() is logged and
  // swallowed like every other template here.
  async sendLoginLockoutNoticeEmail(to: string): Promise<boolean> {
    const link = buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), '/forgot-password', {});
    if (!link) {
      this.logger.error(
        `[email] WEB_APP_BASE_URL is missing, a placeholder, or not https -- NOT sending ` +
          `"login-lockout-notice" because it would contain no usable link. ` +
          `Set WEB_APP_BASE_URL (docs/deployment.md).`,
      );
      return false;
    }
    await this.dispatch({
      to,
      subject: 'Someone entered the wrong password on your Soccernity account',
      template: 'login-lockout-notice',
      data: { link },
    });
    return true;
  }

  // backend/email-change (B-059; Decision Log #472 default (f)). To the NEW address: a single-use link that
  // completes the change. Returns false (sending nothing) when WEB_APP_BASE_URL is unusable, because the link is the
  // whole point of the email; the caller then discards the request. The link path is a PROPOSAL for the web page
  // (/email-change/confirm?token=), which is not built yet. Plain functional wording, no promise about safety, data
  // or who is told, so it is not tagged [COPY PENDING LEGAL REVIEW].
  async sendEmailChangeVerifyEmail(to: string, token: string): Promise<boolean> {
    const link = this.linkFor('email-change-verify', '/email-change/confirm', token);
    if (!link) return false;
    await this.dispatch({
      to,
      subject: 'Confirm your new Soccernity email address',
      template: 'email-change-verify',
      data: { link, hours: String(Math.round(DEFAULT_EMAIL_VERIFICATION_TTL_MS / 3_600_000)) },
    });
    return true;
  }

  // backend/email-change (B-059). To the OLD (current) address, at request time (DEFAULT, founder-veto-able): a
  // request was made, and nothing changes until it is confirmed from the new address. Deliberately does NOT name the
  // new address. Plain functional wording.
  async sendEmailChangeNoticeEmail(to: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'A request to change the email on your Soccernity account',
      template: 'email-change-notice',
      data: {},
    });
  }

  // Decision Log #476. Whether WEB_APP_BASE_URL can build a link at all, so the email-change route can refuse with
  // a 503 on configuration alone, before any lookup that depends on the address. Logs nothing: the caller does.
  isWebAppBaseUrlUsable(): boolean {
    return buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), '/', {}) !== null;
  }

  // Decision Log #476. To an address somebody asked to use for an email change when that address already belongs to a
  // Soccernity account. NO link, nothing about the person who asked, nothing the owner has to do. Plain functional
  // wording with no promise about safety, data or who is told, so it is not tagged [COPY PENDING LEGAL REVIEW].
  async sendEmailChangeUnavailableEmail(to: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'A request to use your email address on Soccernity',
      template: 'email-change-unavailable',
      data: {},
    });
  }

  // backend/b069-transactional-emails (B-069; Decision Log #472, adopted default (a)). Five plain account emails
  // that had a Figma frame but no template. The founder reviews the wording himself (not counsel), so none of it
  // is tagged [COPY PENDING LEGAL REVIEW]; the PR body lists every sentence that states something about
  // retention, deletion, who is told or safety. Each is fire-and-log like every other send here: dispatch()
  // swallows a provider failure, and the callers never await these on the request path.
  //
  // To the account's own address after a password change made while SIGNED IN (Figma 1380:2318). It carries no
  // link: signed-in users know where they are, and there is nothing to click.
  async sendPasswordChangedEmail(to: string, firstName: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity password was changed',
      template: 'password-changed',
      data: { firstName },
    });
  }

  // To the account's own address after a password change made through the EMAILED RESET LINK (Figma 1380:2297,
  // "Unusual password change"; adopted default (a)). The frame says Soccernity "noticed" an unusual change;
  // nothing detects that, so the wording says only what happened. The button opens the forgot-password page
  // (WEB_APP_BASE_URL), for the person who did not do this. Returns false (sending nothing) when that base URL is
  // unusable, because the button is the point of the email.
  async sendPasswordResetCompletedEmail(to: string, firstName: string): Promise<boolean> {
    const link = buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), '/forgot-password', {});
    if (!link) {
      this.logger.error(
        `[email] WEB_APP_BASE_URL is missing, a placeholder, or not https -- NOT sending ` +
          `"password-reset-completed" because it would contain no usable link. Set WEB_APP_BASE_URL (docs/deployment.md).`,
      );
      return false;
    }
    await this.dispatch({
      to,
      subject: 'Your Soccernity password was reset',
      template: 'password-reset-completed',
      data: { firstName, link },
    });
    return true;
  }

  // To the person when their account first becomes fully active (Figma 1380:2274): an adult once the email is
  // verified, a minor once the email is verified AND the guardian has approved. The frame's "Unsubscribe at any
  // time" line is deliberately NOT here: no unsubscribe exists for these emails. Returns false (sending
  // nothing) when WEB_APP_BASE_URL is unusable, because the sign-in button is the point.
  async sendWelcomeEmail(to: string, firstName: string): Promise<boolean> {
    const link = buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), '/login', {});
    if (!link) {
      this.logger.error(
        `[email] WEB_APP_BASE_URL is missing, a placeholder, or not https -- NOT sending "welcome" ` +
          `because it would contain no usable link. Set WEB_APP_BASE_URL (docs/deployment.md).`,
      );
      return false;
    }
    await this.dispatch({
      to,
      subject: 'Welcome to Soccernity',
      template: 'welcome',
      data: { firstName, link },
    });
    return true;
  }

  // To a new admin account when POST /admin/staff creates it (Figma 1661:2741 moderator, 1661:2724 admin; one
  // template for the shipped roles editor, moderator, super admin). It carries NO password: emailing one would be
  // a new security decision (adopted default, founder-veto-able). `roleLabel` and `roleSentence` come from the
  // caller (admin-staff-roles.constants.ts) so the wording of what a role can do lives next to the roles.
  // `twoFactorRequired` is true when ADMIN_2FA_ENFORCED is on, so the email never promises a set-up step the
  // sign-in does not ask for. `link` is the admin sign-in page (ADMIN_APP_BASE_URL); null when that is unusable,
  // in which case the email is still sent, without the link (the account exists either way).
  async sendStaffAccountCreatedEmail(
    to: string,
    firstName: string,
    roleLabel: string,
    roleSentence: string,
    link: string | null,
    twoFactorRequired: boolean,
  ): Promise<void> {
    await this.dispatch({
      to,
      subject: `Your Soccernity ${roleLabel} account`,
      template: 'staff-account-created',
      data: {
        firstName,
        roleLabel,
        roleSentence,
        email: to,
        link: link ?? '',
        twoFactorRequired: twoFactorRequired ? 'yes' : '',
      },
    });
  }

  // To the person who asked to delete their account (Figma 5439:7074), self-service paths only (signed in, or
  // from the Inactive Account screen). It says only what the code does (auth.service.ts startPendingDeletion and
  // account-deletion/README.md): the account is closed at once and cannot be signed in to; after the grace period
  // it is anonymised IN PLACE, posts/comments/messages stay as "[deleted user]". The frame's "sign back in to
  // cancel" and "all posts permanently removed" are false for the shipped behaviour and are not repeated.
  async sendAccountDeletionRequestedEmail(to: string, firstName: string, graceDays: number): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your Soccernity account deletion request',
      template: 'account-deletion-requested',
      data: { firstName, graceDays: String(graceDays) },
    });
  }

  // B-084 (Decision Log #378, #468). The one-time code a person receives when a social sign-in gave no email (Facebook
  // can return none): they enter an address and prove they own it BEFORE any account exists. Plain functional copy; it
  // makes no promise and asks for nothing but the code. The code is never logged (see RECOVERY_TEMPLATES).
  async sendSocialEmailCodeEmail(to: string, code: string): Promise<void> {
    await this.dispatch({
      to,
      subject: `Your Soccernity verification code: ${code}`,
      template: 'social-email-code',
      data: { code },
    });
  }

  // backend/w7-contact-us-enquiry (B-046). To the SUPPORT mailbox (not the sender), once per new Contact Us
  // enquiry. It says only that an enquiry arrived, its category, and where to read it: NEVER the sender's
  // name, email, subject or message (the message is read in the admin inbox, behind admin sign-in), so the
  // text never travels through the email provider or sits in a shared mailbox. `link` is null when
  // ADMIN_APP_BASE_URL is unusable; the email is still sent, because "there is a new enquiry" is the point.
  // No acknowledgement goes to the enquirer. Not tagged [COPY PENDING LEGAL REVIEW]: internal, staff-facing,
  // makes no promise to a user.
  async sendContactEnquiryNotificationEmail(to: string, categoryLabel: string, link: string | null): Promise<void> {
    await this.dispatch({
      to,
      subject: `New Contact Us enquiry: ${categoryLabel}`,
      template: 'contact-enquiry-notification',
      data: { categoryLabel, link: link ?? '' },
    });
  }

  // ---------------------------------------------------------------
  // backend/b276-two-factor-recovery (B-276; Decision Log #455, #456). A user who lost BOTH their authenticator
  // device and their backup codes. All seven are plain functional copy, [COPY PENDING LEGAL REVIEW] by the standing
  // convention (docs/pending-copy-manifest.md); the tag does not hold the build. None logs a recipient or a token
  // (RECOVERY_TEMPLATES). Each link email is skipped, and an error logged, if WEB_APP_BASE_URL is unusable.
  // ---------------------------------------------------------------

  // To an ADULT account's own address: the link that lets them confirm the request. Opening it changes nothing.
  async sendTwoFactorRecoveryLinkEmail(to: string, token: string): Promise<void> {
    const link = this.linkFor('two-factor-recovery-link', RECOVERY_CONFIRM_PATH, token);
    if (!link) return;
    await this.dispatch({
      to,
      subject: 'Remove two-factor from your Soccernity account?',
      template: 'two-factor-recovery-link',
      data: { link },
    });
  }

  // To the GUARDIAN of a minor (confirmed consent). 72 hours. Names the minor the way the other guardian emails do.
  async sendTwoFactorRecoveryGuardianLinkEmail(to: string, token: string, minorDisplayName: string): Promise<void> {
    const link = this.linkFor('two-factor-recovery-guardian-link', RECOVERY_GUARDIAN_PATH, token);
    if (!link) return;
    await this.dispatch({
      to,
      subject: `${minorDisplayName} asked to remove two-factor from their Soccernity account`,
      template: 'two-factor-recovery-guardian-link',
      data: { link, minorDisplayName },
    });
  }

  // To the MINOR's own address, when the request went to their guardian instead.
  async sendTwoFactorRecoveryMinorNoticeEmail(to: string, minorDisplayName: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'We asked your guardian about removing two-factor',
      template: 'two-factor-recovery-minor-notice',
      data: { minorDisplayName },
    });
  }

  // To an adult account's address when they confirm: the wait has started, with the separate cancel link.
  async sendTwoFactorRecoveryWaitingEmail(to: string, cancelToken: string, executeAtText: string): Promise<void> {
    const link = this.linkFor('two-factor-recovery-waiting', RECOVERY_CANCEL_PATH, cancelToken);
    if (!link) return;
    await this.dispatch({
      to,
      subject: 'Two-factor will be removed from your Soccernity account',
      template: 'two-factor-recovery-waiting',
      data: { link, executeAtText },
    });
  }

  // To an adult account's address when the wait ends and two-factor has been removed.
  async sendTwoFactorRecoveryCompletedEmail(to: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Two-factor was removed from your Soccernity account',
      template: 'two-factor-recovery-completed',
      data: {},
    });
  }

  // To the MINOR's own address when their guardian approves.
  async sendTwoFactorRecoveryApprovedEmail(to: string, minorDisplayName: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Two-factor was removed from your Soccernity account',
      template: 'two-factor-recovery-approved',
      data: { minorDisplayName },
    });
  }

  // To the MINOR's own address when their guardian says they did not expect the request.
  async sendTwoFactorRecoveryDeclinedEmail(to: string, minorDisplayName: string): Promise<void> {
    await this.dispatch({
      to,
      subject: 'Your guardian did not expect the two-factor request',
      template: 'two-factor-recovery-declined',
      data: { minorDisplayName },
    });
  }

  // B-016. Builds the apps/web link for a token email, or refuses. When
  // WEB_APP_BASE_URL is unset/placeholder the email's only call to action would
  // be a dead link, so NOTHING is sent and an error is logged (without the
  // token or the address). Callers are fire-and-forget, so the request that
  // triggered the email still succeeds; the minor can use "resend" once the
  // value is fixed. Fails safe: no email is better than a misleading one.
  private linkFor(template: RegistrationEmailTemplate, path: string, token: string): string | null {
    const link = buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), path, { token });
    if (!link) {
      this.logger.error(
        `[email] WEB_APP_BASE_URL is missing, a placeholder, or not https -- NOT sending "${template}" ` +
          `because it would contain no usable link. Set WEB_APP_BASE_URL (docs/deployment.md).`,
      );
    }
    return link;
  }

  private async dispatch(email: OutboundRegistrationEmail): Promise<void> {
    const quiet = RECOVERY_TEMPLATES.has(email.template);
    if (!this.isConfigured) {
      this.logger.log(
        quiet
          ? `[email] EMAIL_PROVIDER_API_KEY not set — wired but inactive. Would send "${email.template}" (recipient and content are not logged for this template).`
          : `[email] EMAIL_PROVIDER_API_KEY not set — wired but inactive. ` +
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
        quiet
          ? `[email] sent "${email.template}" (MessageID=${result.MessageID})`
          : `[email] sent "${email.template}" to ${email.to} (MessageID=${result.MessageID})`,
      );
    } catch (err) {
      this.logger.error(
        quiet
          ? `[email] failed to send "${email.template}": ${(err as Error).message}`
          : `[email] failed to send "${email.template}" to ${email.to}: ${(err as Error).message}`,
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
    case 'password-changed':
      return (
        `Hi ${data.firstName},\n\n` +
        `This confirms that the password for your Soccernity account was changed. For your security, all your signed-in sessions have been ended, so you will need to sign in again.\n\n` +
        `If you did not make this change, contact us right away at support@soccernity.com so we can help secure your account.\n\n` +
        `Thanks,\nThe Soccernity Team`
      );
    case 'password-reset-completed':
      return (
        `Hi ${data.firstName},\n\n` +
        `The password for your Soccernity account was just changed using a password reset link sent to this email address. For your security, all your signed-in sessions have been ended, so you will need to sign in again.\n\n` +
        `If this was you, there is nothing more to do.\n\n` +
        `If it was not you, someone may have had access to your email. Reset your password again now: ${data.link}\n\n` +
        `Then contact us at support@soccernity.com so we can help secure your account.\n\n` +
        `Thanks,\nThe Soccernity Team`
      );
    case 'welcome':
      return (
        `Hi ${data.firstName},\n\n` +
        `Your email is verified and your account is ready. Welcome aboard.\n\n` +
        `Soccernity is where grassroots football lives: follow the clubs and communities you care about, and keep up with the game as it happens.\n\n` +
        `Sign in to Soccernity: ${data.link}\n\n` +
        `See you on the pitch,\nThe Soccernity Team\n\n` +
        `You are receiving this email because you have a Soccernity account.`
      );
    case 'staff-account-created':
      return (
        `Hi ${data.firstName},\n\n` +
        `A ${data.roleLabel} account has been created for you on Soccernity.\n\n` +
        `${data.roleSentence}\n\n` +
        `Your sign-in email: ${data.email}\n` +
        (data.link ? `Sign in here: ${data.link}\n` : '') +
        `\nThis email does not contain a password. The person who created your account will give you your password separately. Sign in and change it straight away.\n\n` +
        (data.twoFactorRequired
          ? `Admin accounts need two-factor authentication with an authenticator app. You will be asked to set it up the first time you sign in.\n\n`
          : '') +
        `Welcome to the team,\nThe Soccernity Team`
      );
    case 'account-deletion-requested':
      return (
        `Hi ${data.firstName},\n\n` +
        `We have received your request to delete your Soccernity account. Your account is now closed: you have been signed out everywhere and can no longer sign in.\n\n` +
        `After ${data.graceDays} days your account is anonymised. Your name, email address, phone number and profile details are removed or replaced, and the account can no longer be used. Posts, comments and messages you wrote are not deleted; they stay and are shown as "[deleted user]". Your likes, follows, saved posts, notifications and memberships of rooms, groups and clubs are removed.\n\n` +
        `In some cases we keep an account's data for longer, for example while a report involving it is still being looked at.\n\n` +
        `If you did not ask for this, contact us at support@soccernity.com as soon as you can.\n\n` +
        `The Soccernity Team`
      );
    case 'contact-enquiry-notification':
      return (
        `A new enquiry arrived through the Soccernity Contact Us form.

` +
        `Category: ${data.categoryLabel}

` +
        (data.link ? `Read it in the admin inbox: ${data.link}` : `Read it in the admin inbox.`)
      );
    case 'social-email-code':
      return (
        `Hi,

` +
        `Your Soccernity verification code is ${data.code}.

` +
        `It expires in 10 minutes. If you did not ask for it, you can ignore this email.`
      );
    case 'login-lockout-notice':
      return (
        `Hi,

` +
        `Someone entered the wrong password for your Soccernity account several times, so we have temporarily paused further sign-in attempts.

` +
        `If this was you, there is nothing to do.

` +
        `If it was not you, reset your password: ${data.link}`
      );
    case 'username-revoked':
      return (
        `Hi ${data.displayName},

` +
        `A Soccernity moderator has removed your username because it did not follow our username rules. ` +
        `Usernames must not be offensive, must not pretend to be another person or organisation, and must not include personal details such as a real name, phone number or email address.

` +
        `What this means for your account:
` +
        `- Until you choose a new username, other people see you as "Soccernity member" and you can't post, comment or send messages.
` +
        `- The next time you log in you will be asked to choose a new username.
` +
        `- You can't use the removed username again, and nobody else can take it for 30 days.

` +
        `You can ask for a review of this decision. The next time you log in, the screen where you choose a new username has an "Ask for a review" button. You can ask until ${data.lastDayToAsk}.

` +
        `If you think this was a mistake, contact support@soccernity.com.`
      );
    case 'email-change-verify':
      return (
        `Someone asked to use this address for a Soccernity account. To confirm the change, open this link:

${data.link}

` +
        `The link works once and expires in ${data.hours} hours. If you did not ask for this, ignore this email and nothing changes.`
      );
    case 'email-change-notice':
      return (
        `A request was made to change the email address on your Soccernity account.

` +
        `Nothing changes until the request is confirmed from the new address. If this was not you, contact support@soccernity.com and change your password.`
      );
    case 'email-change-unavailable':
      return (
        `Someone asked to use this email address to change the email on a Soccernity account.

` +
        `It cannot be used for that change because it already belongs to a Soccernity account. Nothing has changed on your account and you do not need to do anything.`
      );
    case 'verify-email':
      return `Verify your Soccernity email address by opening this link:\n\n${data.link}\n\nIf you did not request this, you can safely ignore this email.`;
    case 'guardian-consent':
      return (
        `${data.minorDisplayName} has registered for a Soccernity account and listed you as their guardian.\n\n` +
        `To review and respond to the request, open this link (no account needed):\n\n${data.link}\n\n` +
        `If you approve and later change your mind, you can withdraw your consent at any time:\n\n${data.withdrawalPageLink}\n\n` +
        `If you did not expect this email, you can safely ignore it.`
      );
    case 'guardian-consent-withdrawal-request':
      return (
        `You asked to withdraw your consent for ${data.minorDisplayName}'s Soccernity account.

` +
        `To confirm, open this link:

${data.link}

` +
        `Or enter this withdrawal code on the page: ${data.withdrawalToken}

` +
        `Confirming will close the account and schedule it for deletion.

` +
        `If you did not request this, you can safely ignore this email — nothing changes unless the code above is used.`
      );
    case 'guardian-approved-minor':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your guardian has approved your Soccernity account.

` +
        `There are still a few steps to finish setting up. Log in to continue registration:

${data.link}

` +
        `If you did not create a Soccernity account, you can ignore this email.`
      );
    case 'guardian-consent-declined':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your guardian declined the approval request for your Soccernity account again, and the limit on declined requests has now been reached, so your account cannot be activated.

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
    case 'guardian-consent-decline-lapse-reminder':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your Soccernity account is still not approved, and nothing has changed on it for a while.

` +
        `We have sent a new approval request to ${data.guardianEmail}. Please ask them to check their email, including their spam folder. You can also change your guardian's email address from your account.

` +
        `If this new request is not answered, your account will be closed and scheduled for deletion.`
      );
    case 'guardian-consent-expired':
      return (
        `Hi ${data.minorDisplayName},

` +
        `Your Soccernity account was not approved in time, so it cannot be activated.

` +
        `Your account has been closed and is scheduled to be permanently deleted in ${data.graceDays} days.

` +
        `If you still want an account, talk to your guardian and sign up again.`
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
    case 'guardian-security-notice':
      return (
        `${data.summary}\n\n` +
        `When: ${data.when}\n\n` +
        `You are receiving this because you are the guardian on this account. If this was not expected, please contact support@soccernity.com.`
      );
    case 'guardian-safety-notice':
      return (
        `${data.summary}\n\n` +
        `When: ${data.when}\n\n` +
        `You are receiving this because you are the guardian on this account. If you have questions, you can contact support through the Contact Us page on Soccernity` +
        (data.contactLink ? `: ${data.contactLink}` : '.')
      );
    case 'two-factor-recovery-link':
      return (
        `Hi,\n\n` +
        `Someone said they have lost both the device and the backup codes for two-factor on your Soccernity account, and asked us to remove it. If that was you, open this link to continue:\n\n${data.link}\n\n` +
        `Opening the link changes nothing yet. After you confirm, we wait 24 hours before removing two-factor, and we email you so you can stop it.\n\n` +
        `If this was not you, ignore this email and think about changing your password.`
      );
    case 'two-factor-recovery-guardian-link':
      return (
        `${data.minorDisplayName} has asked us to remove two-factor (a second sign-in step) from their Soccernity account, because they lost their device and their backup codes.\n\n` +
        `As their guardian you can approve this or say you did not expect it. No account is needed:\n\n${data.link}\n\n` +
        `The link works for 72 hours. Nothing changes unless you approve.\n\n` +
        `If you did not expect this, you can answer "I didn't expect this" on the page, or just ignore this email.`
      );
    case 'two-factor-recovery-minor-notice':
      return (
        `Hi ${data.minorDisplayName},\n\n` +
        `You asked to remove two-factor from your Soccernity account. Because you are under 18, we have sent the request to your guardian instead of your own inbox.\n\n` +
        `Nothing changes unless they approve it. Ask them to check their email, including their spam folder.\n\n` +
        `If you did not make this request, change your password.`
      );
    case 'two-factor-recovery-waiting':
      return (
        `Hi,\n\n` +
        `You confirmed a request to remove two-factor from your Soccernity account. It will be removed after ${data.executeAtText}.\n\n` +
        `If this was not you, stop it now:\n\n${data.link}\n\n` +
        `Signing in with your authenticator app or a backup code before then also stops it.`
      );
    case 'two-factor-recovery-completed':
      return (
        `Hi,\n\n` +
        `Two-factor has been removed from your Soccernity account, and you have been signed out everywhere. Sign in with your password. You can turn two-factor on again in your account settings.\n\n` +
        `If you did not ask for this, reset your password and contact support@soccernity.com.`
      );
    case 'two-factor-recovery-approved':
      return (
        `Hi ${data.minorDisplayName},\n\n` +
        `Your guardian approved your request. Two-factor has been removed from your Soccernity account, and you have been signed out everywhere. Sign in with your password. You can turn two-factor on again in your account settings.\n\n` +
        `If you did not ask for this, change your password and tell your guardian.`
      );
    case 'two-factor-recovery-declined':
      return (
        `Hi ${data.minorDisplayName},\n\n` +
        `Your guardian said they did not expect your request to remove two-factor, so nothing has changed on your Soccernity account.\n\n` +
        `If you did not make that request, change your password now.`
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
    case 'password-changed':
      return (
        `<p>Hi ${escapeHtml(data.firstName)},</p>` +
        `<p>This confirms that the password for your Soccernity account was changed. For your security, all your signed-in sessions have been ended, so you will need to sign in again.</p>` +
        `<p>If you did not make this change, contact us right away at support@soccernity.com so we can help secure your account.</p>` +
        `<p>Thanks,<br>The Soccernity Team</p>`
      );
    case 'password-reset-completed':
      return (
        `<p>Hi ${escapeHtml(data.firstName)},</p>` +
        `<p>The password for your Soccernity account was just changed using a password reset link sent to this email address. For your security, all your signed-in sessions have been ended, so you will need to sign in again.</p>` +
        `<p>If this was you, there is nothing more to do.</p>` +
        `<p>If it was not you, someone may have had access to your email. Reset your password again now:</p>` +
        `<p><a href="${escapeHtml(data.link)}">Reset your password</a></p>` +
        `<p>If the button does not work, copy this into your browser: ${escapeHtml(data.link)}</p>` +
        `<p>Then contact us at support@soccernity.com so we can help secure your account.</p>` +
        `<p>Thanks,<br>The Soccernity Team</p>`
      );
    case 'welcome':
      return (
        `<p>Hi ${escapeHtml(data.firstName)},</p>` +
        `<p>Your email is verified and your account is ready. Welcome aboard.</p>` +
        `<p>Soccernity is where grassroots football lives: follow the clubs and communities you care about, and keep up with the game as it happens.</p>` +
        `<p><a href="${escapeHtml(data.link)}">Sign in to Soccernity</a></p>` +
        `<p>See you on the pitch,<br>The Soccernity Team</p>` +
        `<p>You are receiving this email because you have a Soccernity account.</p>`
      );
    case 'staff-account-created':
      return (
        `<p>Hi ${escapeHtml(data.firstName)},</p>` +
        `<p>A ${escapeHtml(data.roleLabel)} account has been created for you on Soccernity.</p>` +
        `<p>${escapeHtml(data.roleSentence)}</p>` +
        `<p>Your sign-in email: ${escapeHtml(data.email)}</p>` +
        (data.link ? `<p><a href="${escapeHtml(data.link)}">Sign in to the admin console</a></p>` : '') +
        `<p>This email does not contain a password. The person who created your account will give you your password separately. Sign in and change it straight away.</p>` +
        (data.twoFactorRequired
          ? `<p>Admin accounts need two-factor authentication with an authenticator app. You will be asked to set it up the first time you sign in.</p>`
          : '') +
        `<p>Welcome to the team,<br>The Soccernity Team</p>`
      );
    case 'account-deletion-requested':
      return (
        `<p>Hi ${escapeHtml(data.firstName)},</p>` +
        `<p>We have received your request to delete your Soccernity account. Your account is now closed: you have been signed out everywhere and can no longer sign in.</p>` +
        `<p>After ${escapeHtml(data.graceDays)} days your account is anonymised. Your name, email address, phone number and profile details are removed or replaced, and the account can no longer be used. Posts, comments and messages you wrote are not deleted; they stay and are shown as "[deleted user]". Your likes, follows, saved posts, notifications and memberships of rooms, groups and clubs are removed.</p>` +
        `<p>In some cases we keep an account's data for longer, for example while a report involving it is still being looked at.</p>` +
        `<p>If you did not ask for this, contact us at support@soccernity.com as soon as you can.</p>` +
        `<p>The Soccernity Team</p>`
      );
    case 'contact-enquiry-notification':
      return (
        `<p>A new enquiry arrived through the Soccernity Contact Us form.</p>` +
        `<p>Category: ${escapeHtml(data.categoryLabel)}</p>` +
        (data.link
          ? `<p><a href="${escapeHtml(data.link)}">Read it in the admin inbox</a>.</p>`
          : `<p>Read it in the admin inbox.</p>`)
      );
    case 'social-email-code':
      return (
        `<p>Hi,</p>` +
        `<p>Your Soccernity verification code is <strong>${escapeHtml(data.code)}</strong>.</p>` +
        `<p>It expires in 10 minutes. If you did not ask for it, you can ignore this email.</p>`
      );
    case 'login-lockout-notice':
      return (
        `<p>Hi,</p>` +
        `<p>Someone entered the wrong password for your Soccernity account several times, so we have temporarily paused further sign-in attempts.</p>` +
        `<p>If this was you, there is nothing to do.</p>` +
        `<p>If it was not you, <a href="${escapeHtml(data.link)}">reset your password</a>.</p>` +
        `<p>If the link does not work, copy this into your browser: ${escapeHtml(data.link)}</p>`
      );
    case 'username-revoked':
      return (
        `<p>Hi ${escapeHtml(data.displayName)},</p>` +
        `<p>A Soccernity moderator has removed your username because it did not follow our username rules. Usernames must not be offensive, must not pretend to be another person or organisation, and must not include personal details such as a real name, phone number or email address.</p>` +
        `<p>What this means for your account:</p>` +
        `<ul>` +
        `<li>Until you choose a new username, other people see you as "Soccernity member" and you can't post, comment or send messages.</li>` +
        `<li>The next time you log in you will be asked to choose a new username.</li>` +
        `<li>You can't use the removed username again, and nobody else can take it for 30 days.</li>` +
        `</ul>` +
        `<p>You can ask for a review of this decision. The next time you log in, the screen where you choose a new username has an "Ask for a review" button. You can ask until ${escapeHtml(data.lastDayToAsk)}.</p>` +
        `<p>If you think this was a mistake, contact support@soccernity.com.</p>`
      );
    case 'email-change-verify':
      return (
        `<p>Someone asked to use this address for a Soccernity account. To confirm the change:</p>` +
        `<p><a href="${escapeHtml(data.link)}">Confirm my new email</a></p>` +
        `<p>If the button does not work, copy this link into your browser: ${escapeHtml(data.link)}</p>` +
        `<p>The link works once and expires in ${escapeHtml(data.hours)} hours. If you did not ask for this, ignore this email and nothing changes.</p>`
      );
    case 'email-change-notice':
      return (
        `<p>A request was made to change the email address on your Soccernity account.</p>` +
        `<p>Nothing changes until the request is confirmed from the new address. If this was not you, contact support@soccernity.com and change your password.</p>`
      );
    case 'email-change-unavailable':
      return (
        `<p>Someone asked to use this email address to change the email on a Soccernity account.</p>` +
        `<p>It cannot be used for that change because it already belongs to a Soccernity account. Nothing has changed on your account and you do not need to do anything.</p>`
      );
    case 'verify-email':
      return `<p>Verify your Soccernity email address:</p><p><a href="${data.link}">Verify my email</a></p><p>If the button does not work, copy this link into your browser: ${data.link}</p><p>If you did not request this, you can safely ignore this email.</p>`;
    case 'guardian-consent':
      return (
        `<p><strong>${data.minorDisplayName}</strong> has registered for a Soccernity account and listed you as their guardian.</p>` +
        `<p>To review and respond to the request (no account needed):</p><p><a href="${data.link}">Review the request</a></p>` +
        `<p>If the button does not work, copy this link into your browser: ${data.link}</p>` +
        `<p>If you approve and later change your mind, you can <a href="${data.withdrawalPageLink}">withdraw your consent</a> at any time.</p>` +
        `<p>If you did not expect this email, you can safely ignore it.</p>`
      );
    case 'guardian-consent-withdrawal-request':
      return (
        `<p>You asked to withdraw your consent for <strong>${data.minorDisplayName}</strong>'s Soccernity account.</p>` +
        `<p><a href="${data.link}">Confirm withdrawing consent</a></p>` +
        `<p>If the button does not work, copy this link into your browser: ${data.link}</p>` +
        `<p>Or enter this withdrawal code on the page: <strong>${data.withdrawalToken}</strong></p>` +
        `<p>Confirming will close the account and schedule it for deletion.</p>` +
        `<p>If you did not request this, you can safely ignore this email — nothing changes unless the code above is used.</p>`
      );
    case 'guardian-approved-minor':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your guardian has approved your Soccernity account.</p>` +
        `<p>There are still a few steps to finish setting up.</p>` +
        `<p><a href="${data.link}">Log in to continue registration</a></p>` +
        `<p>If the button does not work, copy this link into your browser: ${data.link}</p>` +
        `<p>If you did not create a Soccernity account, you can ignore this email.</p>`
      );
    case 'guardian-consent-declined':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your guardian declined the approval request for your Soccernity account again, and the limit on declined requests has now been reached, so your account cannot be activated.</p>` +
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
    case 'guardian-consent-decline-lapse-reminder':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your Soccernity account is still not approved, and nothing has changed on it for a while.</p>` +
        `<p>We have sent a new approval request to <strong>${data.guardianEmail}</strong>. Please ask them to check their email, including their spam folder. You can also change your guardian's email address from your account.</p>` +
        `<p>If this new request is not answered, your account will be closed and scheduled for deletion.</p>`
      );
    case 'guardian-consent-expired':
      return (
        `<p>Hi ${data.minorDisplayName},</p>` +
        `<p>Your Soccernity account was not approved in time, so it cannot be activated.</p>` +
        `<p>Your account has been closed and is scheduled to be permanently deleted in <strong>${data.graceDays} days</strong>.</p>` +
        `<p>If you still want an account, talk to your guardian and sign up again.</p>`
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
    case 'guardian-security-notice':
      return (
        `<p>${escapeHtml(data.summary)}</p>` +
        `<p><strong>When:</strong> ${escapeHtml(data.when)}</p>` +
        `<p>You are receiving this because you are the guardian on this account. If this was not expected, please contact support@soccernity.com.</p>`
      );
    case 'guardian-safety-notice':
      return (
        `<p>${escapeHtml(data.summary)}</p>` +
        `<p><strong>When:</strong> ${escapeHtml(data.when)}</p>` +
        `<p>You are receiving this because you are the guardian on this account. If you have questions, you can contact support through the ` +
        (data.contactLink
          ? `<a href="${escapeHtml(data.contactLink)}">Contact Us page</a> on Soccernity.</p>`
          : `Contact Us page on Soccernity.</p>`)
      );
    case 'two-factor-recovery-link':
      return (
        `<p>Hi,</p>` +
        `<p>Someone said they have lost both the device and the backup codes for two-factor on your Soccernity account, and asked us to remove it. If that was you, <a href="${escapeHtml(data.link)}">open this link to continue</a>.</p>` +
        `<p>Opening the link changes nothing yet. After you confirm, we wait 24 hours before removing two-factor, and we email you so you can stop it.</p>` +
        `<p>If the link does not work, copy this into your browser: ${escapeHtml(data.link)}</p>` +
        `<p>If this was not you, ignore this email and think about changing your password.</p>`
      );
    case 'two-factor-recovery-guardian-link':
      return (
        `<p><strong>${escapeHtml(data.minorDisplayName)}</strong> has asked us to remove two-factor (a second sign-in step) from their Soccernity account, because they lost their device and their backup codes.</p>` +
        `<p>As their guardian you can approve this or say you did not expect it. No account is needed: <a href="${escapeHtml(data.link)}">review the request</a>.</p>` +
        `<p>The link works for 72 hours. Nothing changes unless you approve.</p>` +
        `<p>If the link does not work, copy this into your browser: ${escapeHtml(data.link)}</p>` +
        `<p>If you did not expect this, you can answer "I didn't expect this" on the page, or just ignore this email.</p>`
      );
    case 'two-factor-recovery-minor-notice':
      return (
        `<p>Hi ${escapeHtml(data.minorDisplayName)},</p>` +
        `<p>You asked to remove two-factor from your Soccernity account. Because you are under 18, we have sent the request to your guardian instead of your own inbox.</p>` +
        `<p>Nothing changes unless they approve it. Ask them to check their email, including their spam folder.</p>` +
        `<p>If you did not make this request, change your password.</p>`
      );
    case 'two-factor-recovery-waiting':
      return (
        `<p>Hi,</p>` +
        `<p>You confirmed a request to remove two-factor from your Soccernity account. It will be removed after ${escapeHtml(data.executeAtText)}.</p>` +
        `<p>If this was not you, <a href="${escapeHtml(data.link)}">stop it now</a>.</p>` +
        `<p>If the link does not work, copy this into your browser: ${escapeHtml(data.link)}</p>` +
        `<p>Signing in with your authenticator app or a backup code before then also stops it.</p>`
      );
    case 'two-factor-recovery-completed':
      return (
        `<p>Hi,</p>` +
        `<p>Two-factor has been removed from your Soccernity account, and you have been signed out everywhere. Sign in with your password. You can turn two-factor on again in your account settings.</p>` +
        `<p>If you did not ask for this, reset your password and contact support@soccernity.com.</p>`
      );
    case 'two-factor-recovery-approved':
      return (
        `<p>Hi ${escapeHtml(data.minorDisplayName)},</p>` +
        `<p>Your guardian approved your request. Two-factor has been removed from your Soccernity account, and you have been signed out everywhere. Sign in with your password. You can turn two-factor on again in your account settings.</p>` +
        `<p>If you did not ask for this, change your password and tell your guardian.</p>`
      );
    case 'two-factor-recovery-declined':
      return (
        `<p>Hi ${escapeHtml(data.minorDisplayName)},</p>` +
        `<p>Your guardian said they did not expect your request to remove two-factor, so nothing has changed on your Soccernity account.</p>` +
        `<p>If you did not make that request, change your password now.</p>`
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

// "3 December 2026", always read in UTC (the review window ends at the end of a UTC day, see
// username-review-window.util.ts). en-GB for day-month-year order.
function formatLongDateUtc(value: Date): string {
  return value.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// Minimal HTML escape for user-supplied text placed in an HTML body. Added with
// the username-revoked template (B-033): displayName is free text. The older
// templates in this file interpolate it unescaped; that is a pre-existing
// weakness of theirs, not something this change widens.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
