import { Body, Controller, HttpCode, HttpStatus, Post, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { AuthLimitExceeded } from '../auth/rate-limit/auth-limits/auth-limits.service';
import { AccessTokenPayload } from '../auth/token/token.types';
import { TwoFactorLockInterceptor } from '../two-factor/two-factor-lock.interceptor';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';
import { EmailChangeService } from './email-change.service';

// backend/email-change (B-059; Decision Log #472 adopted default (f)). No UI here.
//
//   POST /users/me/email-change   { password, newEmail, twoFactorCode? }  -> 202 { status: 'verification_sent' }
//   POST /auth/email-change/confirm { token }                              -> 204
//
// The request route: JwtAuthGuard + GuardianConsentGuard. The consent guard IS the "restricted-pending minors may
// not change their email" rule (adopted default, veto-able; a plain 403 guardian_consent_pending, fresh read from
// Postgres). EmailVerifiedGuard is deliberately NOT applied: an unverified user may fix a mistyped address, which is
// the whole use of this feature. The confirm route has no sign-in guard by design: the single-use secret in the
// emailed link is the credential (the link is opened from a mailbox, possibly on another device).
@Controller()
export class EmailChangeController {
  constructor(private readonly emailChange: EmailChangeService) {}

  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  @UseInterceptors(TwoFactorLockInterceptor)
  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @Post('users/me/email-change')
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RequestEmailChangeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'verification_sent' }> {
    try {
      await this.emailChange.requestChange(user.sub, dto);
    } catch (err) {
      // The failed-attempt budget is spent: same Retry-After header the sign-in limits send.
      if (err instanceof AuthLimitExceeded) res.header('Retry-After', String(err.retryAfterSeconds));
      throw err;
    }
    return { status: 'verification_sent' };
  }

  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @Post('auth/email-change/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirm(@Body() dto: ConfirmEmailChangeDto): Promise<void> {
    await this.emailChange.confirmChange(dto.token);
  }
}
