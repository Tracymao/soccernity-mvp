import { BadRequestException } from '@nestjs/common';
import { GuardianConsentService } from './guardian-consent.service';

// Fakes rather than @nestjs/testing's TestingModule — matches B1/B4's
// own spec style (see password-reset/password-reset.service.spec.ts) of
// constructing the service directly with a hand-built Prisma fake.
function buildFakeGuardian(
  overrides: Partial<{
    id: string;
    consentToken: string;
    consentStatus: string;
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
    consentTimestamp: null as Date | null,
    ...overrides,
  };
}

function buildService(initialGuardian: ReturnType<typeof buildFakeGuardian> | null = buildFakeGuardian()) {
  const guardiansByToken = new Map<string, ReturnType<typeof buildFakeGuardian>>();
  if (initialGuardian) guardiansByToken.set(initialGuardian.consentToken, initialGuardian);

  const prisma = {
    guardian: {
      findUnique: jest.fn(async ({ where }: { where: { consentToken: string } }) => {
        return guardiansByToken.get(where.consentToken) ?? null;
      }),
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
          const guardian = guardiansByToken.get(where.consentToken);
          if (!guardian || guardian.consentStatus === where.consentStatus.not) {
            return { count: 0 };
          }
          guardian.consentStatus = data.consentStatus;
          guardian.consentTimestamp = data.consentTimestamp;
          return { count: 1 };
        },
      ),
    },
  };

  const service = new GuardianConsentService(prisma as never);

  return { service, prisma, guardiansByToken };
}

describe('GuardianConsentService', () => {
  describe('confirmConsent', () => {
    it('confirms a valid, unused token and sets consentTimestamp', async () => {
      const guardian = buildFakeGuardian();
      const { service, guardiansByToken } = buildService(guardian);

      await service.confirmConsent(guardian.consentToken);

      const stored = guardiansByToken.get(guardian.consentToken)!;
      expect(stored.consentStatus).toBe('confirmed');
      expect(stored.consentTimestamp).toBeInstanceOf(Date);
    });

    it('is idempotent: submitting the same token again still succeeds without changing consentTimestamp', async () => {
      const guardian = buildFakeGuardian();
      const { service, guardiansByToken, prisma } = buildService(guardian);

      await service.confirmConsent(guardian.consentToken);
      const firstTimestamp = guardiansByToken.get(guardian.consentToken)!.consentTimestamp;

      await expect(service.confirmConsent(guardian.consentToken)).resolves.toBeUndefined();
      const secondTimestamp = guardiansByToken.get(guardian.consentToken)!.consentTimestamp;

      expect(secondTimestamp).toBe(firstTimestamp);
      // The second call short-circuits on the already-confirmed check
      // and never reaches the write.
      expect(prisma.guardian.updateMany).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid/nonexistent token with a generic 400', async () => {
      const { service } = buildService(null);

      await expect(service.confirmConsent('not-a-real-token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('does not flip an already-confirmed guardian back or perform a duplicate write when re-submitted', async () => {
      const originalTimestamp = new Date('2026-01-01T00:00:00.000Z');
      const guardian = buildFakeGuardian({ consentStatus: 'confirmed', consentTimestamp: originalTimestamp });
      const { service, guardiansByToken, prisma } = buildService(guardian);

      await service.confirmConsent(guardian.consentToken);

      const stored = guardiansByToken.get(guardian.consentToken)!;
      expect(stored.consentStatus).toBe('confirmed');
      expect(stored.consentTimestamp).toBe(originalTimestamp);
      expect(prisma.guardian.updateMany).not.toHaveBeenCalled();
    });
  });
});
