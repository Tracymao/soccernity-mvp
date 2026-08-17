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
  it('attaches the verified { sub, role } payload to request.user and allows the request through', () => {
    const payload: AccessTokenPayload = { sub: 'user-1', role: 'fan' };
    const tokenService = {
      verifyAccessToken: jest.fn().mockReturnValue(payload),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Bearer a.valid.token' });

    const result = guard.canActivate(context);

    expect(result).toBe(true);
    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('a.valid.token');
    expect(request.user).toEqual(payload);
  });

  it('rejects a request with no Authorization header at all, without calling TokenService', () => {
    const tokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({});

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects a header that is not the Bearer scheme', () => {
    const tokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('rejects "Bearer" with no token after it', () => {
    const tokenService = {
      verifyAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Bearer' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('propagates TokenService.verifyAccessToken rejecting an invalid/expired token', () => {
    const tokenService = {
      verifyAccessToken: jest.fn().mockImplementation(() => {
        throw new UnauthorizedException('Invalid or expired access token');
      }),
    } as unknown as TokenService;
    const guard = new JwtAuthGuard(tokenService);
    const { context } = buildContext({ authorization: 'Bearer a.bad.token' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
