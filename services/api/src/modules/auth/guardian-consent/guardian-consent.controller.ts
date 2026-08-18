import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { GuardianConsentDto } from './dto/guardian-consent.dto';
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
}
