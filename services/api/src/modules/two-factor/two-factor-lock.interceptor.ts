import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { CodeEntryLockedException } from './two-factor-attempt.limiter';

// Puts Retry-After on the 429 a locked account gets, the same way AuthLimitsInterceptor does for the sign-in
// limits. Applied to every handler that checks a code.
@Injectable()
export class TwoFactorLockInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse();
    return next.handle().pipe(
      catchError((err) => {
        if (err instanceof CodeEntryLockedException) res?.header?.('Retry-After', String(err.retryAfterSeconds));
        return throwError(() => err);
      }),
    );
  }
}
