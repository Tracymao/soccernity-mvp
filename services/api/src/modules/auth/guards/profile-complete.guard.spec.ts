import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PROFILE_INCOMPLETE_CODE, ProfileCompleteGuard } from './profile-complete.guard';

function contextFor(userId: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user: { sub: userId, role: 'fan' } }) }),
  } as unknown as ExecutionContext;
}

describe('ProfileCompleteGuard (B-027)', () => {
  function build(row: { username: string | null } | null) {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(row) } };
    return { guard: new ProfileCompleteGuard(prisma as never), prisma };
  }

  it('lets an account with a username through', async () => {
    const { guard } = build({ username: 'temi_fc' });
    await expect(guard.canActivate(contextFor('u1'))).resolves.toBe(true);
  });

  it('reads the username fresh from the database for the token subject', async () => {
    const { guard, prisma } = build({ username: 'temi_fc' });
    await guard.canActivate(contextFor('u1'));
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { username: true } });
  });

  it('refuses an account with no username (incl. legacy accounts) with a machine-readable code', async () => {
    const { guard } = build({ username: null });
    const err = await guard.canActivate(contextFor('u1')).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as ForbiddenException).getResponse()).toMatchObject({ statusCode: 403, code: PROFILE_INCOMPLETE_CODE });
  });

  it('treats an empty-string username as incomplete (fails safe)', async () => {
    const { guard } = build({ username: '' });
    await expect(guard.canActivate(contextFor('u1'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the account no longer exists behind a still-valid token', async () => {
    const { guard } = build(null);
    await expect(guard.canActivate(contextFor('gone'))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
