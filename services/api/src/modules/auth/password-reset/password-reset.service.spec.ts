import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../password/password.service';
import { InMemoryResetRedisFake } from './test-support/in-memory-reset-redis.fake';
import { FORGOT_PASSWORD_GENERIC_MESSAGE, PasswordResetService } from './password-reset.service';
import { ResetTokenStore } from './reset-token.store';
import { PasswordResetEmailService } from './email/password-reset-email.service';

const mockPostmarkSend = jest.fn();
jest.mock('postmark', () => ({
  ServerClient: jest.fn().mockImplementation(() => ({ sendEmail: mockPostmarkSend })),
}));

// Fakes rather than @nestjs/testing's TestingModule — matches B1's own
// spec style (see token/token.service.spec.ts) of constructing services
// directly with hand-built collaborators.
function buildFakeUser(overrides: Partial<{ id: string; email: string; passwordHash: string }> = {}) {
  return { id: 'user-1', email: 'existing@example.com', passwordHash: 'old-hash', ...overrides };
}

function buildService(options: { existingUser?: ReturnType<typeof buildFakeUser> | null } = {}) {
  const existingUser = options.existingUser === undefined ? buildFakeUser() : options.existingUser;

  const usersById = new Map<string, ReturnType<typeof buildFakeUser>>();
  if (existingUser) usersById.set(existingUser.id, existingUser);

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) => {
        if (existingUser && where.email === existingUser.email) return existingUser;
        return null;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { passwordHash: string } }) => {
        const user = usersById.get(where.id);
        if (!user) throw new Error('user not found');
        user.passwordHash = data.passwordHash;
        return user;
      }),
    },
  };

  const resetTokenStore = new ResetTokenStore(new InMemoryResetRedisFake());
  const passwordService = new PasswordService();
  const tokenService = { revokeAllSessionsForUser: jest.fn(async () => undefined) };
  const authLimits = { clearAccountCeiling: jest.fn(async () => undefined) };
  const emailService = { sendPasswordResetEmail: jest.fn(async () => undefined) };
  const guardianNotices = { notifyInBackground: jest.fn() };
  const configService = new ConfigService({});

  const service = new PasswordResetService(
    prisma as never,
    resetTokenStore,
    passwordService,
    tokenService as never,
    emailService as never,
    configService,
    authLimits as never,
    guardianNotices as never,
  );

  return { service, prisma, resetTokenStore, tokenService, emailService, authLimits, guardianNotices, existingUser };
}

describe('PasswordResetService', () => {
  describe('forgotPassword', () => {
    it('issues a token and sends an email for an existing account', async () => {
      const { service, emailService, existingUser } = buildService();

      await service.forgotPassword(existingUser!.email);

      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        existingUser!.email,
        expect.stringMatching(/^[0-9a-f-]{36}\./),
      );
    });

    // B-115 (Decision Log #468): with the REAL email service and an unusable
    // WEB_APP_BASE_URL no mail is sent, and forgotPassword behaves exactly as it
    // does when a mail is sent -- same resolved value, no throw -- so the HTTP
    // answer cannot reveal whether a mail went out or whether an account exists.
    describe('with the real email service (B-115)', () => {
      function withRealEmailService(webBaseUrl: string | undefined) {
        const built = buildService();
        const realEmail = new PasswordResetEmailService(
          new ConfigService({
            EMAIL_PROVIDER_API_KEY: 'a-real-key',
            POSTMARK_FROM_EMAIL: 'no-reply@soccernity.example',
            ...(webBaseUrl === undefined ? {} : { WEB_APP_BASE_URL: webBaseUrl }),
          }),
        );
        const service = new PasswordResetService(
          built.prisma as never,
          built.resetTokenStore,
          new PasswordService(),
          built.tokenService as never,
          realEmail,
          new ConfigService({}),
          built.authLimits as never,
          built.guardianNotices as never,
        );
        return { service, existingUser: built.existingUser! };
      }

      beforeEach(() => mockPostmarkSend.mockReset());

      it.each([['unset', undefined], ['empty', ''], ['malformed', 'not a url']])(
        'sends nothing and resolves normally when WEB_APP_BASE_URL is %s',
        async (_label, value) => {
          const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
          const { service, existingUser } = withRealEmailService(value);

          await expect(service.forgotPassword(existingUser.email)).resolves.toBeUndefined();
          await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();

          expect(mockPostmarkSend).not.toHaveBeenCalled();
          // One error for the existing account; none for the unknown address.
          const messages = errorSpy.mock.calls.map((c) => String(c[0]));
          expect(messages.filter((m) => m.includes('WEB_APP_BASE_URL'))).toHaveLength(1);
          expect(messages.join(' | ')).not.toContain(existingUser.email);
          errorSpy.mockRestore();
        },
      );

      it('sends the mail and resolves identically when WEB_APP_BASE_URL is usable', async () => {
        mockPostmarkSend.mockResolvedValue({ MessageID: 'm-1' });
        const { service, existingUser } = withRealEmailService('https://app.soccernity.com');

        await expect(service.forgotPassword(existingUser.email)).resolves.toBeUndefined();

        expect(mockPostmarkSend).toHaveBeenCalledTimes(1);
      });
    });

    it('does not send an email and does not throw for a non-existent account', async () => {
      const { service, emailService } = buildService();

      await expect(service.forgotPassword('nobody@example.com')).resolves.toBeUndefined();

      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('normalizes email case/whitespace before lookup', async () => {
      const { service, prisma, existingUser } = buildService();

      await service.forgotPassword(`  ${existingUser!.email.toUpperCase()}  `);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: existingUser!.email },
      });
    });
  });

  describe('resetPassword', () => {
    // Password-length enforcement (8-char minimum) moved to
    // ResetPasswordDto's @MinLength(8), applied by main.ts's global
    // ValidationPipe before this service is ever called — see
    // password-reset.controller.spec.ts's HTTP-layer coverage. The
    // service itself no longer re-checks length.

    it('rejects an invalid/unknown token', async () => {
      const { service, authLimits } = buildService();

      await expect(
        service.resetPassword('not-a-real-id.not-a-real-secret', 'a-long-enough-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // A failed reset must not clear anyone's ceiling.
      expect(authLimits.clearAccountCeiling).not.toHaveBeenCalled();
    });

    // B-275 (Decision Log #456): after the reset has committed, a minor's confirmed guardian is told (the notice
    // service decides who is actually emailed). Once per reset, for the token's owner, never on a failed reset.
    it('asks for a guardian "password_reset" notice exactly once, for the account the token belonged to', async () => {
      const { service, resetTokenStore, guardianNotices, existingUser } = buildService();
      const issued = await resetTokenStore.issue(existingUser!.id, 60);

      await service.resetPassword(issued.token, 'a-brand-new-password');

      expect(guardianNotices.notifyInBackground).toHaveBeenCalledTimes(1);
      expect(guardianNotices.notifyInBackground).toHaveBeenCalledWith(existingUser!.id, 'password_reset');
    });

    it('sends no guardian notice for an invalid token, and none when a token is reused', async () => {
      const { service, resetTokenStore, guardianNotices, existingUser } = buildService();
      await expect(service.resetPassword('not-a-real-id.not-a-real-secret', 'a-long-enough-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      const issued = await resetTokenStore.issue(existingUser!.id, 60);
      await service.resetPassword(issued.token, 'a-brand-new-password');
      guardianNotices.notifyInBackground.mockClear();

      await expect(service.resetPassword(issued.token, 'another-password-123')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(guardianNotices.notifyInBackground).not.toHaveBeenCalled();
    });

    it('still succeeds when clearing the ceiling fails', async () => {
      const { service, resetTokenStore, authLimits, existingUser } = buildService();
      authLimits.clearAccountCeiling.mockRejectedValueOnce(new Error('redis down'));
      const issued = await resetTokenStore.issue(existingUser!.id, 60);

      await expect(service.resetPassword(issued.token, 'a-brand-new-password')).resolves.toBeUndefined();
    });

    it('updates the password hash, revokes all sessions, and consumes the token on success', async () => {
      const { service, prisma, resetTokenStore, tokenService, authLimits, existingUser } = buildService();
      const issued = await resetTokenStore.issue(existingUser!.id, 60);

      await service.resetPassword(issued.token, 'a-brand-new-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser!.id },
        data: { passwordHash: expect.any(String) },
        select: { email: true },
      });
      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith(existingUser!.id);
      // The account-wide failed-login ceiling is cleared for this address.
      expect(authLimits.clearAccountCeiling).toHaveBeenCalledWith(existingUser!.email);

      // Single-use: the same token cannot be used again.
      await expect(service.resetPassword(issued.token, 'another-new-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it('forgotPassword\'s success response text never varies by account existence (asserted at the constant used by the controller)', () => {
    // The controller (password-reset.controller.ts) always returns this
    // exact constant as `message`, regardless of which branch of
    // forgotPassword() ran — this test pins that the constant exists and
    // is the single source of truth for that message, so a future edit
    // can't accidentally introduce a second, existence-revealing message.
    expect(FORGOT_PASSWORD_GENERIC_MESSAGE).toMatch(/if an account exists/i);
  });
});
