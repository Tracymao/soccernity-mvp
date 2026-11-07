import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ADMIN_ROLE_EMAIL_DETAILS } from '../../../admin-staff-roles/admin-staff-roles.constants';
import { RegistrationEmailService } from './registration-email.service';

// backend/b069-transactional-emails (B-069). The five plain account templates, rendered through the real Postmark
// code path with the client mocked (the pattern registration-email.service.spec.ts uses). A separate file so the
// existing spec stays unchanged.
const mockSendEmail = jest.fn();

jest.mock('postmark', () => ({
  ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockSendEmail })),
}));

function buildConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

const LIVE = {
  EMAIL_PROVIDER_API_KEY: 'a-real-key',
  POSTMARK_FROM_EMAIL: 'no-reply@soccernity.com',
  WEB_APP_BASE_URL: 'https://app.soccernity.com',
};

function sent(): { Subject: string; To: string; HtmlBody: string; TextBody: string } {
  return mockSendEmail.mock.calls[0][0];
}

describe('RegistrationEmailService, B-069 account emails', () => {
  beforeEach(() => {
    mockSendEmail.mockResolvedValue({ MessageID: 'm-1' });
  });
  afterEach(() => jest.clearAllMocks());

  describe('password changed (signed in; Figma 1380:2318)', () => {
    it('renders the subject, greeting and support line, with no link and no unsubscribe', async () => {
      await new RegistrationEmailService(buildConfig(LIVE)).sendPasswordChangedEmail('a@b.com', 'Ada');
      const m = sent();
      expect(m.To).toBe('a@b.com');
      expect(m.Subject).toBe('Your Soccernity password was changed');
      for (const body of [m.TextBody, m.HtmlBody]) {
        expect(body).toContain('Hi Ada,');
        expect(body).toContain('support@soccernity.com');
        expect(body).not.toMatch(/unsubscribe/i);
        expect(body).not.toMatch(/https?:\/\//);
      }
    });
  });

  describe('password reset completed (emailed link; Figma 1380:2297)', () => {
    it('renders the forgot-password button link and never claims anything was detected', async () => {
      const ok = await new RegistrationEmailService(buildConfig(LIVE)).sendPasswordResetCompletedEmail('a@b.com', 'Ada');
      expect(ok).toBe(true);
      const m = sent();
      expect(m.Subject).toBe('Your Soccernity password was reset');
      expect(m.HtmlBody).toContain('href="https://app.soccernity.com/forgot-password"');
      expect(m.TextBody).toContain('https://app.soccernity.com/forgot-password');
      for (const body of [m.TextBody, m.HtmlBody]) {
        expect(body).not.toMatch(/unsubscribe/i);
        expect(body).not.toMatch(/noticed|unusual/i);
      }
    });

    it('sends nothing, and logs one error, when WEB_APP_BASE_URL is unusable', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const ok = await new RegistrationEmailService(buildConfig({ ...LIVE, WEB_APP_BASE_URL: 'replace-me' })).sendPasswordResetCompletedEmail('a@b.com', 'Ada');
      expect(ok).toBe(false);
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledTimes(1);
      error.mockRestore();
    });
  });

  describe('welcome (Figma 1380:2274)', () => {
    it('renders a sign-in link and DROPS the frame\'s unsubscribe line', async () => {
      const ok = await new RegistrationEmailService(buildConfig(LIVE)).sendWelcomeEmail('a@b.com', 'Ada');
      expect(ok).toBe(true);
      const m = sent();
      expect(m.Subject).toBe('Welcome to Soccernity');
      expect(m.HtmlBody).toContain('href="https://app.soccernity.com/login"');
      expect(m.TextBody).toContain('https://app.soccernity.com/login');
      for (const body of [m.TextBody, m.HtmlBody]) {
        expect(body).toContain('Hi Ada,');
        expect(body).not.toMatch(/unsubscribe/i);
      }
    });

    it('sends nothing when WEB_APP_BASE_URL is unusable', async () => {
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      const ok = await new RegistrationEmailService(buildConfig({ ...LIVE, WEB_APP_BASE_URL: undefined })).sendWelcomeEmail('a@b.com', 'Ada');
      expect(ok).toBe(false);
      expect(mockSendEmail).not.toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe('staff account created (Figma 1661:2741 and 1661:2724)', () => {
    it.each(Object.keys(ADMIN_ROLE_EMAIL_DETAILS) as (keyof typeof ADMIN_ROLE_EMAIL_DETAILS)[])(
      'names the %s role, its one-line description and the admin sign-in link, and carries NO password',
      async (role) => {
        const details = ADMIN_ROLE_EMAIL_DETAILS[role];
        await new RegistrationEmailService(buildConfig(LIVE)).sendStaffAccountCreatedEmail(
          'new@soccernity.com',
          'Sam',
          details.label,
          details.sentence,
          'https://admin.soccernity.com/login',
          false,
        );
        const m = sent();
        expect(m.To).toBe('new@soccernity.com');
        expect(m.Subject).toBe(`Your Soccernity ${details.label} account`);
        for (const body of [m.TextBody, m.HtmlBody]) {
          expect(body).toContain('Hi Sam,');
          expect(body).toContain(details.sentence);
          expect(body).toContain('https://admin.soccernity.com/login');
          expect(body).toContain('does not contain a password');
          expect(body).not.toMatch(/temporary password:/i);
          expect(body).not.toMatch(/forgot password/i);
          expect(body).not.toMatch(/unsubscribe/i);
        }
      },
    );

    it('mentions two-factor set-up only when it is enforced', async () => {
      const svc = new RegistrationEmailService(buildConfig(LIVE));
      await svc.sendStaffAccountCreatedEmail('a@b.com', 'Sam', 'editor', 'x.', null, true);
      expect(sent().TextBody).toContain('two-factor authentication with an authenticator app');
      mockSendEmail.mockClear();
      await svc.sendStaffAccountCreatedEmail('a@b.com', 'Sam', 'editor', 'x.', null, false);
      expect(sent().TextBody).not.toMatch(/two-factor/i);
    });

    it('is still sent, without a link, when the admin base URL is unusable', async () => {
      await new RegistrationEmailService(buildConfig(LIVE)).sendStaffAccountCreatedEmail('a@b.com', 'Sam', 'editor', 'x.', null, false);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(sent().TextBody).not.toMatch(/https?:\/\//);
    });

    it('has a description for every shipped role', () => {
      expect(Object.keys(ADMIN_ROLE_EMAIL_DETAILS).sort()).toEqual(['editor', 'moderator', 'superadmin']);
    });
  });

  describe('account deletion requested (Figma 5439:7074)', () => {
    it('says what the code does, and repeats neither the frame\'s cancel promise nor its erasure claim', async () => {
      await new RegistrationEmailService(buildConfig(LIVE)).sendAccountDeletionRequestedEmail('a@b.com', 'Ada', 30);
      const m = sent();
      expect(m.Subject).toBe('Your Soccernity account deletion request');
      for (const body of [m.TextBody, m.HtmlBody]) {
        expect(body).toContain('Hi Ada,');
        expect(body).toContain('After 30 days');
        expect(body).toContain('[deleted user]');
        expect(body).toContain('can no longer sign in');
        expect(body).not.toMatch(/sign back in/i);
        expect(body).not.toMatch(/cancel/i);
        expect(body).not.toMatch(/permanently/i);
        expect(body).not.toMatch(/unsubscribe/i);
        expect(body).not.toMatch(/https?:\/\//);
      }
    });
  });

  it('escapes a name in the HTML body', async () => {
    await new RegistrationEmailService(buildConfig(LIVE)).sendPasswordChangedEmail('a@b.com', '<b>Ada</b>');
    expect(sent().HtmlBody).toContain('Hi &lt;b&gt;Ada&lt;/b&gt;,');
  });

  it('does not throw when the provider fails (fire-and-log)', async () => {
    mockSendEmail.mockRejectedValueOnce(new Error('postmark down'));
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    await expect(new RegistrationEmailService(buildConfig(LIVE)).sendPasswordChangedEmail('a@b.com', 'Ada')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
