import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UNDER_16_RESTRICTED_CODE, Under16RestrictionGuard } from './under-16-restriction.guard';

function ctx(feature: string | null) {
  const request = { user: { sub: 'u1', role: 'fan' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'h',
    getClass: () => 'c',
  } as unknown as ExecutionContext;
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(feature ?? undefined) } as unknown as Reflector;
  return { context, reflector };
}

function guardFor(user: { isUnder16: boolean } | null, feature: string | null = 'banter') {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const { context, reflector } = ctx(feature);
  return { guard: new Under16RestrictionGuard(prisma as never, reflector), context, prisma };
}

describe('Under16RestrictionGuard', () => {
  it('allows a non-under-16 account (reads isUnder16 fresh from Postgres)', async () => {
    const { guard, context, prisma } = guardFor({ isUnder16: false });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' }, select: { isUnder16: true } });
  });

  it('allows a since-deleted account through (handler decides)', async () => {
    const { guard, context } = guardFor(null);
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it.each(['messaging', 'banter', 'community_groups'])(
    'blocks an under-16 for %s with the distinct under_16_restricted code',
    async (feature) => {
      const { guard, context } = guardFor({ isUnder16: true }, feature);
      const err = await guard.canActivate(context).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toMatchObject({ code: UNDER_16_RESTRICTED_CODE, feature });
      expect(err.getResponse().code).not.toBe('guardian_consent_pending');
    },
  );

  it('fails closed when the route was not tagged with @RestrictUnder16', async () => {
    const { guard, context } = guardFor({ isUnder16: false }, null);
    await expect(guard.canActivate(context)).rejects.toThrow('without @RestrictUnder16');
  });
});
