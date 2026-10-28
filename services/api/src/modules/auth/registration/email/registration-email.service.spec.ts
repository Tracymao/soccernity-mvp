import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RegistrationEmailService } from './registration-email.service';

const mockSendEmail = jest.fn();

jest.mock('postmark', () => ({
  ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
}));

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('RegistrationEmailService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is "wired but inactive" — resolves without throwing when the .env.example placeholder is unset', async () => {
    const service = new RegistrationEmailService(buildConfig({ EMAIL_PROVIDER_API_KEY: undefined }));

    await expect(service.sendVerificationEmail('minor@example.com', 'tok-1')).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('is "wired but inactive" when EMAIL_PROVIDER_API_KEY is still the literal placeholder', async () => {
    const service = new RegistrationEmailService(buildConfig({ EMAIL_PROVIDER_API_KEY: 'replace-me' }));

    await expect(
      service.sendGuardianConsentEmail('guardian@example.com', 'consent-tok', 'Minor Name'),
    ).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  describe('once a real key is set (Decision Log #17 — Postmark live)', () => {
    it('calls Postmark with the correct recipient, subject, and template data for a verification email', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-1' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendVerificationEmail('minor@example.com', 'tok-1');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'no-reply@soccernity.example',
          To: 'minor@example.com',
          Subject: 'Verify your Soccernity email',
          HtmlBody: expect.stringContaining('https://app.soccernity.com/verify-email?token=tok-1'),
          TextBody: expect.stringContaining('https://app.soccernity.com/verify-email?token=tok-1'),
        }),
      );
    });

    it('calls Postmark with the correct recipient, subject, and template data for a guardian-consent email', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-2' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendGuardianConsentEmail('guardian@example.com', 'consent-tok', 'Minor Name');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'no-reply@soccernity.example',
          To: 'guardian@example.com',
          Subject: "Consent requested for Minor Name's Soccernity account",
          HtmlBody: expect.stringContaining('https://app.soccernity.com/guardian-consent/confirm?token=consent-tok'),
          TextBody: expect.stringContaining('https://app.soccernity.com/guardian-consent/confirm?token=consent-tok'),
        }),
      );
    });

    it('renders the founder-approved guardian-minor-turned-18 copy verbatim', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-18' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendGuardianMinorTurned18Email('g@example.com', 'Ada Lovelace', 'Grace Hopper');

      const sent = mockSendEmail.mock.calls[0][0] as { Subject: string; TextBody: string; HtmlBody: string };
      expect(sent.Subject).toBe("An update on Ada Lovelace's Soccernity account");
      expect(sent.TextBody).toBe(
        `Hi Grace,

` +
          `We're writing to let you know that Ada Lovelace's Soccernity account has automatically moved from a minor's account to an adult account, now that they've turned 18.

` +
          `This means the guardian consent and oversight settings you originally set up no longer apply — Ada Lovelace now manages their own account the same way any adult user does. You don't need to do anything, and this isn't a request for action.

` +
          `If you have any questions about this change, or about the account generally, you can reach us at support@soccernity.com.

` +
          `Thanks for being part of Ada Lovelace's Soccernity journey so far.

` +
          `— The Soccernity team`,
      );
      expect(sent.HtmlBody).toContain('<p>Hi Grace,</p>');
      expect(sent.HtmlBody).toContain('support@soccernity.com');
      expect(sent.HtmlBody).not.toMatch(/placeholder|verification code/i);
    });

    // safeguarding/guardian-email-change-endpoint (Decision Log #365)
    it('sends the previous guardian address a withdrawn notice that carries no token and asks for nothing', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-replaced' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendGuardianEmailReplacedEmail('old-guardian@example.com', 'Ada Lovelace');

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
      expect(sent.To).toBe('old-guardian@example.com');
      expect(sent.Subject).toBe('The Soccernity approval request for Ada Lovelace was withdrawn');
      expect(sent.TextBody).toContain('no longer works');
      expect(sent.TextBody).toContain('support@soccernity.com');
      expect(sent.HtmlBody).toContain('Ada Lovelace');
      // Never a credential, never the new address.
      expect(sent.TextBody).not.toMatch(/token|code is|consent code/i);
    });

    // B-126 (Decision Log #406 item 1)
    it('warns the minor after a declined-and-abandoned request: new request sent, closure if unanswered, no decline count, not the "first request expired" wording', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-lapse' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendConsentDeclineLapseReminderEmail('minor@example.com', 'Ada', 'parent@example.com');

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
      expect(sent.To).toBe('minor@example.com');
      expect(sent.Subject).toBe('Your Soccernity account still needs guardian approval');
      expect(sent.TextBody).toContain('parent@example.com');
      expect(sent.TextBody).toContain('closed and scheduled for deletion');
      // The existing reminder's claim would be untrue here: the guardian answered.
      expect(sent.TextBody).not.toMatch(/first request has now expired/i);
      // Never a credential, never a running count.
      expect(sent.TextBody + sent.HtmlBody).not.toMatch(/token|declined \d|\d of 3|three times/i);
    });

    // Wording fix (backend/w3e): reached by an unanswered request, by a second
    // lapse, AND by a request that was declined, reopened by the stale-decline
    // sweep (B-126) and then not answered. The old text claimed "Your guardian
    // did not respond to either approval request", untrue for a guardian who
    // did respond by declining.
    it('the second-expiry email says only what is true on every route: not approved in time, closed, grace days; never that the guardian did not respond', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-expired' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendConsentExpiredEmail('minor@example.com', 'Ada', 30);

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
      expect(sent.To).toBe('minor@example.com');
      expect(sent.Subject).toBe('Your Soccernity account was not approved in time');
      expect(sent.TextBody).toContain('Hi Ada,');
      expect(sent.TextBody).toContain('was not approved in time');
      expect(sent.TextBody).toContain('permanently deleted in 30 days');
      expect(sent.HtmlBody).toContain('was not approved in time');
      expect(sent.HtmlBody).toContain('<strong>30 days</strong>');
      // The untrue claim, in either body.
      expect(sent.TextBody + sent.HtmlBody).not.toMatch(/did not respond|either approval request|either request/i);
      // No history, no count, no credential.
      expect(sent.TextBody + sent.HtmlBody).not.toMatch(/declin|\d of 3|three times|token/i);
    });

    // B-028 (Decision Log #373, #394 A5)
    describe('guardian-approved-minor (B-028)', () => {
      const liveConfig = {
        EMAIL_PROVIDER_API_KEY: 'a-real-key',
        POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
        WEB_APP_BASE_URL: 'https://app.soccernity.com',
      };

      it("goes to the minor, says 'approved ... continue registration', links to /login, and carries no token", async () => {
        mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-approved' });
        const service = new RegistrationEmailService(buildConfig(liveConfig));

        await service.sendGuardianApprovedMinorEmail('minor@example.com', 'Ada Minor');

        const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
        expect(sent.To).toBe('minor@example.com');
        expect(sent.Subject).toBe('Your guardian approved your Soccernity account');
        expect(sent.TextBody).toContain('Hi Ada Minor,');
        expect(sent.TextBody).toMatch(/approved your Soccernity account/i);
        expect(sent.TextBody).toMatch(/continue registration/i);
        expect(sent.TextBody).toContain('https://app.soccernity.com/login');
        expect(sent.HtmlBody).toContain('href="https://app.soccernity.com/login"');
        // #394 A5: the flow is NOT finished, so it must not claim everything is switched on.
        expect(sent.TextBody).not.toMatch(/switched on|all set|fully active|full access/i);
        // A plain link: no credential in the URL.
        expect(sent.TextBody).not.toMatch(/token=/);
      });

      it('sends NOTHING (and logs the reason) when WEB_APP_BASE_URL is unusable, rather than an email with no link', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const service = new RegistrationEmailService(buildConfig({ ...liveConfig, WEB_APP_BASE_URL: undefined }));

        await expect(service.sendGuardianApprovedMinorEmail('minor@example.com', 'Ada Minor')).resolves.toBeUndefined();

        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('guardian-approved-minor'));
        error.mockRestore();
      });

      it('is wired but inactive without a Postmark key: resolves, calls nothing', async () => {
        const service = new RegistrationEmailService(buildConfig({ ...liveConfig, EMAIL_PROVIDER_API_KEY: undefined }));
        await expect(service.sendGuardianApprovedMinorEmail('minor@example.com', 'Ada Minor')).resolves.toBeUndefined();
        expect(mockSendEmail).not.toHaveBeenCalled();
      });
    });

    it('sends a public-report acknowledgement with no outcome/timeline promise', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-report' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendPublicReportAcknowledgementEmail('reporter@example.com');

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string };
      expect(sent.To).toBe('reporter@example.com');
      expect(sent.Subject).toBe('We received your report');
      expect(sent.TextBody).toContain('a moderator will review it');
      expect(sent.TextBody).not.toMatch(/\d+\s*(day|hour|week)/i);
    });

    // B-033 (Decision Log #398 D3)
    it('sends the username-revoked email: no admin reason, no link, escaped name, the consequences stated', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-revoked' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendUsernameRevokedEmail('user@example.com', 'Ada <b>Obi</b>');

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
      expect(sent.To).toBe('user@example.com');
      expect(sent.Subject).toBe('Your Soccernity username was removed');
      for (const body of [sent.TextBody, sent.HtmlBody]) {
        expect(body).toContain('Soccernity member');
        expect(body).toContain("can't use the removed username again");
        expect(body).toContain('30 days');
        expect(body).toContain('support@soccernity.com');
        expect(body).not.toMatch(/https?:\/\//);
      }
      expect(sent.HtmlBody).toContain('Ada &lt;b&gt;Obi&lt;/b&gt;');
      expect(sent.HtmlBody).not.toContain('<b>Obi</b>');
    });

    describe('sendLoginLockoutNoticeEmail', () => {
      const liveConfig = {
        EMAIL_PROVIDER_API_KEY: 'a-real-key',
        POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
        WEB_APP_BASE_URL: 'https://app.soccernity.com',
      };

      it('sends a plain notice with a reset link and nothing about the guesser', async () => {
        mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-lockout' });
        const service = new RegistrationEmailService(buildConfig(liveConfig));

        await expect(service.sendLoginLockoutNoticeEmail('owner@example.com')).resolves.toBe(true);

        const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
        expect(sent.To).toBe('owner@example.com');
        expect(sent.Subject).toBe('Someone entered the wrong password on your Soccernity account');
        for (const body of [sent.TextBody, sent.HtmlBody]) {
          expect(body).toContain('https://app.soccernity.com/forgot-password');
          expect(body).toContain('there is nothing to do');
          // No IP address, no times, no counts, no token.
          expect(body).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
          expect(body).not.toMatch(/\d+\s*(times|attempts|minutes)/i);
          expect(body).not.toContain('token=');
          expect(body).not.toContain('COPY PENDING LEGAL REVIEW');
        }
      });

      it('sends NOTHING and returns false when WEB_APP_BASE_URL is unusable', async () => {
        const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
        const service = new RegistrationEmailService(buildConfig({ ...liveConfig, WEB_APP_BASE_URL: undefined }));

        await expect(service.sendLoginLockoutNoticeEmail('owner@example.com')).resolves.toBe(false);

        expect(mockSendEmail).not.toHaveBeenCalled();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('login-lockout-notice'));
        error.mockRestore();
      });

      it('is wired but inactive without a Postmark key: resolves true, calls nothing, logs no content to Postmark', async () => {
        const service = new RegistrationEmailService(buildConfig({ ...liveConfig, EMAIL_PROVIDER_API_KEY: undefined }));
        await expect(service.sendLoginLockoutNoticeEmail('owner@example.com')).resolves.toBe(true);
        expect(mockSendEmail).not.toHaveBeenCalled();
      });
    });

    it('does not send a username-revoked email while the provider is not configured (logs only)', async () => {
      const service = new RegistrationEmailService(buildConfig({ EMAIL_PROVIDER_API_KEY: 'replace-me' }));
      await expect(service.sendUsernameRevokedEmail('user@example.com', 'Ada')).resolves.toBeUndefined();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    // feat/moderation-outcome-appeal-emails
    it('sends the reporter an outcome email with the mapped copy and no reported-party details', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-actioned' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendReportActionedEmail('reporter@example.com', 'content_removed');

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string; HtmlBody: string };
      expect(sent.To).toBe('reporter@example.com');
      expect(sent.Subject).toBe('An update on your Soccernity report');
      expect(sent.TextBody).toContain('Outcome: Content removed');
      expect(sent.TextBody).toContain('has been removed');
      expect(sent.TextBody).toContain("can't share further details");
      expect(sent.HtmlBody).toContain('<strong>Outcome:</strong> Content removed');
    });

    it('maps every ReportAction to its own outcome label', async () => {
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );
      const expected: Record<string, string> = {
        content_removed: 'Content removed',
        warning_issued: 'Warning issued',
        user_suspended: 'Account suspended',
        dismissed: 'No action taken',
      };

      for (const [action, label] of Object.entries(expected)) {
        mockSendEmail.mockResolvedValueOnce({ MessageID: `msg-${action}` });
        await service.sendReportActionedEmail('reporter@example.com', action);
        const calls = mockSendEmail.mock.calls;
        const sent = calls[calls.length - 1][0] as { TextBody: string };
        expect(sent.TextBody).toContain(`Outcome: ${label}`);
      }
    });

    it('rejects an unknown report action before anything is queued', async () => {
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await expect(service.sendReportActionedEmail('reporter@example.com', 'nuked_from_orbit')).rejects.toThrow(
        'Unknown report action',
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('tells the appellant an upheld appeal changed nothing', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-upheld' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendAppealDecisionEmail('appellant@example.com', 'upheld');

      const sent = mockSendEmail.mock.calls[0][0] as { Subject: string; TextBody: string };
      expect(sent.Subject).toBe('Your appeal has been reviewed');
      expect(sent.TextBody).toContain('has been upheld, so no change has been made');
    });

    it('tells the appellant an overturned appeal reopened the report, without claiming any enforced reversal', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-overturned' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await service.sendAppealDecisionEmail('appellant@example.com', 'overturned');

      const sent = mockSendEmail.mock.calls[0][0] as { TextBody: string; HtmlBody: string };
      expect(sent.TextBody).toContain('overturned the original decision');
      expect(sent.TextBody).toContain('returned to our review queue');
      expect(sent.TextBody).not.toMatch(/reinstated|restored|lifted|reversed/i);
      expect(sent.HtmlBody).toContain('returned to our review queue');
    });

    it('rejects an unknown appeal decision before anything is queued', async () => {
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await expect(service.sendAppealDecisionEmail('appellant@example.com', 'maybe')).rejects.toThrow(
        'Unknown appeal decision',
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('catches a Postmark send failure and logs it, without rejecting or leaking the token', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockSendEmail.mockRejectedValueOnce(new Error('Postmark: invalid API token'));
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example', WEB_APP_BASE_URL: 'https://app.soccernity.com' }),
      );

      await expect(service.sendVerificationEmail('minor@example.com', 'super-secret-token')).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = errorSpy.mock.calls[0][0] as string;
      expect(loggedMessage).not.toContain('super-secret-token');

      errorSpy.mockRestore();
    });
  });
  // B-016 (build register): the emails carried a bare code and nothing built a
  // URL, so no real user could reach /verify-email or /guardian-consent/confirm.
  describe('links into apps/web (B-016)', () => {
    const live = { EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' };

    it('verify-email carries a /verify-email?token= link and no bare "code"', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'm' });
      const service = new RegistrationEmailService(buildConfig({ ...live, WEB_APP_BASE_URL: 'https://app.soccernity.com' }));
      await service.sendVerificationEmail('u@example.com', 'a b');
      const sent = mockSendEmail.mock.calls[0][0];
      expect(sent.TextBody).toContain('https://app.soccernity.com/verify-email?token=a+b');
      expect(sent.HtmlBody).toContain('href="https://app.soccernity.com/verify-email?token=a+b"');
      expect(sent.TextBody).not.toMatch(/verification code/i);
    });

    it('guardian-consent carries a /guardian-consent/confirm?token= link and no bare "consent code"', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'm' });
      const service = new RegistrationEmailService(buildConfig({ ...live, WEB_APP_BASE_URL: 'https://app.soccernity.com/' }));
      await service.sendGuardianConsentEmail('g@example.com', 'uuid-1', 'Minor Name');
      const sent = mockSendEmail.mock.calls[0][0];
      expect(sent.TextBody).toContain('https://app.soccernity.com/guardian-consent/confirm?token=uuid-1');
      expect(sent.HtmlBody).toContain('href="https://app.soccernity.com/guardian-consent/confirm?token=uuid-1"');
      expect(sent.TextBody).not.toMatch(/consent code/i);
    });

    // B-112 / B-225 (Decision Log #414 item 1).
    it('guardian-consent also links the withdrawal REQUEST page, with no token and no pre-fill', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'm' });
      const service = new RegistrationEmailService(buildConfig({ ...live, WEB_APP_BASE_URL: 'https://app.soccernity.com/' }));
      await service.sendGuardianConsentEmail('g@example.com', 'uuid-1', 'Minor Name');
      const sent = mockSendEmail.mock.calls[0][0];
      expect(sent.TextBody).toContain('withdraw your consent at any time:\n\nhttps://app.soccernity.com/guardian-consent/withdraw\n');
      expect(sent.HtmlBody).toContain('<a href="https://app.soccernity.com/guardian-consent/withdraw">withdraw your consent</a>');
      // The consent token must not leak into the withdrawal link, and the
      // withdrawal link must not carry any query at all.
      expect(sent.TextBody).not.toContain('guardian-consent/withdraw?');
      expect(sent.HtmlBody).not.toContain('guardian-consent/withdraw?');
      // The confirm link is unchanged.
      expect(sent.TextBody).toContain('https://app.soccernity.com/guardian-consent/confirm?token=uuid-1');
    });

    it('keeps the withdrawal link when the base URL carries a path prefix', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'm' });
      const service = new RegistrationEmailService(buildConfig({ ...live, WEB_APP_BASE_URL: 'https://soccernity.com/app' }));
      await service.sendGuardianConsentEmail('g@example.com', 'uuid-1', 'Minor Name');
      expect(mockSendEmail.mock.calls[0][0].TextBody).toContain('https://soccernity.com/app/guardian-consent/withdraw\n');
    });

    it('withdrawal request carries a link AND keeps the code the designed screen accepts', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'm' });
      const service = new RegistrationEmailService(buildConfig({ ...live, WEB_APP_BASE_URL: 'https://app.soccernity.com' }));
      await service.sendGuardianWithdrawalRequestEmail('g@example.com', 'wd-1', 'Minor Name');
      const sent = mockSendEmail.mock.calls[0][0];
      expect(sent.TextBody).toContain('https://app.soccernity.com/guardian-consent/withdraw?token=wd-1');
      expect(sent.TextBody).toContain('withdrawal code on the page: wd-1');
      expect(sent.HtmlBody).toContain('href="https://app.soccernity.com/guardian-consent/withdraw?token=wd-1"');
    });

    it.each([
      ['unset', undefined],
      ['blank', '  '],
      ['a placeholder host', 'https://app.soccernity.example'],
      ['plain http on a real host', 'http://app.soccernity.com'],
    ])('FAILS SAFE: sends nothing and logs an error without the token when WEB_APP_BASE_URL is %s', async (_l, base) => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const service = new RegistrationEmailService(buildConfig({ ...live, WEB_APP_BASE_URL: base }));

      await expect(service.sendVerificationEmail('u@example.com', 'secret-tok')).resolves.toBeUndefined();
      await expect(service.sendGuardianConsentEmail('g@example.com', 'secret-consent', 'M')).resolves.toBeUndefined();
      await expect(service.sendGuardianWithdrawalRequestEmail('g@example.com', 'secret-wd', 'M')).resolves.toBeUndefined();

      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(3);
      const logged = errorSpy.mock.calls.map((c) => String(c[0])).join(' | ');
      expect(logged).toContain('WEB_APP_BASE_URL');
      expect(logged).not.toMatch(/secret-tok|secret-consent|secret-wd|@example\.com/);
      errorSpy.mockRestore();
    });

    it('also fails safe when the provider is not live (nothing is "would-send" logged with a broken link)', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const service = new RegistrationEmailService(buildConfig({ EMAIL_PROVIDER_API_KEY: undefined, WEB_APP_BASE_URL: undefined }));
      await service.sendVerificationEmail('u@example.com', 'tok');
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).not.toHaveBeenCalled();
      errorSpy.mockRestore();
      logSpy.mockRestore();
    });
  });
});
