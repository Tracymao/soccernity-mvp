import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { EMAIL_VERIFICATION_REQUIRED_CODE, EmailVerifiedGuard } from './email-verified.guard';

function contextFor(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId, role: 'fan' } }) }),
  } as unknown as ExecutionContext;
}

describe('EmailVerifiedGuard', () => {
  function build(row: { verificationStatus: string } | null) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(row) } };
    return { guard: new EmailVerifiedGuard(prisma as any), prisma };
  }

  it('lets a verified user through', async () => {
    const { guard } = build({ verificationStatus: 'verified' });
    await expect(guard.canActivate(contextFor('u1'))).resolves.toBe(true);
  });

  it('reads verificationStatus fresh from the database for the token subject, never from the token', async () => {
    const { guard, prisma } = build({ verificationStatus: 'verified' });
    await guard.canActivate(contextFor('u1'));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { verificationStatus: true },
    });
  });

  it('refuses an unverified user with a machine-readable code', async () => {
    const { guard } = build({ verificationStatus: 'unverified' });
    const err = await guard.canActivate(contextFor('u1')).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({
      statusCode: 403,
      code: EMAIL_VERIFICATION_REQUIRED_CODE,
    });
  });

  it.each([['pending'], ['VERIFIED'], ['']])('fails safe: only the exact value "verified" passes (%p refused)', async (status) => {
    const { guard } = build({ verificationStatus: status });
    await expect(guard.canActivate(contextFor('u1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the account no longer exists behind a still-valid token', async () => {
    const { guard } = build(null);
    await expect(guard.canActivate(contextFor('gone'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
