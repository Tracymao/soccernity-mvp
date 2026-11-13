import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
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

describe('OptionalJwtAuthGuard', () => {
  it('attaches the verified { sub, role } payload to request.user and allows the request through', async () => {
    const payload: AccessTokenPayload = { sub: 'user-1', role: 'fan' };
    const tokenService = {
      verifyActiveAccessToken: jest.fn().mockResolvedValue(payload),
    } as unknown as TokenService;
    const guard = new OptionalJwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Bearer a.valid.token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(tokenService.verifyActiveAccessToken).toHaveBeenCalledWith('a.valid.token');
    expect(request.user).toEqual(payload);
  });

  it('allows a request with no Authorization header at all, leaving request.user undefined, without calling TokenService', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new OptionalJwtAuthGuard(tokenService);
    const { context, request } = buildContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
    expect(tokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('allows a header that is not the Bearer scheme, leaving request.user undefined', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new OptionalJwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Basic dXNlcjpwYXNz' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
    expect(tokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  it('allows "Bearer" with no token after it, leaving request.user undefined', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn(),
    } as unknown as TokenService;
    const guard = new OptionalJwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Bearer' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
    expect(tokenService.verifyActiveAccessToken).not.toHaveBeenCalled();
  });

  // The one real behavioral difference from JwtAuthGuard: an
  // invalid/expired/malformed token does NOT reject the request here —
  // it degrades to the same "proceed as anonymous" outcome as no token
  // at all, rather than throwing UnauthorizedException.
  it('swallows TokenService.verifyActiveAccessToken rejecting an invalid/expired token, leaving request.user undefined, and still allows the request through', async () => {
    const tokenService = {
      verifyActiveAccessToken: jest.fn().mockRejectedValue(new UnauthorizedException('Invalid or expired access token')),
    } as unknown as TokenService;
    const guard = new OptionalJwtAuthGuard(tokenService);
    const { context, request } = buildContext({ authorization: 'Bearer a.bad.token' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.user).toBeUndefined();
    expect(tokenService.verifyActiveAccessToken).toHaveBeenCalledWith('a.bad.token');
  });
});
