import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDIAN_CONSENT_PENDING_CODE, GuardianConsentGuard } from './guardian-consent.guard';
import { AuthenticatedRequest } from './authenticated-request';
import { AccessTokenPayload } from '../token/token.types';

// Mirrors jwt-auth.guard.spec.ts's own testing style: a minimal fake
// ExecutionContext wrapping a request already carrying `user`, as if
// JwtAuthGuard had already run (this guard is composable alongside it,
// not a replacement).
function buildContext(user: AccessTokenPayload): { context: ExecutionContext } {
  const request = { user } as AuthenticatedRequest;
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context };
}

function buildPrisma(options: {
  user?: { isMinor: boolean } | null;
  guardian?: { consentStatus: string } | null;
}) {
  return {
    user: {
      findUnique: jest.fn().mockResolvedValue(options.user ?? null),
    },
    guardian: {
      findUnique: jest.fn().mockResolvedValue(options.guardian ?? null),
    },
  };
}

describe('GuardianConsentGuard', () => {
  it('allows an adult account through without ever querying Guardian data', async () => {
    const prisma = buildPrisma({ user: { isMinor: false } });
    const guard = new GuardianConsentGuard(prisma as never);
    const { context } = buildContext({ sub: 'adult-1', role: 'fan' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.guardian.findUnique).not.toHaveBeenCalled();
  });

  it('allows a minor through once Guardian.consentStatus is "confirmed"', async () => {
    const prisma = buildPrisma({
      user: { isMinor: true },
      guardian: { consentStatus: 'confirmed' },
    });
    const guard = new GuardianConsentGuard(prisma as never);
    const { context } = buildContext({ sub: 'minor-1', role: 'fan' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.guardian.findUnique).toHaveBeenCalledWith({
      where: { minorUserId: 'minor-1' },
      select: { consentStatus: true },
    });
  });

  it('blocks a minor with consentStatus "pending" with a 403 carrying guardian_consent_pending', async () => {
    const prisma = buildPrisma({
      user: { isMinor: true },
      guardian: { consentStatus: 'pending' },
    });
    const guard = new GuardianConsentGuard(prisma as never);
    const { context } = buildContext({ sub: 'minor-1', role: 'fan' });

    expect.assertions(3);
    try {
      await guard.canActivate(context);
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const exception = err as ForbiddenException;
      expect(exception.getStatus()).toBe(403);
      expect(exception.getResponse()).toMatchObject({ code: GUARDIAN_CONSENT_PENDING_CODE });
    }
  });

  it('fails closed (blocks) if a minor somehow has no Guardian row at all', async () => {
    const prisma = buildPrisma({ user: { isMinor: true }, guardian: null });
    const guard = new GuardianConsentGuard(prisma as never);
    const { context } = buildContext({ sub: 'minor-1', role: 'fan' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('always re-reads isMinor from Postgres rather than trusting anything on the token payload', async () => {
    const prisma = buildPrisma({ user: { isMinor: false } });
    const guard = new GuardianConsentGuard(prisma as never);
    const { context } = buildContext({ sub: 'user-1', role: 'fan' });

    await guard.canActivate(context);

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { isMinor: true },
    });
  });

  it('lets a request for a since-deleted account through (not this guard\'s concern)', async () => {
    const prisma = buildPrisma({ user: null });
    const guard = new GuardianConsentGuard(prisma as never);
    const { context } = buildContext({ sub: 'ghost-1', role: 'fan' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
