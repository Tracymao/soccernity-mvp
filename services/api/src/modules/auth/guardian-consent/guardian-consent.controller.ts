import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { GuardianConsentDto } from './dto/guardian-consent.dto';
import { ResendGuardianConsentDto } from './dto/resend-guardian-consent.dto';
import { GuardianConsentService } from './guardian-consent.service';

// Build Plan Section 4.1 (Auth Service): POST /auth/guardian-consent.
// No JwtAuthGuard here (unlike /users/* — see users/README.md) — the
// guardian confirming consent is not a Soccernity account holder at
// all; Guardian.consentToken (a server-issued, unguessable UUID) is
// itself the credential, the same trust model /auth/reset-password
// uses for its own token.
//
// Out of scope for this PR: the guardian-facing web page (Section 8.3
// step 4's "plain-language explanation of data collected, with an
// 'I consent' action") that would actually call this endpoint. That's
// a frontend concern for a separate PR — this endpoint is the API
// contract it will call, mirroring how registration.controller.ts
// flagged this same endpoint as out of scope for PR B2.
@Controller('auth')
export class GuardianConsentController {
  constructor(private readonly guardianConsentService: GuardianConsentService) {}

  @Post('guardian-consent')
  @HttpCode(HttpStatus.OK)
  async confirm(@Body() dto: GuardianConsentDto): Promise<{ message: string }> {
    await this.guardianConsentService.confirmConsent(dto.consentToken);
    return { message: 'Guardian consent confirmed.' };
  }

  // DPIA finding R5's re-send path. Rate-limited — an unlimited resend
  // endpoint targeting an arbitrary email address is a spam vector
  // against a guardian's inbox, same class of concern
  // password-reset/password-reset.controller.ts's forgotPassword()
  // already rate-limits. Always the same generic response regardless of
  // whether the email matched a real, pending-consent minor account —
  // see resendConsent()'s own comment for the full non-enumeration
  // reasoning.
  @AuthRateLimit()
  @Post('guardian-consent/resend')
  @HttpCode(HttpStatus.OK)
  async resend(@Body() dto: ResendGuardianConsentDto): Promise<{ message: string }> {
    await this.guardianConsentService.resendConsent(dto.email);
    return { message: 'If that account has a guardian consent request pending, a new email has been sent.' };
  }
}
