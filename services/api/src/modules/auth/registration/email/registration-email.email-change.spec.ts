import { ConfigService } from '@nestjs/config';
import { RegistrationEmailService } from './registration-email.service';

// Decision Log #476. The "cannot be used" email to an address that already belongs to an account, and the
// configuration check the email-change route uses for its 503. Same pattern as registration-email.account-emails.spec.ts.
const mockSendEmail = jest.fn();

jest.mock('postmark', () => ({
  ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
}));

const config = (values: Record<string, string | undefined>): ConfigService => ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const LIVE = {
  EMAIL_PROVIDER_API_KEY: 'a-real-key',
  POSTMARK_FROM_EMAIL: 'no-reply@soccernity.com',
  WEB_APP_BASE_URL: 'https://app.soccernity.com',
};

describe('RegistrationEmailService: email change, address already in use (Decision Log #476)', () => {
  beforeEach(() => mockSendEmail.mockResolvedValue({ MessageID: 'm-1' }));
  afterEach(() => jest.clearAllMocks());

  it('says the address cannot be used because it belongs to an account, with no link and nothing about who asked', async () => {
    await new RegistrationEmailService(config(LIVE)).sendEmailChangeUnavailableEmail('owner@example.com');
    const m = mockSendEmail.mock.calls[0][0];
    expect(m.To).toBe('owner@example.com');
    expect(m.Subject).toBe('A request to use your email address on Soccernity');
    for (const body of [m.TextBody, m.HtmlBody]) {
      expect(body).toContain('already belongs to a Soccernity account');
      expect(body).toContain('you do not need to do anything');
      // No link of any kind, no token, no mention of a requester or of a new address.
      expect(body).not.toMatch(/https?:\/\//);
      expect(body).not.toMatch(/href/i);
      expect(body).not.toMatch(/token/i);
    }
  });

  it('is sent without needing WEB_APP_BASE_URL (it has no link to build)', async () => {
    await new RegistrationEmailService(config({ ...LIVE, WEB_APP_BASE_URL: undefined })).sendEmailChangeUnavailableEmail('owner@example.com');
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('a send failure is swallowed like every other email here', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('postmark down'));
    await expect(new RegistrationEmailService(config(LIVE)).sendEmailChangeUnavailableEmail('owner@example.com')).resolves.toBeUndefined();
  });

  it('is not logged with its recipient when the provider is not configured (it names someone else\'s mailbox)', async () => {
    const service = new RegistrationEmailService(config({ WEB_APP_BASE_URL: 'https://app.soccernity.com' }));
    const log = jest.spyOn((service as unknown as { logger: { log: (m: string) => void } }).logger, 'log').mockImplementation(() => undefined);
    await service.sendEmailChangeUnavailableEmail('owner@example.com');
    expect(log.mock.calls.map((c) => String(c[0])).join(' ')).not.toContain('owner@example.com');
  });
});

describe('RegistrationEmailService.isWebAppBaseUrlUsable', () => {
  it.each([
    ['https://app.soccernity.com', true],
    ['https://app.soccernity.com/app', true],
    ['http://localhost:5173', true],
    ['http://app.soccernity.com', false],
    ['https://app.soccernity.example', false],
    ['replace-me', false],
    ['not a url', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (value, expected) => {
    expect(new RegistrationEmailService(config({ WEB_APP_BASE_URL: value as string | undefined })).isWebAppBaseUrlUsable()).toBe(expected);
  });

  it('is exactly the rule the link builders use: usable means a link can be built', async () => {
    mockSendEmail.mockResolvedValue({ MessageID: 'm-1' });
    for (const value of ['https://app.soccernity.com', 'http://app.soccernity.com', 'replace-me', undefined]) {
      const service = new RegistrationEmailService(config({ ...LIVE, WEB_APP_BASE_URL: value }));
      const built = await service.sendEmailChangeVerifyEmail('a@b.com', 'secret');
      expect(service.isWebAppBaseUrlUsable()).toBe(built);
    }
  });
});
