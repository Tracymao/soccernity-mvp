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
