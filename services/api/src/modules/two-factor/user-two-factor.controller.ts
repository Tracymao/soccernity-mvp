import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { AccessTokenPayload } from '../auth/token/token.types';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { TwoFactorPasswordDto } from './dto/two-factor-password.dto';
import { TwoFactorLockInterceptor } from './two-factor-lock.interceptor';
import { USER_CODE_IP_LIMIT } from './two-factor.constants';
import { EnrolmentStart, TwoFactorService, TwoFactorStatus } from './two-factor.service';

// backend/b086-two-factor (B-086; Decision Log #446). The signed-in user's two-factor settings. JwtAuthGuard ONLY, by
// decision -- NOT GuardianConsentGuard: a restricted-pending minor may protect their own account with a second
// factor, and this is an authentication setting, not content (the auth controllers are the open set by design in
// write-route-guards.spec.ts). Sign-in itself is POST /auth/login + POST /auth/login/two-factor (auth.controller.ts).
//
//   GET  /auth/two-factor/status                     -> { enabled, backupCodesRemaining }
//   POST /auth/two-factor/enrol/start                -> { secret, otpauthUri }       (no QR image: the web draws it)
//   POST /auth/two-factor/enrol/confirm { code }     -> { backupCodes }              (the ONLY time they are shown)
//   POST /auth/two-factor/backup-codes/regenerate { password } -> { backupCodes }
//   POST /auth/two-factor/disable { password }       -> 204
//
// Turning it off and regenerating need the password; neither ends other sessions (adopted default, veto-able).
@Controller('auth/two-factor')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TwoFactorLockInterceptor)
export class UserTwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get('status')
  status(@CurrentUser() user: AccessTokenPayload): Promise<TwoFactorStatus> {
    return this.twoFactor.getStatus('user', user.sub);
  }

  @Post('enrol/start')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: AccessTokenPayload): Promise<EnrolmentStart> {
    return this.twoFactor.startEnrolment('user', user.sub);
  }

  // Checks a code, so it carries the per-IP limit on top of the per-account lock.
  @SkipGlobalWriteLimit()
  @AuthRateLimit(USER_CODE_IP_LIMIT)
  @Post('enrol/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser() user: AccessTokenPayload, @Body() dto: TwoFactorCodeDto): Promise<{ backupCodes: string[] }> {
    return { backupCodes: await this.twoFactor.confirmEnrolment('user', user.sub, dto.code) };
  }

  @Post('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerate(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: TwoFactorPasswordDto,
  ): Promise<{ backupCodes: string[] }> {
    return { backupCodes: await this.twoFactor.regenerateBackupCodes('user', user.sub, dto.password) };
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(@CurrentUser() user: AccessTokenPayload, @Body() dto: TwoFactorPasswordDto): Promise<void> {
    await this.twoFactor.disable('user', user.sub, dto.password);
  }
}
