import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { TwoFactorCodeDto } from '../two-factor/dto/two-factor-code.dto';
import { TwoFactorPasswordDto } from '../two-factor/dto/two-factor-password.dto';
import { TwoFactorLockInterceptor } from '../two-factor/two-factor-lock.interceptor';
import { ADMIN_CODE_IP_LIMIT, ADMIN_TWO_FACTOR_REQUIRED_CODE } from '../two-factor/two-factor.constants';
import { EnrolmentStart, TwoFactorService, TwoFactorStatus } from '../two-factor/two-factor.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { CurrentAdmin } from './guards/current-admin.decorator';
import { AdminAccessTokenPayload } from './token/admin-token.types';

// backend/b086-two-factor (B-086, B-270; Decision Log #446). The signed-in ADMIN's two-factor settings -- the mirror
// of the user controller, under /admin/auth/two-factor, behind AdminJwtAuthGuard (the separate admin auth domain: a
// user token is 401 here, an admin token is 401 on the user routes). Every role may manage their OWN two-factor;
// resetting SOMEONE ELSE's is a superadmin action elsewhere (POST /admin/staff/:id/two-factor/reset).
//
// Enrolment at SIGN-IN (the gate that applies while ADMIN_2FA_ENFORCED is "true") is not here: it uses an enrolment
// token, not a session, and lives on AdminAuthController (login/two-factor/enrol/*).
//
// An admin cannot turn off their own two-factor while ADMIN_2FA_ENFORCED is "true" (adopted default, veto-able):
// the requirement would otherwise be undone by the account it protects, one request after the gate. When
// enforcement is off the admin may turn it off (with the password), like a user.
@Controller('admin/auth/two-factor')
@UseGuards(AdminJwtAuthGuard)
@UseInterceptors(TwoFactorLockInterceptor)
export class AdminTwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService) {}

  @Get('status')
  status(@CurrentAdmin() admin: AdminAccessTokenPayload): Promise<TwoFactorStatus> {
    return this.twoFactor.getStatus('admin', admin.sub);
  }

  @Post('enrol/start')
  @HttpCode(HttpStatus.OK)
  start(@CurrentAdmin() admin: AdminAccessTokenPayload): Promise<EnrolmentStart> {
    return this.twoFactor.startEnrolment('admin', admin.sub);
  }

  @SkipGlobalWriteLimit()
  @AuthRateLimit(ADMIN_CODE_IP_LIMIT)
  @Post('enrol/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: TwoFactorCodeDto,
  ): Promise<{ backupCodes: string[] }> {
    return { backupCodes: await this.twoFactor.confirmEnrolment('admin', admin.sub, dto.code) };
  }

  @Post('backup-codes/regenerate')
  @HttpCode(HttpStatus.OK)
  async regenerate(
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: TwoFactorPasswordDto,
  ): Promise<{ backupCodes: string[] }> {
    return { backupCodes: await this.twoFactor.regenerateBackupCodes('admin', admin.sub, dto.password) };
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disable(@CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: TwoFactorPasswordDto): Promise<void> {
    if (this.twoFactor.isAdminEnforced()) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: ADMIN_TWO_FACTOR_REQUIRED_CODE,
        message: 'Two-factor authentication is required for admin accounts and cannot be turned off.',
      });
    }
    await this.twoFactor.disable('admin', admin.sub, dto.password);
  }
}
