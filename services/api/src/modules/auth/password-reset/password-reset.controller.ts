import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { FORGOT_PASSWORD_GENERIC_MESSAGE, PasswordResetService } from './password-reset.service';

// Build Plan Section 4.1 (Auth Service):
//   POST /auth/forgot-password
//   POST /auth/reset-password
@Controller('auth')
export class PasswordResetController {
  constructor(private readonly passwordResetService: PasswordResetService) {}

  // Section 5.7: "Rate limiting on /auth/login and /auth/register... table
  // stakes, not optional." Not named there, but forgot-password is the
  // same class of risk (email-enumeration probing, spam-triggering abuse)
  // even with the generic response below already closing off the
  // account-existence leak — defense in depth, not redundant.
  @AuthRateLimit()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ message: string }> {
    // Always the same response shape and message on this path, whether or
    // not the account exists — PasswordResetService.forgotPassword() never
    // throws for "not found", so there is no branch here that could leak
    // account existence via a different status code or body.
    await this.passwordResetService.forgotPassword(dto.email);
    return { message: FORGOT_PASSWORD_GENERIC_MESSAGE };
  }

  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    await this.passwordResetService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset successfully.' };
  }
}
