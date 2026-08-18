import { BadRequestException, ConflictException } from '@nestjs/common';
import { RegistrationService } from './registration.service';

describe('RegistrationService', () => {
  const asOfAdult = { dateOfBirth: '1990-01-01' };
  const asOfMinor = { dateOfBirth: '2015-01-01' };

  function buildService() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'user-1',
            role: 'fan',
            verificationStatus: 'unverified',
            createdAt: new Date('2026-08-16T00:00:00.000Z'),
            ...data,
          }),
        ),
        update: jest.fn().mockResolvedValue({}),
      },
      guardian: {
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'guardian-1',
            consentStatus: 'pending',
            consentTimestamp: null,
            ...data,
          }),
        ),
      },
    };
    const passwordService = { hash: jest.fn().mockResolvedValue('hashed-password') };
    const tokenService = {
      issueTokenPair: jest.fn().mockResolvedValue({
        accessToken: { token: 'access-token', expiresIn: 900 },
        refreshToken: { token: 'refresh-id.refresh-secret', expiresAt: new Date() },
      }),
    };
    const emailVerificationTokenStore = {
      issue: jest.fn().mockResolvedValue('verify-token'),
      verifyAndConsume: jest.fn(),
    };
    const emailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined),
    };

    const service = new RegistrationService(
      prisma as any,
      passwordService as any,
      tokenService as any,
      emailVerificationTokenStore as any,
      emailService as any,
    );

    return { service, prisma, passwordService, tokenService, emailVerificationTokenStore, emailService };
  }

  describe('register', () => {
    it('creates an adult user with isMinor=false and no Guardian row', async () => {
      const { service, prisma, emailService } = buildService();

      const result = await service.register({
        email: 'adult@example.com',
        password: 'password123',
        displayName: 'Adult User',
        ...asOfAdult,
      } as any);

      expect(result.user.isMinor).toBe(false);
      expect(result.guardian).toBeNull();
      expect(prisma.guardian.create).not.toHaveBeenCalled();
      expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith('adult@example.com', 'verify-token');
    });

    it('rejects a declared-minor registration with no guardian details', async () => {
      const { service } = buildService();

      await expect(
        service.register({
          email: 'minor@example.com',
          password: 'password123',
          displayName: 'Minor User',
          ...asOfMinor,
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a minor user AND a linked Guardian row with a real consent token when guardian details are provided', async () => {
      const { service, prisma, emailService } = buildService();

      const result = await service.register({
        email: 'minor@example.com',
        password: 'password123',
        displayName: 'Minor User',
        ...asOfMinor,
        guardian: { name: 'Parent Name', email: 'parent@example.com', relationship: 'Parent' },
      } as any);

      expect(result.user.isMinor).toBe(true);
      expect(result.guardian).not.toBeNull();
      expect(result.guardian?.relationship).toBe('Parent');
      expect(prisma.guardian.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            minorUserId: 'user-1',
            name: 'Parent Name',
            email: 'parent@example.com',
            relationship: 'Parent',
            consentToken: expect.any(String),
          }),
        }),
      );
      // Real, unique-looking consent token — not a placeholder/empty string.
      const createCall = prisma.guardian.create.mock.calls[0][0];
      expect(createCall.data.consentToken).toMatch(/^[0-9a-f-]{36}$/);
      expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
        'parent@example.com',
        createCall.data.consentToken,
        'Minor User',
      );
    });

    it('rejects registration when the email is already taken', async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user' });

      await expect(
        service.register({
          email: 'taken@example.com',
          password: 'password123',
          displayName: 'Someone',
          ...asOfAdult,
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects an implausible date of birth', async () => {
      const { service } = buildService();

      await expect(
        service.register({
          email: 'future@example.com',
          password: 'password123',
          displayName: 'Someone',
          dateOfBirth: '2999-01-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('never blocks registration on email delivery failing', async () => {
      const { service, emailService } = buildService();
      emailService.sendVerificationEmail.mockRejectedValueOnce(new Error('provider down'));

      await expect(
        service.register({
          email: 'adult2@example.com',
          password: 'password123',
          displayName: 'Adult User',
          ...asOfAdult,
        } as any),
      ).resolves.toBeDefined();
    });

    it('issues an access/refresh token pair carrying only { sub, role } worth of identity', async () => {
      const { service, tokenService } = buildService();

      const result = await service.register({
        email: 'adult3@example.com',
        password: 'password123',
        displayName: 'Adult User',
        ...asOfAdult,
      } as any);

      expect(tokenService.issueTokenPair).toHaveBeenCalledWith('user-1', 'fan');
      expect(result.tokens.accessToken.token).toBe('access-token');
    });
  });

  describe('verifyEmail', () => {
    it('marks the user verified when the token is valid', async () => {
      const { service, prisma, emailVerificationTokenStore } = buildService();
      emailVerificationTokenStore.verifyAndConsume.mockResolvedValueOnce('user-1');

      const result = await service.verifyEmail('a-real-token');

      expect(result.userId).toBe('user-1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { verificationStatus: 'verified' },
      });
    });

    it('rejects an invalid or already-consumed token', async () => {
      const { service, emailVerificationTokenStore } = buildService();
      emailVerificationTokenStore.verifyAndConsume.mockResolvedValueOnce(null);

      await expect(service.verifyEmail('bad-token')).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
