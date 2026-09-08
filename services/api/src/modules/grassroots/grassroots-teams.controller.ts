import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreateTeamDto } from './dto/create-team.dto';
import { ListFixturesQueryDto } from './dto/list-fixtures-query.dto';
import { ListTeamsQueryDto } from './dto/list-teams-query.dto';
import { GrassrootsService } from './grassroots.service';

// Build Plan Section 4.5 (Grassroots Records Service) — the /teams routes.
// The /fixtures routes live on GrassrootsFixturesController; both share
// one GrassrootsService. See grassroots/README.md for the endpoint list,
// permission matrix, status machine and the "first write is final" race
// policy.
@Controller('teams')
export class GrassrootsTeamsController {
  constructor(private readonly grassroots: GrassrootsService) {}

  // POST /teams. JwtAuthGuard + GuardianConsentGuard — creating a team
  // page produces a public-facing record, a "posting"-class action under
  // Section 5.7's broad reading (Decision Log #21), so a restricted-
  // pending minor cannot do it. createdById is the caller.
  @Post()
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateTeamDto) {
    return this.grassroots.createTeam(user.sub, dto);
  }

  // GET /teams?city=. JwtAuthGuard only — reading a browsable catalog is
  // not a safety-sensitive action (same reasoning as GET /clubs). Keyset
  // pagination, optional exact-match `city` filter. Its existence does
  // NOT close Decision Log #258 (no browse screen / no nav entry point).
  //
  // Declared before GET /teams/:id so Nest matches a bare /teams request
  // here, not against the :id route.
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Query() query: ListTeamsQueryDto) {
    return this.grassroots.listTeams(query);
  }

  // GET /teams/:id. JwtAuthGuard only. 404 for a non-existent id. Returns
  // no organiser PII (no nested User, no email) — only `createdById`.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string) {
    return this.grassroots.getTeamById(id);
  }

  // GET /teams/:id/fixtures. JwtAuthGuard only. 404 if the team is
  // missing. Every fixture the team is in (as teamA or teamB),
  // keyset-paginated newest-scheduled-first, each with status + result.
  //
  // A more specific path than GET /teams/:id (extra segment), so no route
  // collision regardless of declaration order.
  @Get(':id/fixtures')
  @UseGuards(JwtAuthGuard)
  async fixtures(@Param('id') id: string, @Query() query: ListFixturesQueryDto) {
    return this.grassroots.listTeamFixtures(id, query);
  }
}
