import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardQueryDto } from './dto/leaderboard-query.dto';
import { LeaderboardService } from './leaderboard.service';

// Build Plan Section 4.9 (Leaderboard Service), Sprint 6.
@Controller('leaderboard')
export class LeaderboardController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  // GET /leaderboard?period=&cursor=&limit= — JwtAuthGuard only, no
  // GuardianConsentGuard: reading the board is not a "posting"-class
  // action under Section 5.7, and there is no logged-out view at all
  // (Decision Log #129), matching the guard style
  // apps/web's LeaderboardPage.tsx already assumes. No @CurrentUser() —
  // the response carries no per-caller field (unlike GET /posts/feed);
  // see leaderboard.service.ts's own comment.
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Query() query: LeaderboardQueryDto) {
    return this.leaderboardService.getLeaderboard(query);
  }
}
