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
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await service.sendVerificationEmail('minor@example.com', 'tok-1');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'no-reply@soccernity.example',
          To: 'minor@example.com',
          Subject: 'Verify your Soccernity email',
          HtmlBody: expect.stringContaining('tok-1'),
          TextBody: expect.stringContaining('tok-1'),
        }),
      );
    });

    it('calls Postmark with the correct recipient, subject, and template data for a guardian-consent email', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-2' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await service.sendGuardianConsentEmail('guardian@example.com', 'consent-tok', 'Minor Name');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'no-reply@soccernity.example',
          To: 'guardian@example.com',
          Subject: "Consent requested for Minor Name's Soccernity account",
          HtmlBody: expect.stringContaining('consent-tok'),
          TextBody: expect.stringContaining('consent-tok'),
        }),
      );
    });

    it('renders the founder-approved guardian-minor-turned-18 copy verbatim', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-18' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
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

    it('sends a public-report acknowledgement with no outcome/timeline promise', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-report' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await service.sendPublicReportAcknowledgementEmail('reporter@example.com');

      const sent = mockSendEmail.mock.calls[0][0] as { To: string; Subject: string; TextBody: string };
      expect(sent.To).toBe('reporter@example.com');
      expect(sent.Subject).toBe('We received your report');
      expect(sent.TextBody).toContain('a moderator will review it');
      expect(sent.TextBody).not.toMatch(/\d+\s*(day|hour|week)/i);
    });

    // feat/moderation-outcome-appeal-emails
    it('sends the reporter an outcome email with the mapped copy and no reported-party details', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-actioned' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
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
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
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
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await expect(service.sendReportActionedEmail('reporter@example.com', 'nuked_from_orbit')).rejects.toThrow(
        'Unknown report action',
      );
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('tells the appellant an upheld appeal changed nothing', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-upheld' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await service.sendAppealDecisionEmail('appellant@example.com', 'upheld');

      const sent = mockSendEmail.mock.calls[0][0] as { Subject: string; TextBody: string };
      expect(sent.Subject).toBe('Your appeal has been reviewed');
      expect(sent.TextBody).toContain('has been upheld, so no change has been made');
    });

    it('tells the appellant an overturned appeal reopened the report, without claiming any enforced reversal', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-overturned' });
      const service = new RegistrationEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
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
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
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
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await expect(service.sendVerificationEmail('minor@example.com', 'super-secret-token')).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = errorSpy.mock.calls[0][0] as string;
      expect(loggedMessage).not.toContain('super-secret-token');

      errorSpy.mockRestore();
    });
  });
});
