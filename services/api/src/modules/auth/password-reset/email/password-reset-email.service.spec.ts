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
          WEB_APP_BASE_URL: 'https://app.soccernity.com',
        }),
      );

      await service.sendPasswordResetEmail('player@example.com', 'reset-tok');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          From: 'no-reply@soccernity.example',
          To: 'player@example.com',
          Subject: 'Reset your Soccernity password',
          HtmlBody: expect.stringContaining(
            'https://app.soccernity.com/reset-password?token=reset-tok',
          ),
          TextBody: expect.stringContaining(
            'https://app.soccernity.com/reset-password?token=reset-tok',
          ),
        }),
      );
    });

    it('catches a Postmark send failure and logs it, without rejecting or leaking the reset link/token', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      mockSendEmail.mockRejectedValueOnce(new Error('Postmark: invalid API token'));
      const service = new PasswordResetEmailService(
        buildConfig({
          EMAIL_PROVIDER_API_KEY: 'a-real-key',
          POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
          WEB_APP_BASE_URL: 'https://app.soccernity.com',
        }),
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

  // B-115 (Decision Log #468): the reset link is the point of the email, so an
  // unusable WEB_APP_BASE_URL means nothing is sent. Same rule, same helper
  // (buildWebAppLink) as the registration emails (B-016).
  describe('when WEB_APP_BASE_URL is unusable (B-115)', () => {
    const unusable: Array<[string, string | undefined]> = [
      ['unset', undefined],
      ['empty', ''],
      ['blank', '   '],
      ['malformed', 'not a url'],
      ['a non-http scheme', 'ftp://app.soccernity.com'],
      ['the old placeholder host', 'https://app.soccernity.example'],
      ['a replace-me placeholder', 'https://replace-me.invalid'],
      ['plain http on a real host', 'http://app.soccernity.com'],
    ];

    it.each(unusable)('sends nothing when it is %s, in live mode', async (_label, value) => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const service = new PasswordResetEmailService(
        buildConfig({
          EMAIL_PROVIDER_API_KEY: 'a-real-key',
          POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
          WEB_APP_BASE_URL: value,
        }),
      );

      await expect(
        service.sendPasswordResetEmail('player@example.com', 'super-secret-reset-token'),
      ).resolves.toBeUndefined();

      expect(mockSendEmail).not.toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it.each(unusable)('sends nothing when it is %s, in not-live mode too', async (_label, value) => {
      const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const service = new PasswordResetEmailService(buildConfig({ WEB_APP_BASE_URL: value }));

      await service.sendPasswordResetEmail('player@example.com', 'super-secret-reset-token');

      expect(mockSendEmail).not.toHaveBeenCalled();
      // Not-live mode must not log a made-up link either.
      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it('logs exactly one clear error that names the variable and never the address or the token', async () => {
      const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const service = new PasswordResetEmailService(
        buildConfig({ EMAIL_PROVIDER_API_KEY: 'a-real-key', WEB_APP_BASE_URL: undefined }),
      );

      await service.sendPasswordResetEmail('player@example.com', 'super-secret-reset-token');

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const message = errorSpy.mock.calls[0][0] as string;
      expect(message).toContain('WEB_APP_BASE_URL');
      expect(message).not.toContain('player@example.com');
      expect(message).not.toContain('super-secret-reset-token');
      errorSpy.mockRestore();
    });

    it('still sends, with the link, once the URL is usable (plain http on localhost is allowed)', async () => {
      mockSendEmail.mockResolvedValueOnce({ MessageID: 'msg-2' });
      const service = new PasswordResetEmailService(
        buildConfig({
          EMAIL_PROVIDER_API_KEY: 'a-real-key',
          POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
          WEB_APP_BASE_URL: 'http://localhost:5173',
        }),
      );

      await service.sendPasswordResetEmail('player@example.com', 'reset-tok');

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          TextBody: expect.stringContaining('http://localhost:5173/reset-password?token=reset-tok'),
        }),
      );
    });
  });
});
