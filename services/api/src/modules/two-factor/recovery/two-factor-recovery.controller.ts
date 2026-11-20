import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipGlobalWriteLimit } from '../../../rate-limit/global-rate-limit.decorators';
import { AuthRateLimit } from '../../auth/rate-limit/auth-rate-limit.decorator';
import { AuthLimitExceeded } from '../../auth/rate-limit/auth-limits/auth-limits.service';
import { RecoveryCancelDto, RecoveryLinkTokenDto, RecoveryRequestDto } from './dto/recovery.dto';
import { RECOVERY_IP_LIMIT } from './two-factor-recovery.constants';
import {
  ConfirmedRecovery,
  RecoveryLinkSummary,
  RecoveryRequestAnswer,
  TwoFactorRecoveryService,
} from './two-factor-recovery.service';

// backend/b276-two-factor-recovery (B-276; Decision Log #455, #456). USER two-factor recovery for someone who lost both
// the authenticator device and the backup codes. NO sign-in guard: the person cannot sign in, and a guardian has no
// account. Each route's credential is what it carries (email + password; a single-use link token). Open on purpose in
// write-route-guards.spec.ts, with the reason per route.
//
//   POST /auth/two-factor/recovery/request          { email, password }  -> 202 { audience: "account"|"guardian"|"no_guardian" }
//   GET  /auth/two-factor/recovery/link/:token                           -> { state, kind, minor?, requestedAt? }   (no side effects)
//   POST /auth/two-factor/recovery/confirm          { token }            -> { state: "waiting", executeAt, cancelToken }   (adult)
//   POST /auth/two-factor/recovery/cancel           { cancelToken }      -> { state: "cancelled" }                        (adult)
//   POST /auth/two-factor/recovery/guardian/approve { token }            -> { state: "done" }
//   POST /auth/two-factor/recovery/guardian/decline { token }            -> { state: "declined" }
//
// A rejected link action is 400 { code, state: "invalid"|"expired"|"used", message }. See ../README.md ("Recovery").
@Controller('auth/two-factor/recovery')
export class TwoFactorRecoveryController {
  constructor(private readonly recovery: TwoFactorRecoveryService) {}

  // The same answer (202, { audience: "account" }) for an unknown email, a wrong password, two-factor off and an
  // inactive account. Per-IP limit on top of the login limiter and the per-email budget the service charges.
  @SkipGlobalWriteLimit()
  @AuthRateLimit(RECOVERY_IP_LIMIT)
  @Post('request')
  @HttpCode(HttpStatus.ACCEPTED)
  async request(
    @Body() dto: RecoveryRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RecoveryRequestAnswer> {
    try {
      return await this.recovery.request(dto.email, dto.password, req.ip ?? 'unknown');
    } catch (err) {
      // Same 429 body as every throttled route, plus Retry-After (the interceptor the other limits use is not on this
      // route because the service calls the limiter itself, after the Redis check).
      if (err instanceof AuthLimitExceeded) res.header('Retry-After', String(err.retryAfterSeconds));
      throw err;
    }
  }

  // A scanner or a link-preview bot may GET this; it changes nothing. Not cacheable.
  @Get('link/:token')
  @Header('Cache-Control', 'no-store')
  link(@Param('token') token: string): Promise<RecoveryLinkSummary> {
    return this.recovery.describeLink(token);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(@Body() dto: RecoveryLinkTokenDto): Promise<ConfirmedRecovery> {
    return this.recovery.confirm(dto.token);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Body() dto: RecoveryCancelDto): Promise<{ state: 'cancelled' }> {
    return this.recovery.cancel(dto.cancelToken);
  }

  @Post('guardian/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Body() dto: RecoveryLinkTokenDto): Promise<{ state: 'done' }> {
    return this.recovery.approve(dto.token);
  }

  @Post('guardian/decline')
  @HttpCode(HttpStatus.OK)
  decline(@Body() dto: RecoveryLinkTokenDto): Promise<{ state: 'declined' }> {
    return this.recovery.decline(dto.token);
  }
}
