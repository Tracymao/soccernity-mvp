import { BadRequestException } from '@nestjs/common';
import { GuardianConsentService } from './guardian-consent.service';

// Fakes rather than @nestjs/testing's TestingModule — matches B1/B4's
// own spec style (see password-reset/password-reset.service.spec.ts) of
// constructing the service directly with a hand-built Prisma fake.
const ONE_HOUR_MS = 60 * 60 * 1000;

function buildFakeGuardian(
  overrides: Partial<{
    id: string;
    minorUserId: string;
    email: string;
    consentToken: string;
    consentStatus: string;
    consentTokenExpiresAt: Date;
    consentTimestamp: Date | null;
  }> = {},
) {
  return {
    id: 'guardian-1',
    minorUserId: 'user-1',
    name: 'Guardian Name',
    email: 'guardian@example.com',
    relationship: 'Parent',
    consentToken: 'a-real-token',
    consentStatus: 'pending',
    // Not-yet-expired by default, so every pre-existing test (written
    // before DPIA finding R5's expiry was added) keeps passing unless a
    // test deliberately overrides this into the past.
    consentTokenExpiresAt: new Date(Date.now() + ONE_HOUR_MS),
    consentTimestamp: null as Date | null,
    ...overrides,
  };
}

function buildFakeUser(overrides: Partial<{ id: string; email: string; displayName: string }> = {}) {
  return { id: 'user-1', email: 'minor@example.com', displayName: 'Minor Name', ...overrides };
}

function buildService(options: {
  guardian?: ReturnType<typeof buildFakeGuardian> | null;
  user?: ReturnType<typeof buildFakeUser> | null;
} = {}) {
  const guardian = options.guardian === undefined ? buildFakeGuardian() : options.guardian;
  const user = options.user === undefined ? buildFakeUser() : options.user;

  const guardiansByToken = new Map<string, ReturnType<typeof buildFakeGuardian>>();
  const guardiansByMinorUserId = new Map<string, ReturnType<typeof buildFakeGuardian>>();
  if (guardian) {
    guardiansByToken.set(guardian.consentToken, guardian);
    guardiansByMinorUserId.set(guardian.minorUserId, guardian);
  }
  const usersByEmail = new Map<string, ReturnType<typeof buildFakeUser>>();
  if (user) usersByEmail.set(user.email, user);

  const prisma = {
    user: {
      findUnique: jest.fn(async ({ where }: { where: { email: string } }) => {
        return usersByEmail.get(where.email) ?? null;
      }),
    },
    guardian: {
      findUnique: jest.fn(
        async ({ where }: { where: { consentToken?: string; minorUserId?: string } }) => {
          if (where.consentToken !== undefined) return guardiansByToken.get(where.consentToken) ?? null;
          if (where.minorUserId !== undefined) return guardiansByMinorUserId.get(where.minorUserId) ?? null;
          return null;
        },
      ),
      // Mirrors the real updateMany's atomic guard: only applies the
      // write when a row exists for the token AND its consentStatus
      // doesn't already match the `not` filter's excluded value.
      updateMany: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { consentToken: string; consentStatus: { not: string } };
          data: { consentStatus: string; consentTimestamp: Date };
        }) => {
          const row = guardiansByToken.get(where.consentToken);
          if (!row || row.consentStatus === where.consentStatus.not) {
            return { count: 0 };
          }
          row.consentStatus = data.consentStatus;
          row.consentTimestamp = data.consentTimestamp;
          return { count: 1 };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { consentToken: string; consentTokenExpiresAt: Date };
        }) => {
          const row = guardian && guardian.id === where.id ? guardian : undefined;
          if (!row) throw new Error('guardian not found');
          // The old token no longer resolves once overwritten — same as
          // the real @unique column holding only one current value.
          guardiansByToken.delete(row.consentToken);
          row.consentToken = data.consentToken;
          row.consentTokenExpiresAt = data.consentTokenExpiresAt;
          guardiansByToken.set(row.consentToken, row);
          return row;
        },
      ),
    },
  };

  const config = { get: () => undefined } as never;
  const emailService = { sendGuardianConsentEmail: jest.fn().mockResolvedValue(undefined) };

  const service = new GuardianConsentService(prisma as never, config, emailService as never);

  return { service, prisma, guardiansByToken, emailService, guardian, user };
}

describe('GuardianConsentService', () => {
  describe('confirmConsent', () => {
    it('confirms a valid, unused token and sets consentTimestamp', async () => {
      const { service, guardiansByToken, guardian } = buildService();

      await service.confirmConsent(guardian!.consentToken);

      const stored = guardiansByToken.get(guardian!.consentToken)!;
      expect(stored.consentStatus).toBe('confirmed');
      expect(stored.consentTimestamp).toBeInstanceOf(Date);
    });

    it('is idempotent: submitting the same token again still succeeds without changing consentTimestamp', async () => {
      const { service, guardiansByToken, prisma, guardian } = buildService();

      await service.confirmConsent(guardian!.consentToken);
      const firstTimestamp = guardiansByToken.get(guardian!.consentToken)!.consentTimestamp;

      await expect(service.confirmConsent(guardian!.consentToken)).resolves.toBeUndefined();
      const secondTimestamp = guardiansByToken.get(guardian!.consentToken)!.consentTimestamp;

      expect(secondTimestamp).toBe(firstTimestamp);
      // The second call short-circuits on the already-confirmed check
      // and never reaches the write.
      expect(prisma.guardian.updateMany).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid/nonexistent token with a generic 400', async () => {
      const { service } = buildService({ guardian: null });

      await expect(service.confirmConsent('not-a-real-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not flip an already-confirmed guardian back or perform a duplicate write when re-submitted', async () => {
      const originalTimestamp = new Date('2026-01-01T00:00:00.000Z');
      const { service, guardiansByToken, prisma, guardian } = buildService({
        guardian: buildFakeGuardian({ consentStatus: 'confirmed', consentTimestamp: originalTimestamp }),
      });

      await service.confirmConsent(guardian!.consentToken);

      const stored = guardiansByToken.get(guardian!.consentToken)!;
      expect(stored.consentStatus).toBe('confirmed');
      expect(stored.consentTimestamp).toBe(originalTimestamp);
      expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
    });

    // DPIA finding R5.
    describe('token expiry', () => {
      it('rejects an expired-but-otherwise-valid token, leaving consentStatus/consentTimestamp unchanged', async () => {
        const { service, guardiansByToken, guardian } = buildService({
          guardian: buildFakeGuardian({ consentTokenExpiresAt: new Date(Date.now() - ONE_HOUR_MS) }),
        });

        await expect(service.confirmConsent(guardian!.consentToken)).rejects.toBeInstanceOf(
          BadRequestException,
        );

        const stored = guardiansByToken.get(guardian!.consentToken)!;
        expect(stored.consentStatus).toBe('pending');
        expect(stored.consentTimestamp).toBeNull();
      });

      it('accepts a valid, unexpired token (regression)', async () => {
        const { service, guardiansByToken, guardian } = buildService({
          guardian: buildFakeGuardian({ consentTokenExpiresAt: new Date(Date.now() + ONE_HOUR_MS) }),
        });

        await expect(service.confirmConsent(guardian!.consentToken)).resolves.toBeUndefined();

        expect(guardiansByToken.get(guardian!.consentToken)!.consentStatus).toBe('confirmed');
      });

      it('rejects an expired token even when consentStatus is already "confirmed" — expiry applies regardless of prior confirmation', async () => {
        const originalTimestamp = new Date('2026-01-01T00:00:00.000Z');
        const { service, guardian } = buildService({
          guardian: buildFakeGuardian({
            consentStatus: 'confirmed',
            consentTimestamp: originalTimestamp,
            consentTokenExpiresAt: new Date(Date.now() - ONE_HOUR_MS),
          }),
        });

        await expect(service.confirmConsent(guardian!.consentToken)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      });
    });
  });

  // DPIA finding R5's re-send path.
  describe('resendConsent', () => {
    it('issues a new token, invalidates the old one, and re-sends the email for a pending guardian', async () => {
      const { service, guardiansByToken, emailService, guardian, user } = buildService();
      const oldToken = guardian!.consentToken;

      await service.resendConsent(user!.email);

      expect(guardiansByToken.has(oldToken)).toBe(false);
      const newToken = guardian!.consentToken;
      expect(newToken).not.toBe(oldToken);
      expect(guardiansByToken.get(newToken)).toBe(guardian);
      expect(emailService.sendGuardianConsentEmail).toHaveBeenCalledWith(
        guardian!.email,
        newToken,
        user!.displayName,
      );
    });

    it('sets a fresh expiry window on resend, not an extension of the old one', async () => {
      const { service, guardian, user } = buildService({
        guardian: buildFakeGuardian({ consentTokenExpiresAt: new Date(Date.now() - ONE_HOUR_MS) }),
      });

      await service.resendConsent(user!.email);

      expect(guardian!.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('is a silent no-op for an already-confirmed guardian: no new token, no email', async () => {
      const { service, emailService, guardian, user } = buildService({
        guardian: buildFakeGuardian({ consentStatus: 'confirmed' }),
      });
      const originalToken = guardian!.consentToken;

      await expect(service.resendConsent(user!.email)).resolves.toBeUndefined();

      expect(guardian!.consentToken).toBe(originalToken);
      expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
    });

    it('is a silent no-op for an unknown email — same as a known-pending email\'s non-error response (non-enumeration)', async () => {
      const { service, emailService } = buildService({ user: null });

      await expect(service.resendConsent('nobody@example.com')).resolves.toBeUndefined();
      expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
    });

    it('is a silent no-op for a minor with no Guardian row', async () => {
      const { service, emailService } = buildService({ guardian: null });

      await expect(service.resendConsent('minor@example.com')).resolves.toBeUndefined();
      expect(emailService.sendGuardianConsentEmail).not.toHaveBeenCalled();
    });
  });
});
