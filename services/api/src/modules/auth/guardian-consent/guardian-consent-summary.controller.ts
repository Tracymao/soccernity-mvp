import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import {
  CONSENT_TOKEN_HEADER,
  GuardianConsentSummaryService,
  GuardianRequestSummary,
} from './guardian-consent-summary.service';

// B-021 (Decision Log #372): GET /auth/guardian-consent/request-summary.
//
// A separate controller (not a method on GuardianConsentController) so adding
// it changes no existing constructor or spec. No guard: same trust model as
// POST /auth/guardian-consent -- the consent token is the credential, and the
// guardian is not a Soccernity account holder.
//
// - Rate limited (@AuthRateLimit): this returns a child's date of birth to a
//   token holder, so it gets the same throttle as every credential-adjacent
//   auth route.
// - Uncacheable on EVERY outcome: the headers are set before the service runs,
//   so a thrown rejection carries them too. The response is per-token personal
//   data and must never be stored by a browser, proxy or CDN.
// - The token travels in the X-Consent-Token header, not the URL (see
//   CONSENT_TOKEN_HEADER).
@Controller('auth')
export class GuardianConsentSummaryController {
  constructor(private readonly summaryService: GuardianConsentSummaryService) {}

  @AuthRateLimit()
  @Get('guardian-consent/request-summary')
  async requestSummary(
    @Headers(CONSENT_TOKEN_HEADER) consentToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GuardianRequestSummary> {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return this.summaryService.getSummary(consentToken);
  }
}
