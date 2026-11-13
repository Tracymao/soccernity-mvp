import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TokenService } from '../token/token.service';
import { AccessTokenPayload } from '../token/token.types';

function buildContext(headers: Record<string, string | undefined>): {
  context: ExecutionContext;
  request: { headers: Record<string, string | undefined>; user?: AccessTokenPayload };
} {
  const request: { headers: Record<string, string | undefined>; user?: AccessTokenPayload } = {
    headers,
  };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('JwtAuthGuard', () => {
  it('attaches the verified { sub, role } payload to request.user and allows the request through', async () => {
    const payload: AccessTokenPayload = { sub: 'user-1', role: 'fan' };
    const tokenService = {
      verifyActiveAccessToken: jest.fn().mockResolvedValue(payload),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Bearer a.valid.token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(tokenService.verifyActiveAccessToken).toHaveBeenCalledWith('a.valid.token');
    expect(request.user).toEqual(payload);
  });

  it('rejects a request with no Authorization header at all, without calling TokenService', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(tokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a header that is not the Bearer scheme', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(tokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('rejects "Bearer" with no token after it', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Bearer' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(tokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('propagates TokenService.verifyActiveAccessToken rejecting an invalid/expired token', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn().mockRejectedValue(new UnauthorizedException('Invalid or expired access token')),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Bearer a.bad.token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
