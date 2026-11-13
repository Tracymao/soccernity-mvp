import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminTokenService } from '../token/admin-token.service';
import { AdminAccessTokenPayload } from '../token/admin-token.types';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';

function buildContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: { headers: Record<string, string | undefined>; admin?: AdminAccessTokenPayload };
} {
  const request: { headers: Record<string, string | undefined>; admin?: AdminAccessTokenPayload } = {
    headers,
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('AdminJwtAuthGuard', () => {
  it('attaches the verified { sub, role, aud } payload to request.admin (not request.user) and allows the request through', async () => {
    const payload: AdminAccessTokenPayload = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    const adminTokenService = {
      verifyActiveAccessToken: jest.fn().mockResolvedValue(payload),
    } as unknown as AdminTokenService;
    const guard = new AdminJwtAuthGuard(adminTokenService);
    const { context, request } = buildContext({ authorization: 'Bearer a.valid.admin.token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(adminTokenService.verifyActiveAccessToken).toHaveBeenCalledWith('a.valid.admin.token');
    expect(request.admin).toEqual(payload);
    expect(request).not.toHaveProperty('user');
  });

  it('rejects a request with no Authorization header at all, without calling AdminTokenService', async () => {
    const adminTokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as AdminTokenService;
    const guard = new AdminJwtAuthGuard(adminTokenService);
    const { context } = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(adminTokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a header that is not the Bearer scheme', async () => {
    const adminTokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as AdminTokenService;
    const guard = new AdminJwtAuthGuard(adminTokenService);
    const { context } = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(adminTokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('rejects "Bearer" with no token after it', async () => {
    const adminTokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as AdminTokenService;
    const guard = new AdminJwtAuthGuard(adminTokenService);
    const { context } = buildContext({ authorization: 'Bearer' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(adminTokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('propagates AdminTokenService.verifyActiveAccessToken rejecting an invalid/expired/non-admin token', async () => {
    const adminTokenService = {
      verifyActiveAccessToken: jest.fn().mockRejectedValue(new UnauthorizedException('Invalid or expired admin access token')),
    } as unknown as AdminTokenService;
    const guard = new AdminJwtAuthGuard(adminTokenService);
    const { context } = buildContext({ authorization: 'Bearer a.bad.token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
