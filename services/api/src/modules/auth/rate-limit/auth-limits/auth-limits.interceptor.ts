import {
  applyDecorators,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
  UnauthorizedException,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, defer, from, map, mergeMap, throwError } from 'rxjs';
import { AUTH_LIMIT_KEY, AuthLimitKind } from './auth-limits.constants';
import { AuthLimitExceeded, AuthLimitsService, LoginTicket } from './auth-limits.service';

// Usage (replaces @AuthRateLimit() on exactly these three routes):
//
//   @AuthLimit('login')
//   @Post('login')
//
// An interceptor, not a guard: login must run code AFTER the handler (to give the failed-attempt slot back on
// success). Interceptors run before pipes, so the body is not yet validated -- a non-string email is simply
// not used as a key, and the DTO validation then rejects the request as usual.
export function AuthLimit(kind: AuthLimitKind) {
  return applyDecorators(SetMetadata(AUTH_LIMIT_KEY, kind), UseInterceptors(AuthLimitsInterceptor));
}

@Injectable()
export class AuthLimitsInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly limits: AuthLimitsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const kind = this.reflector.get<AuthLimitKind | undefined>(AUTH_LIMIT_KEY, context.getHandler());
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();
    const ip: string = req.ip ?? 'unknown';
    const email: string | undefined = typeof req.body?.email === 'string' ? req.body.email : undefined;

    return defer(() => from(this.before(kind, ip, email))).pipe(
      mergeMap((ticket) => {
        const handled = next.handle();
        if (!ticket) return handled;
        return handled.pipe(
          mergeMap((value) => from(this.limits.endLogin(ticket, 'success')).pipe(map(() => value))),
          catchError((err) => {
            const outcome = err instanceof UnauthorizedException ? 'failed-credentials' : 'other';
            return from(this.limits.endLogin(ticket, outcome)).pipe(mergeMap(() => throwError(() => err)));
          }),
        );
      }),
      catchError((err) => {
        if (err instanceof AuthLimitExceeded) res?.header?.('Retry-After', String(err.retryAfterSeconds));
        return throwError(() => err);
      }),
    );
  }

  private async before(kind: AuthLimitKind | undefined, ip: string, email: string | undefined): Promise<LoginTicket | null> {
    switch (kind) {
      case 'signup':
        await this.limits.enforceSignup(ip);
        return null;
      case 'forgot-password':
        await this.limits.enforceForgotPassword(ip, email);
        return null;
      case 'login':
        return this.limits.beginLogin(ip, email);
      default:
        return null;
    }
  }
}
