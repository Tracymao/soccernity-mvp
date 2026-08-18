import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordResetEmailService } from './password-reset-email.service';

const mockSendEmail = jest.fn();

jest.mock('postmark', () => ({
  ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
}));

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('PasswordResetEmailService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is "not live" — resolves without throwing or calling Postmark when the .env.example placeholder is unset', async () => {
    const service = new PasswordResetEmailService(buildConfig({ EMAIL_PROVIDER_API_KEY: undefined }));

    await expect(service.sendPasswordResetEmail('player@example.com', 'reset-tok')).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('is "not live" when EMAIL_PROVIDER_API_KEY is still the literal placeholder', async () => {
    const service = new PasswordResetEmailService(buildConfig({ EMAIL_PROVIDER_API_KEY: 'replace-me' }));

    await expect(service.sendPasswordResetEmail('player@example.com', 'reset-tok')).resolves.toBeUndefined();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  describe('once a real key is set (Decision Log #17 — Postmark live)', () => {
    it('calls Postmark with the correct recipient, subject, and reset link', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-1' });
      const service = new PasswordResetEmailService(
        buildConfig({
          EMAIL_PROVIDER_API_KEY: 'a-real-key',
          POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
          WEB_APP_BASE_URL: 'https://app.soccernity.example',
        }),
      );

      await service.sendPasswordResetEmail('player@example.com', 'reset-tok');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'no-reply@soccernity.example',
          To: 'player@example.com',
          Subject: 'Reset your Soccernity password',
          HtmlBody: expect.stringContaining(
            'https://app.soccernity.example/reset-password?token=reset-tok',
          ),
          TextBody: expect.stringContaining(
            'https://app.soccernity.example/reset-password?token=reset-tok',
          ),
        }),
      );
    });

    it('catches a Postmark send failure and logs it, without rejecting or leaking the reset link/token', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockSendEmail.mockRejectedValueOnce(new Error('Postmark: invalid API token'));
      const service = new PasswordResetEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example' }),
      );

      await expect(
        service.sendPasswordResetEmail('player@example.com', 'super-secret-reset-token'),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const loggedMessage = errorSpy.mock.calls[0][0] as string;
      expect(loggedMessage).not.toContain('super-secret-reset-token');

      errorSpy.mockRestore();
    });
  });
});
