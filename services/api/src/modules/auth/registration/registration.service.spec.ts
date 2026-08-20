import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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
    // No GUARDIAN_CONSENT_TOKEN_TTL_HOURS override -- exercises
    // consent-token.constants.ts's DEFAULT_CONSENT_TOKEN_TTL_HOURS
    // fallback (DPIA finding R5), same as the real app when the env var
    // is unset.
    const config = { get: () => undefined };
    // sprint-2/auto-join-on-signup: mocked ClubsService, matching the
    // real ClubsService's two methods RegistrationService actually calls.
    const clubsService = {
      assertClubExists: jest.fn().mockResolvedValue(undefined),
      joinClub: jest.fn().mockResolvedValue({ clubId: 'club-1', joined: true, memberCount: 1 }),
    };

    const service = new RegistrationService(
      prisma as any,
      passwordService as any,
      tokenService as any,
      emailVerificationTokenStore as any,
      emailService as any,
      config as any,
      clubsService as any,
    );

    return {
      service,
      prisma,
      passwordService,
      tokenService,
      emailVerificationTokenStore,
      emailService,
      config,
      clubsService,
    };
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
            consentTokenExpiresAt: expect.any(Date),
          }),
        }),
      );
      // Real, unique-looking consent token — not a placeholder/empty string.
      const createCall = prisma.guardian.create.mock.calls[0][0];
      expect(createCall.data.consentToken).toMatch(/^[0-9a-f-]{36}$/);
      // DPIA finding R5: ~72 hours out by default (DEFAULT_CONSENT_TOKEN_TTL_HOURS),
      // not left unset/permanent. Asserted as a range rather than an exact
      // value to tolerate real test-execution time passing.
      const expiresInMs = createCall.data.consentTokenExpiresAt.getTime() - Date.now();
      const seventyTwoHoursMs = 72 * 60 * 60 * 1000;
      expect(expiresInMs).toBeGreaterThan(seventyTwoHoursMs - 60_000);
      expect(expiresInMs).toBeLessThanOrEqual(seventyTwoHoursMs);
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

    // Decision Log #16 (Build Plan Section 9): email normalized to
    // lowercase on write.
    it('normalizes email to lowercase on write', async () => {
      const { service, prisma } = buildService();

      const result = await service.register({
        email: 'Test@Example.com',
        password: 'password123',
        displayName: 'Someone',
        ...asOfAdult,
      } as any);

      expect(result.user.email).toBe('test@example.com');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'test@example.com' }) }),
      );
    });

    it('rejects a case-insensitive duplicate email, not just an exact-match collision', async () => {
      const { service, prisma } = buildService();
      // Simulates "Test@Example.com" already registered (and, per this
      // fix, stored lowercase as "test@example.com"). A second attempt
      // with yet another casing must still collide with it.
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-user', email: 'test@example.com' });

      await expect(
        service.register({
          email: 'TEST@EXAMPLE.COM',
          password: 'password123',
          displayName: 'Someone',
          ...asOfAdult,
        } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      // The lookup itself was normalized, not just the eventual write —
      // this is what makes the collision case-insensitive rather than a
      // lucky exact-string match.
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'test@example.com' } });
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

    // sprint-2/auto-join-on-signup
    it('joins the given club when clubId is provided (auto-join on signup)', async () => {
      const { service, clubsService } = buildService();

      const result = await service.register({
        email: 'joiner@example.com',
        password: 'password123',
        displayName: 'Joiner',
        ...asOfAdult,
        clubId: 'club-1',
      } as any);

      expect(clubsService.assertClubExists).toHaveBeenCalledWith('club-1');
      expect(clubsService.joinClub).toHaveBeenCalledWith('user-1', 'club-1');
      expect(result.user.id).toBe('user-1');
    });

    it('does not call ClubsService at all when clubId is omitted (the "no club for now" path)', async () => {
      const { service, clubsService } = buildService();

      await service.register({
        email: 'no-club@example.com',
        password: 'password123',
        displayName: 'No Club',
        ...asOfAdult,
      } as any);

      expect(clubsService.assertClubExists).not.toHaveBeenCalled();
      expect(clubsService.joinClub).not.toHaveBeenCalled();
    });

    // The critical ordering regression this PR's brief called out: a bad
    // clubId must fail the whole registration BEFORE any User row is
    // committed, not after.
    it('propagates a NotFoundException for a bad clubId and never creates the User row', async () => {
      const { service, prisma, clubsService } = buildService();
      clubsService.assertClubExists.mockRejectedValueOnce(new NotFoundException('Club not found'));

      await expect(
        service.register({
          email: 'bad-club@example.com',
          password: 'password123',
          displayName: 'Bad Club',
          ...asOfAdult,
          clubId: 'does-not-exist',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(clubsService.joinClub).not.toHaveBeenCalled();
    });

    it('calls assertClubExists before user.create (ordering, not just outcome)', async () => {
      const { service, prisma, clubsService } = buildService();
      const callOrder: string[] = [];
      clubsService.assertClubExists.mockImplementationOnce(async () => {
        callOrder.push('assertClubExists');
      });
      prisma.user.create.mockImplementationOnce(({ data }: any) => {
        callOrder.push('user.create');
        return Promise.resolve({
          id: 'user-1',
          role: 'fan',
          verificationStatus: 'unverified',
          createdAt: new Date('2026-08-16T00:00:00.000Z'),
          ...data,
        });
      });

      await service.register({
        email: 'order-check@example.com',
        password: 'password123',
        displayName: 'Order Check',
        ...asOfAdult,
        clubId: 'club-1',
      } as any);

      expect(callOrder).toEqual(['assertClubExists', 'user.create']);
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
