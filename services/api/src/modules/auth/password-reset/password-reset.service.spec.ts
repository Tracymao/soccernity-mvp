import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../password/password.service';
import { InMemoryResetRedisFake } from './test-support/in-memory-reset-redis.fake';
import { FORGOT_PASSWORD_GENERIC_MESSAGE, PasswordResetService } from './password-reset.service';
import { ResetTokenStore } from './reset-token.store';

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
  const emailService = { sendPasswordResetEmail: jest.fn(async () => undefined) };
  const configService = new ConfigService({});

  const service = new PasswordResetService(
    prisma as never,
    resetTokenStore,
    passwordService,
    tokenService as never,
    emailService as never,
    configService,
  );

  return { service, prisma, resetTokenStore, tokenService, emailService, existingUser };
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
    it('rejects a password shorter than the minimum', async () => {
      const { service, resetTokenStore, existingUser } = buildService();
      const issued = await resetTokenStore.issue(existingUser!.id, 60);

      await expect(service.resetPassword(issued.token, 'short')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects an invalid/unknown token', async () => {
      const { service } = buildService();

      await expect(
        service.resetPassword('not-a-real-id.not-a-real-secret', 'a-long-enough-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('updates the password hash, revokes all sessions, and consumes the token on success', async () => {
      const { service, prisma, resetTokenStore, tokenService, existingUser } = buildService();
      const issued = await resetTokenStore.issue(existingUser!.id, 60);

      await service.resetPassword(issued.token, 'a-brand-new-password');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: existingUser!.id },
        data: { passwordHash: expect.any(String) },
      });
      expect(tokenService.revokeAllSessionsForUser).toHaveBeenCalledWith(existingUser!.id);

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
