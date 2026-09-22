import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { TokenService } from '../token/token.service';
import { AccessTokenPayload } from '../token/token.types';

// ---------------------------------------------------------------------
// A permissive sibling to JwtAuthGuard (see that file's own header
// comment for the "must have a valid access token" contract this one
// deliberately relaxes). This guard NEVER rejects a request — it
// always returns true — and exists only for routes that want to know
// WHO is calling, when that's available, without making
// authentication mandatory.
//
// USAGE PATTERN:
//
//   @UseGuards(OptionalJwtAuthGuard)
//   @Post('some-route')
//   handler(@CurrentUser() user: AccessTokenPayload | undefined) {
//     // user is { sub, role } when a valid bearer token was sent;
//     // undefined when no token was sent AND when a token was sent but
//     // failed to verify (expired/malformed/tampered) — this guard
//     // treats both of those the same way: "couldn't verify, proceed
//     // as anonymous." It never throws.
//   }
//
// First real use: POST /posts/:id/view (Build Plan Section 4.3,
// sprint-4/post-view-tracking) — a view is worth recording whether or
// not the viewer is logged in, so the route can't use JwtAuthGuard's
// hard rejection, but still wants a real userId to de-duplicate
// against when one is available. See feed.service.ts's recordView for
// how the resulting defined/undefined split is used.
//
// WIRING REQUIREMENT: same as JwtAuthGuard — depends on TokenService via
// constructor injection, so it only resolves correctly in a module that
// imports AuthFoundationModule (directly or transitively).
// ---------------------------------------------------------------------
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly tokenService: TokenService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AccessTokenPayload }>();

    const token = this.extractBearerToken(request);
    if (!token) {
      return true;
    }

    try {
      request.user = this.tokenService.verifyAccessToken(token);
    } catch {
      // TokenService.verifyAccessToken throws UnauthorizedException for
      // every failure mode (expired, malformed, tampered, wrong
      // signature). This is the one guard in the codebase that
      // deliberately swallows it — an invalid token on an optionally-
      // authenticated route degrades to "anonymous caller," it doesn't
      // reject the request.
    }

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
