import { Body, Controller, Post } from '@nestjs/common';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { ModerationService } from './moderation.service';

// POST /reports/public — a genuine spec-gap addition, same shape as
// ReportsController's own two routes (see that controller's header
// comment and README.md). No guard at all, deliberately a SEPARATE
// controller from ReportsController rather than a third method there:
// ReportsController applies JwtAuthGuard at the class level, and this
// route's whole purpose is to serve a caller who has no Soccernity
// account and never will for the purposes of this one report — a
// parent, a school, a member of the public flagging content that
// depicts them or their child. Mirrors GuardianConsentController's own
// "the token/contact info is the credential, not a session" trust
// model, and reuses the same @AuthRateLimit() throttle every other
// unauthenticated, potentially-abusable route in this codebase carries
// — it's the only anti-abuse control here; there is no CAPTCHA
// infrastructure anywhere in this repo, and none is invented for this.
@Controller('reports')
export class PublicReportsController {
  constructor(private readonly moderationService: ModerationService) {}

  @AuthRateLimit()
  @Post('public')
  async createPublic(@Body() dto: CreatePublicReportDto) {
    return this.moderationService.createPublicReport(dto);
  }
}
