import { ConfigService } from '@nestjs/config';
import { AdminStaffRolesService } from '../admin-staff-roles/admin-staff-roles.service';
import { AuthService } from '../auth/auth.service';
import { GuardianConsentService } from '../auth/guardian-consent/guardian-consent.service';
import { PasswordResetService } from '../auth/password-reset/password-reset.service';
import { RegistrationService } from '../auth/registration/registration.service';
import { AccountEmailService, firstNameOf } from './account-email.service';

// backend/b069-transactional-emails (B-069). Two things per email: (1) the SEND POINT calls the right method exactly
// once, after the action it reports, and a failing email never fails the action; (2) AccountEmailService decides the
// WELCOME timing (adult and minor) and sends nothing for an anonymised account.

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('AccountEmailService', () => {
  function build(user: Record<string, unknown> | null) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
    const email = {
      sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetCompletedEmail: jest.fn().mockResolvedValue(true),
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
      sendAccountDeletionRequestedEmail: jest.fn().mockResolvedValue(undefined),
    };
    return { prisma, email, svc: new AccountEmailService(prisma as never, email as never) };
  }

  const ADULT = { email: 'ada@x.com', displayName: 'Ada Lovelace', accountStatus: 'active', verificationStatus: 'verified', isMinor: false, guardian: null };
  const MINOR = { ...ADULT, email: 'kid@x.com', displayName: 'Kid Player', isMinor: true };

  it('greets by the first word of the display name, or "there"', () => {
    expect(firstNameOf('Ada Lovelace')).toBe('Ada');
    expect(firstNameOf('  Ada  ')).toBe('Ada');
    expect(firstNameOf('')).toBe('there');
    expect(firstNameOf(null)).toBe('there');
  });

  describe('welcome timing', () => {
    it('an ADULT with a verified email gets it (the email-verification event)', async () => {
      const { svc, email } = build(ADULT);
      await svc.welcomeIfReady('u1');
      expect(email.sendWelcomeEmail).toHaveBeenCalledTimes(1);
      expect(email.sendWelcomeEmail).toHaveBeenCalledWith('ada@x.com', 'Ada');
    });

    it('an adult whose email is NOT verified yet gets nothing', async () => {
      const { svc, email } = build({ ...ADULT, verificationStatus: 'unverified' });
      await svc.welcomeIfReady('u1');
      expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('a MINOR with a verified email but guardian consent still pending gets nothing', async () => {
      const { svc, email } = build({ ...MINOR, guardian: { consentStatus: 'pending' } });
      await svc.welcomeIfReady('m1');
      expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('a minor whose guardian declined, or who has no guardian row, gets nothing', async () => {
      for (const guardian of [{ consentStatus: 'declined' }, null]) {
        const { svc, email } = build({ ...MINOR, guardian });
        await svc.welcomeIfReady('m1');
        expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
      }
    });

    it('a MINOR gets it once BOTH the email is verified and the guardian has confirmed', async () => {
      const { svc, email } = build({ ...MINOR, guardian: { consentStatus: 'confirmed' } });
      await svc.welcomeIfReady('m1');
      expect(email.sendWelcomeEmail).toHaveBeenCalledTimes(1);
      expect(email.sendWelcomeEmail).toHaveBeenCalledWith('kid@x.com', 'Kid');
    });

    it('a minor whose guardian confirmed but whose email is unverified gets nothing (verification will send it)', async () => {
      const { svc, email } = build({ ...MINOR, verificationStatus: 'unverified', guardian: { consentStatus: 'confirmed' } });
      await svc.welcomeIfReady('m1');
      expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('sends nothing for an account that is not active', async () => {
      for (const accountStatus of ['deactivated', 'pending_deletion', 'suspended', 'deleted']) {
        const { svc, email } = build({ ...ADULT, accountStatus });
        await svc.welcomeIfReady('u1');
        expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
      }
    });

    it('sends nothing for an unknown user', async () => {
      const { svc, email } = build(null);
      await svc.welcomeIfReady('nope');
      expect(email.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });

  describe('the other three', () => {
    it('each looks the person up and calls its own template once', async () => {
      const { svc, email } = build({ email: 'ada@x.com', displayName: 'Ada Lovelace', accountStatus: 'active' });
      await svc.passwordChanged('u1');
      await svc.passwordResetCompleted('u1');
      await svc.deletionRequested('u1');
      expect(email.sendPasswordChangedEmail).toHaveBeenCalledWith('ada@x.com', 'Ada');
      expect(email.sendPasswordResetCompletedEmail).toHaveBeenCalledWith('ada@x.com', 'Ada');
      expect(email.sendAccountDeletionRequestedEmail).toHaveBeenCalledWith('ada@x.com', 'Ada', 30);
      expect(email.sendPasswordChangedEmail).toHaveBeenCalledTimes(1);
      expect(email.sendPasswordResetCompletedEmail).toHaveBeenCalledTimes(1);
      expect(email.sendAccountDeletionRequestedEmail).toHaveBeenCalledTimes(1);
    });

    it('an anonymised account (made-up address) is never emailed', async () => {
      const { svc, email } = build({ email: 'deleted-x@deleted.soccernity.internal', displayName: '[deleted user]', accountStatus: 'deleted' });
      await svc.passwordChanged('u1');
      await svc.passwordResetCompleted('u1');
      await svc.deletionRequested('u1');
      expect(email.sendPasswordChangedEmail).not.toHaveBeenCalled();
      expect(email.sendPasswordResetCompletedEmail).not.toHaveBeenCalled();
      expect(email.sendAccountDeletionRequestedEmail).not.toHaveBeenCalled();
    });
  });

  it('never throws: a lookup failure or a send failure is only logged', async () => {
    const { svc, prisma, email } = build(ADULT);
    prisma.user.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(svc.passwordChanged('u1')).resolves.toBeUndefined();
    email.sendPasswordChangedEmail.mockRejectedValueOnce(new Error('postmark down'));
    await expect(svc.passwordChanged('u1')).resolves.toBeUndefined();
    expect(() => svc.passwordChangedInBackground('u1')).not.toThrow();
    await flush();
  });
});

describe('B-069 send points', () => {
  // A stand-in for AccountEmailService that records the call. The real class is covered above.
  function emails() {
    return {
      passwordChangedInBackground: jest.fn(),
      passwordResetCompletedInBackground: jest.fn(),
      deletionRequestedInBackground: jest.fn(),
      welcomeIfReadyInBackground: jest.fn(),
    };
  }

  describe('AuthService', () => {
    function buildAuth(user: Record<string, unknown> | null) {
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn().mockResolvedValue({}) },
      };
      const passwordService = { verify: jest.fn().mockResolvedValue(true), hash: jest.fn().mockResolvedValue('h') };
      const tokenService = { revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined) };
      const accountEmails = emails();
      const svc = new AuthService(
        prisma as never,
        passwordService as never,
        tokenService as never,
        {} as never,
        {} as never,
        {} as never,
        accountEmails as never,
      );
      return { svc, prisma, passwordService, tokenService, accountEmails };
    }
    const ACTIVE = { id: 'u1', passwordHash: 'x', accountStatus: 'active' };

    it('changePassword sends "password changed" once, after the sessions are revoked', async () => {
      const { svc, accountEmails, tokenService } = buildAuth(ACTIVE);
      await svc.changePassword('u1', 'old', 'newpassword');
      expect(accountEmails.passwordChangedInBackground).toHaveBeenCalledTimes(1);
      expect(accountEmails.passwordChangedInBackground).toHaveBeenCalledWith('u1');
      expect(tokenService.revokeAllSessionsForUser.mock.invocationCallOrder[0]).toBeLessThan(
        accountEmails.passwordChangedInBackground.mock.invocationCallOrder[0],
      );
    });

    it('changePassword with a wrong current password sends nothing', async () => {
      const { svc, accountEmails, passwordService } = buildAuth(ACTIVE);
      passwordService.verify.mockResolvedValueOnce(false);
      await expect(svc.changePassword('u1', 'bad', 'newpassword')).rejects.toThrow();
      expect(accountEmails.passwordChangedInBackground).not.toHaveBeenCalled();
    });

    it('deleteAccount sends "deletion requested" once', async () => {
      const { svc, accountEmails } = buildAuth(ACTIVE);
      await svc.deleteAccount('u1', 'pw');
      expect(accountEmails.deletionRequestedInBackground).toHaveBeenCalledTimes(1);
      expect(accountEmails.deletionRequestedInBackground).toHaveBeenCalledWith('u1');
    });

    it('deleteAccount with a wrong password, or for a suspended account, sends nothing', async () => {
      const wrong = buildAuth(ACTIVE);
      wrong.passwordService.verify.mockResolvedValueOnce(false);
      await expect(wrong.svc.deleteAccount('u1', 'bad')).rejects.toThrow();
      expect(wrong.accountEmails.deletionRequestedInBackground).not.toHaveBeenCalled();

      const suspended = buildAuth({ ...ACTIVE, accountStatus: 'suspended' });
      await expect(suspended.svc.deleteAccount('u1', 'pw')).rejects.toThrow();
      expect(suspended.accountEmails.deletionRequestedInBackground).not.toHaveBeenCalled();
    });

    it('deleteInactiveAccount sends it once; a non-deactivated account sends nothing', async () => {
      const ok = buildAuth({ ...ACTIVE, accountStatus: 'deactivated' });
      await ok.svc.deleteInactiveAccount('A@B.com', 'pw');
      expect(ok.accountEmails.deletionRequestedInBackground).toHaveBeenCalledTimes(1);

      const active = buildAuth(ACTIVE);
      await expect(active.svc.deleteInactiveAccount('a@b.com', 'pw')).rejects.toThrow();
      expect(active.accountEmails.deletionRequestedInBackground).not.toHaveBeenCalled();
    });

    it('works without the emails service (sends nothing, fails nothing)', async () => {
      const prisma = { user: { findUnique: jest.fn().mockResolvedValue(ACTIVE), update: jest.fn().mockResolvedValue({}) } };
      const svc = new AuthService(
        prisma as never,
        { verify: jest.fn().mockResolvedValue(true), hash: jest.fn().mockResolvedValue('h') } as never,
        { revokeAllSessionsForUser: jest.fn() } as never,
        {} as never,
        {} as never,
        {} as never,
      );
      await expect(svc.changePassword('u1', 'old', 'newpassword')).resolves.toBeUndefined();
    });
  });

  describe('PasswordResetService.resetPassword', () => {
    function buildReset() {
      const accountEmails = emails();
      const prisma = { user: { update: jest.fn().mockResolvedValue({ email: 'a@b.com' }) } };
      const store = { verifyAndConsume: jest.fn().mockResolvedValue({ userId: 'u1' }) };
      const svc = new PasswordResetService(
        prisma as never,
        store as never,
        { hash: jest.fn().mockResolvedValue('h') } as never,
        { revokeAllSessionsForUser: jest.fn().mockResolvedValue(undefined) } as never,
        {} as never,
        { get: () => undefined } as unknown as ConfigService,
        { clearAccountCeiling: jest.fn().mockResolvedValue(undefined) } as never,
        { notifyInBackground: jest.fn() } as never,
        accountEmails as never,
      );
      return { svc, store, accountEmails };
    }

    it('sends the "password reset" email once, after the reset', async () => {
      const { svc, accountEmails } = buildReset();
      await svc.resetPassword('tok', 'newpassword');
      expect(accountEmails.passwordResetCompletedInBackground).toHaveBeenCalledTimes(1);
      expect(accountEmails.passwordResetCompletedInBackground).toHaveBeenCalledWith('u1');
    });

    it('sends nothing for an invalid token', async () => {
      const { svc, store, accountEmails } = buildReset();
      store.verifyAndConsume.mockRejectedValueOnce(new Error('boom'));
      await expect(svc.resetPassword('bad', 'newpassword')).rejects.toThrow();
      expect(accountEmails.passwordResetCompletedInBackground).not.toHaveBeenCalled();
    });
  });

  describe('RegistrationService.verifyEmail', () => {
    function buildRegistration(userId: string | null) {
      const accountEmails = emails();
      const prisma = { user: { update: jest.fn().mockResolvedValue({}) } };
      const svc = new RegistrationService(
        prisma as never,
        {} as never,
        {} as never,
        { verifyAndConsume: jest.fn().mockResolvedValue(userId) } as never,
        {} as never,
        {} as never,
        {} as never,
        { getConsentStatusForUser: jest.fn().mockResolvedValue(null) } as never,
        {} as never,
        {} as never,
        accountEmails as never,
      );
      return { svc, accountEmails };
    }

    it('asks for the welcome once, after the email is marked verified', async () => {
      const { svc, accountEmails } = buildRegistration('u1');
      await svc.verifyEmail('tok');
      expect(accountEmails.welcomeIfReadyInBackground).toHaveBeenCalledTimes(1);
      expect(accountEmails.welcomeIfReadyInBackground).toHaveBeenCalledWith('u1');
    });

    it('an invalid token sends nothing', async () => {
      const { svc, accountEmails } = buildRegistration(null);
      await expect(svc.verifyEmail('bad')).rejects.toThrow();
      expect(accountEmails.welcomeIfReadyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('GuardianConsentService.confirmConsent', () => {
    function buildConsent(overrides: Record<string, unknown> = {}, count = 1) {
      const accountEmails = emails();
      const guardian = {
        minorUserId: 'm1',
        consentStatus: 'pending',
        consentTokenExpiresAt: new Date(Date.now() + 3_600_000),
        cardVerificationRequired: false,
        cardVerifiedAt: null,
        incorrectDetailsReportedAt: null,
        ...overrides,
      };
      const prisma = {
        guardian: { findUnique: jest.fn().mockResolvedValue(guardian), updateMany: jest.fn().mockResolvedValue({ count }) },
        user: { findUnique: jest.fn().mockResolvedValue({ email: 'kid@x.com', displayName: 'Kid', accountStatus: 'active' }) },
      };
      const email = { sendGuardianApprovedMinorEmail: jest.fn().mockResolvedValue(undefined) };
      const svc = new GuardianConsentService(
        prisma as never,
        { get: () => undefined } as unknown as ConfigService,
        email as never,
        {} as never,
        accountEmails as never,
      );
      return { svc, accountEmails };
    }

    it('asks for the welcome once, only on the real pending to confirmed transition', async () => {
      const { svc, accountEmails } = buildConsent();
      await svc.confirmConsent('tok');
      await flush();
      expect(accountEmails.welcomeIfReadyInBackground).toHaveBeenCalledTimes(1);
      expect(accountEmails.welcomeIfReadyInBackground).toHaveBeenCalledWith('m1');
    });

    it('an idempotent re-click (already confirmed) and a lost race send nothing', async () => {
      const again = buildConsent({ consentStatus: 'confirmed' });
      await again.svc.confirmConsent('tok');
      expect(again.accountEmails.welcomeIfReadyInBackground).not.toHaveBeenCalled();

      const lost = buildConsent({}, 0);
      await lost.svc.confirmConsent('tok');
      expect(lost.accountEmails.welcomeIfReadyInBackground).not.toHaveBeenCalled();
    });
  });

  describe('AdminStaffRolesService.createStaff', () => {
    function buildStaff(emailService: unknown, baseUrl: string | undefined = 'https://admin.soccernity.com') {
      const created = { id: 'a1', email: 'new@soccernity.com', fullName: 'Sam Newadmin', role: 'moderator', accountStatus: 'active', createdAt: new Date(), childSafetyVetted: false, vettedAt: null, vettedByAdminId: null, totpEnabledAt: null };
      const prisma = {
        adminUser: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(created) },
      };
      const twoFactor = { isAdminEnforced: jest.fn().mockReturnValue(true) };
      const svc = new AdminStaffRolesService(
        prisma as never,
        { record: jest.fn().mockResolvedValue(undefined) } as never,
        { hash: jest.fn().mockResolvedValue('h') } as never,
        {} as never,
        twoFactor as never,
        emailService as never,
        { get: (k: string) => (k === 'ADMIN_APP_BASE_URL' ? baseUrl : undefined) } as unknown as ConfigService,
      );
      return { svc, twoFactor };
    }
    const DTO = { email: 'New@Soccernity.com', fullName: 'Sam Newadmin', role: 'moderator' } as never;

    it('sends the account-created email once, with the role text, the admin sign-in link and the 2FA flag', async () => {
      const send = jest.fn().mockResolvedValue(undefined);
      const { svc } = buildStaff({ sendStaffAccountCreatedEmail: send });
      const result = await svc.createStaff('boss', DTO);
      expect(send).toHaveBeenCalledTimes(1);
      const [to, first, label, sentence, link, twoFactor] = send.mock.calls[0];
      expect(to).toBe('new@soccernity.com');
      expect(first).toBe('Sam');
      expect(label).toBe('moderator');
      expect(sentence).toContain('review reports and appeals');
      expect(link).toBe('https://admin.soccernity.com/login');
      expect(twoFactor).toBe(true);
      // The generated password is returned to the caller and is NOT passed to the email.
      expect(typeof result.temporaryPassword).toBe('string');
      expect(JSON.stringify(send.mock.calls)).not.toContain(result.temporaryPassword);
    });

    it('a failing send does not fail the creation', async () => {
      const send = jest.fn().mockRejectedValue(new Error('postmark down'));
      const { svc } = buildStaff({ sendStaffAccountCreatedEmail: send });
      await expect(svc.createStaff('boss', DTO)).resolves.toBeDefined();
      await flush();
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('a synchronous throw in the send does not fail the creation', async () => {
      const send = jest.fn().mockImplementation(() => {
        throw new Error('sync');
      });
      const { svc } = buildStaff({ sendStaffAccountCreatedEmail: send });
      await expect(svc.createStaff('boss', DTO)).resolves.toBeDefined();
    });

    it('an unusable ADMIN_APP_BASE_URL still sends the email, without a link', async () => {
      const send = jest.fn().mockResolvedValue(undefined);
      const { svc } = buildStaff({ sendStaffAccountCreatedEmail: send }, 'replace-me');
      await svc.createStaff('boss', DTO);
      expect(send.mock.calls[0][4]).toBeNull();
    });

    it('a duplicate email (409) sends nothing', async () => {
      const send = jest.fn();
      const { svc } = buildStaff({ sendStaffAccountCreatedEmail: send });
      (svc as unknown as { prisma: { adminUser: { findUnique: jest.Mock } } }).prisma.adminUser.findUnique.mockResolvedValueOnce({ id: 'x' });
      await expect(svc.createStaff('boss', DTO)).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it('works without the email service', async () => {
      const { svc } = buildStaff(undefined);
      await expect(svc.createStaff('boss', DTO)).resolves.toBeDefined();
    });
  });
});
