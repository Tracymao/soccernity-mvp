import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { ReportMediaDto } from './dto/report-media.dto';
import { PostMediaReportService } from './post-media-report.service';

// backend/w15-media-review-queue (B-037; Decision Log #419 item 4). POST /media/:id/report.
// JwtAuthGuard + GuardianConsentGuard (a restricted-pending account cannot report media; write-route-
// guards.spec.ts pins this -- the general report route POST /reports stays open to them, #370, and is the
// route for anything this one refuses).
@Controller('media')
@UseGuards(JwtAuthGuard)
export class PostMediaReportController {
  constructor(private readonly reports: PostMediaReportService) {}

  @Post(':id/report')
  @HttpCode(200)
  @UseGuards(GuardianConsentGuard)
  async report(@CurrentUser() user: AccessTokenPayload, @Param('id') id: string, @Body() dto: ReportMediaDto) {
    return this.reports.report(user.sub, id, dto?.reason);
  }
}
