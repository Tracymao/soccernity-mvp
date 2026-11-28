// Sample data for every email template, used by `npm run email:preview` and by the email specs. The Record type
// makes the compiler refuse a template union member with no sample, so a new template cannot ship unrendered.
// Invented people and addresses only; nothing here is sent anywhere.
import type { RegistrationEmailTemplate } from '../modules/auth/registration/email/registration-email.service';

export interface EmailSample {
  subject: string;
  data: Record<string, string>;
}

export function emailSamples(base: string): Record<RegistrationEmailTemplate, EmailSample> {
  const link = (path: string) => `${base}${path}`;
  const minor = { minorDisplayName: 'Sam Obi' };
  const notice = { summary: 'Two-factor was turned off on this account.', when: '1 November 2026, 14:32 UTC' };
  const twoFactorRemoved = 'Two-factor was removed from your Soccernity account';
  return {
    'verify-email': { subject: 'Verify your Soccernity email', data: { link: link('/verify-email?token=sample') } },
    'guardian-consent': {
      subject: "Consent requested for Sam Obi's Soccernity account",
      data: {
        ...minor,
        link: link('/guardian-consent/confirm?token=sample'),
        withdrawalPageLink: link('/guardian-consent/withdraw'),
      },
    },
    'guardian-consent-withdrawal-request': {
      subject: "Confirm withdrawing consent for Sam Obi's Soccernity account",
      data: { ...minor, link: link('/guardian-consent/withdraw?token=sample'), withdrawalToken: 'sample-code' },
    },
    'guardian-approved-minor': {
      subject: 'Your guardian approved your Soccernity account',
      data: { ...minor, link: link('/login') },
    },
    'guardian-consent-declined': { subject: 'Your Soccernity account has been closed', data: { ...minor, graceDays: '30' } },
    'guardian-consent-withdrawn': {
      subject: 'Guardian consent for your Soccernity account has been withdrawn',
      data: { ...minor, graceDays: '30' },
    },
    'guardian-consent-reminder': {
      subject: 'Your Soccernity account is still waiting for guardian approval',
      data: { ...minor, guardianEmail: 'guardian@example.com' },
    },
    'guardian-consent-decline-lapse-reminder': {
      subject: 'Your Soccernity account still needs guardian approval',
      data: { ...minor, guardianEmail: 'guardian@example.com' },
    },
    'guardian-consent-expired': {
      subject: 'Your Soccernity account was not approved in time',
      data: { ...minor, graceDays: '30' },
    },
    'guardian-minor-turned-18': {
      subject: "An update on Sam Obi's Soccernity account",
      data: { ...minor, guardianFirstName: 'Ada' },
    },
    'guardian-email-replaced': {
      subject: 'The Soccernity approval request for Sam Obi was withdrawn',
      data: { ...minor },
    },
    'guardian-security-notice': { subject: 'A security change on the account you look after', data: { ...notice } },
    'guardian-safety-notice': {
      subject: 'A safety action on the account you look after',
      data: { ...notice, contactLink: link('/contact') },
    },
    'two-factor-recovery-link': {
      subject: 'Remove two-factor from your Soccernity account?',
      data: { link: link('/two-factor/recovery/confirm?token=sample') },
    },
    'two-factor-recovery-guardian-link': {
      subject: 'Sam Obi asked to remove two-factor from their Soccernity account',
      data: { ...minor, link: link('/two-factor/recovery/guardian?token=sample') },
    },
    'two-factor-recovery-minor-notice': {
      subject: 'We asked your guardian about removing two-factor',
      data: { ...minor },
    },
    'two-factor-recovery-waiting': {
      subject: 'Two-factor will be removed from your Soccernity account',
      data: { link: link('/two-factor/recovery/cancel?token=sample'), executeAtText: '2 November 2026, 14:32 UTC' },
    },
    'two-factor-recovery-completed': { subject: twoFactorRemoved, data: {} },
    'two-factor-recovery-approved': { subject: twoFactorRemoved, data: { ...minor } },
    'two-factor-recovery-declined': { subject: 'Your guardian did not expect the two-factor request', data: { ...minor } },
    'public-report-acknowledgement': { subject: 'We received your report', data: {} },
    'report-actioned': {
      subject: 'An update on your Soccernity report',
      data: {
        outcomeLabel: 'Content removed',
        outcomeReason: "The content you reported was found to break Soccernity's community guidelines and has been removed.",
      },
    },
    'appeal-decision': { subject: 'Your appeal has been reviewed', data: { decision: 'upheld' } },
    'username-revoked': {
      subject: 'Your Soccernity username was removed',
      data: { displayName: 'Ada', lastDayToAsk: '3 December 2026' },
    },
    'login-lockout-notice': {
      subject: 'Someone entered the wrong password on your Soccernity account',
      data: { link: link('/forgot-password') },
    },
    'contact-enquiry-notification': {
      subject: 'New Contact Us enquiry: General',
      data: { categoryLabel: 'General', link: link('/admin/enquiries') },
    },
    'email-change-verify': {
      subject: 'Confirm your new Soccernity email address',
      data: { link: link('/email-change/confirm?token=sample'), hours: '24' },
    },
    'email-change-notice': { subject: 'A request to change the email on your Soccernity account', data: {} },
    'email-change-unavailable': { subject: 'A request to use your email address on Soccernity', data: {} },
    'password-changed': { subject: 'Your Soccernity password was changed', data: { firstName: 'Ada' } },
    'password-reset-completed': {
      subject: 'Your Soccernity password was reset',
      data: { firstName: 'Ada', link: link('/forgot-password') },
    },
    welcome: { subject: 'Welcome to Soccernity', data: { firstName: 'Ada', link: link('/login') } },
    'staff-account-created': {
      subject: 'Your Soccernity moderator account',
      data: {
        firstName: 'Ada',
        roleLabel: 'moderator',
        roleSentence: 'You can review reports and act on content.',
        email: 'ada@example.com',
        link: link('/admin/login'),
        twoFactorRequired: 'yes',
      },
    },
    'account-deletion-requested': {
      subject: 'Your Soccernity account deletion request',
      data: { firstName: 'Ada', graceDays: '30' },
    },
    'account-suspended': {
      subject: 'Your Soccernity account has been suspended',
      data: { reasonLine: 'breaching our community rules', contactLink: link('/contact') },
    },
    'account-reinstated': { subject: 'Your Soccernity account has been reinstated', data: {} },
  };
}
