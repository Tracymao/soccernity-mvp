import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../token/token.service';
import { AccessTokenPayload } from '../token/token.types';

// ---------------------------------------------------------------------
// THE shared "must have a valid access token" guard. Sprint 1 / PR B6
// (profile endpoints) is the first PR that needs to protect a route, so
// this is built here — but it is NOT specific to UsersModule. Every
// future authenticated route (B5's guardian-consent endpoints, B7's
// enforcement pass, and everything in Sprints 2+) should reuse this
// exact guard rather than re-implementing bearer-token parsing.
//
// USAGE PATTERN:
//
//   import { JwtAuthGuard } from '<path-to>/modules/auth/guards/jwt-auth.guard';
//   import { CurrentUser } from '<path-to>/modules/auth/guards/current-user.decorator';
//
//   @UseGuards(JwtAuthGuard)
//   @Get('some-protected-route')
//   handler(@CurrentUser() user: AccessTokenPayload) {
//     // user is exactly { sub, role } — see token.types.ts for why
//     // nothing else is ever in here.
//   }
//
// WIRING REQUIREMENT: JwtAuthGuard depends on TokenService via
// constructor injection, so it only resolves correctly if the consuming
// module imports AuthFoundationModule (directly or transitively) — see
// UsersModule for a working example. AuthFoundationModule registers
// JwtAuthGuard itself as a provider/export specifically so later modules
// don't need to re-declare it.
//
// WHAT IT DOES:
// 1. Reads the `Authorization: Bearer <token>` header.
// 2. Missing/malformed header -> 401 (UnauthorizedException) before ever
//    touching TokenService.
// 3. Delegates signature/expiry verification to
//    TokenService.verifyAccessToken(), which itself throws
//    UnauthorizedException on invalid/expired/tampered tokens — this
//    guard does not duplicate that logic.
// 4. On success, attaches the verified payload to `request.user`.
//
// WHAT IT DELIBERATELY DOES NOT DO: it does not attach isMinor,
// consentStatus, verificationStatus, or any other safety-sensitive field
// to the request — those are not in the token (see token.types.ts) and
// must never be inferred from it. Any handler that needs current
// safeguarding status must re-query Prisma itself. See
// UsersService.getOwnProfile for the first real example of this rule
// applied to a live endpoint.
// ---------------------------------------------------------------------
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.user = this.tokenService.verifyAccessToken(token);
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) return undefined;

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    return token;
  }
}
