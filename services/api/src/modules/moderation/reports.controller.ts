import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { AppealReportDto } from './dto/appeal-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ModerationService } from './moderation.service';

// User-facing half of Build Plan Section 8.4's moderation/appeals
// workflow — see README.md for the full guard reasoning and this
// controller's own Decision Log candidates (Section 4 defines neither
// of these two routes; both are genuine spec-gap additions, built
// anyway because Section 8.4's own workflow text assumes them).
//
// JwtAuthGuard ONLY on both routes — deliberately NOT GuardianConsentGuard.
// A restricted-pending minor must still be able to report abuse directed
// at them (and, symmetrically, to appeal a decision made against them);
// gating either route the way posting/messaging are gated would make
// that impossible, the same reasoning
// GuardianConsentController's own status endpoint already established
// for why a restricted-pending user must be able to reach certain routes
// about their OWN restriction.
@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateReportDto) {
    return this.moderationService.createReport(user.sub, dto);
  }

  @Post(':id/appeal')
  async appeal(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: AppealReportDto,
  ) {
    return this.moderationService.appealReport(id, user.sub, dto);
  }
}
