import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminAccessTokenPayload } from '../token/admin-token.types';
import { AdminRolesGuard } from './admin-roles.guard';

function buildContext(
  admin: AdminAccessTokenPayload | undefined,
  metadata: string[] | undefined,
): ExecutionContext {
  const request: { admin?: AdminAccessTokenPayload } = { admin };
  const handler = () => undefined;
  const controllerClass = class {};
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(metadata);

  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controllerClass,
  } as unknown as ExecutionContext;

  return context;
}

describe('AdminRolesGuard', () => {
  it('allows the request through when the route has no @AdminRoles(...) metadata at all', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const guard = new AdminRolesGuard(reflector);
    const context = buildContext({ sub: 'admin-1', role: 'editor', aud: 'admin-console' }, undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows the request through when the route has an empty @AdminRoles() list', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const guard = new AdminRolesGuard(reflector);
    const context = buildContext({ sub: 'admin-1', role: 'editor', aud: 'admin-console' }, []);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a moderator through a route gated to moderator/superadmin', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['moderator', 'superadmin']);
    const guard = new AdminRolesGuard(reflector);
    const context = buildContext({ sub: 'admin-1', role: 'moderator', aud: 'admin-console' }, [
      'moderator',
      'superadmin',
    ]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a superadmin through a route gated to moderator/superadmin', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['moderator', 'superadmin']);
    const guard = new AdminRolesGuard(reflector);
    const context = buildContext({ sub: 'admin-1', role: 'superadmin', aud: 'admin-console' }, [
      'moderator',
      'superadmin',
    ]);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an editor from a route gated to moderator/superadmin', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['moderator', 'superadmin']);
    const guard = new AdminRolesGuard(reflector);
    const context = buildContext({ sub: 'admin-1', role: 'editor', aud: 'admin-console' }, [
      'moderator',
      'superadmin',
    ]);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects a request with no request.admin at all (defensive — should never happen behind AdminJwtAuthGuard)', () => {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['moderator', 'superadmin']);
    const guard = new AdminRolesGuard(reflector);
    const context = buildContext(undefined, ['moderator', 'superadmin']);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
