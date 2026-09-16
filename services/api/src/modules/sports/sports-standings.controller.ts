import { Controller, Get, Query } from '@nestjs/common';
import { GetStandingsQueryDto } from './dto/get-standings-query.dto';
import { SportsService } from './sports.service';

// A separate controller for the one remaining Section 4.6 route — standings is scoped by
// league(+season), not by a single match, so it doesn't naturally belong grouped with
// SportsMatchesController's match-centric routes (mirrors grassroots' own teams/fixtures
// controller split — one controller per literal "what is this resource fundamentally about"
// grouping, not one controller per URL prefix). NO GUARD, same public reasoning as
// SportsMatchesController's own header comment.
@Controller('sports')
export class SportsStandingsController {
  constructor(private readonly sportsService: SportsService) {}

  @Get('standings')
  async getStandings(@Query() query: GetStandingsQueryDto) {
    return this.sportsService.getStandings(query);
  }
}
