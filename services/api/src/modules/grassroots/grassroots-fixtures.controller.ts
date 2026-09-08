import { Body, Controller, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { CreateFixtureDto } from './dto/create-fixture.dto';
import { LogResultDto } from './dto/log-result.dto';
import { UpdateFixtureStatusDto } from './dto/update-fixture-status.dto';
import { GrassrootsService } from './grassroots.service';

// Build Plan Section 4.5 (Grassroots Records Service) — the /fixtures
// routes, including PATCH /fixtures/:id/status (Decision Log #254) and the
// "first write is final" POST /fixtures/:id/result (Decision Log #255).
// See grassroots/README.md for the permission matrix and status machine.
@Controller('fixtures')
export class GrassrootsFixturesController {
  constructor(private readonly grassroots: GrassrootsService) {}

  // POST /fixtures. JwtAuthGuard + GuardianConsentGuard (same "posting"-
  // class reasoning as POST /teams). Authz: the caller must be the
  // creator of teamA -> else 403. Team existence (404) is settled before
  // the authz check.
  @Post()
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async create(@CurrentUser() user: AccessTokenPayload, @Body() dto: CreateFixtureDto) {
    return this.grassroots.createFixture(user.sub, dto);
  }

  // GET /fixtures/:id. JwtAuthGuard only. 404 for a non-existent id.
  // Includes status, both teams (minimal shape), and result if present.
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getById(@Param('id') id: string) {
    return this.grassroots.getFixtureById(id);
  }

  // POST /fixtures/:id/result. JwtAuthGuard + GuardianConsentGuard.
  // Authz: the caller must be the creator of EITHER team -> else 403.
  // Accepted only while the fixture is "scheduled" or "live" (else 409).
  // "First write is final": a second submission for the same fixture is a
  // 409, never an overwrite — enforced inside an interactive transaction
  // and backed by Result.fixtureId @unique (P2002 -> the same 409). On
  // success the fixture moves to "full_time".
  //
  // HttpCode(200): the response is the updated fixture (with its new
  // result), not a bare "created" — matching the 200-with-resulting-state
  // convention like/join/leave use rather than a 201.
  @Post(':id/result')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async logResult(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: LogResultDto,
  ) {
    return this.grassroots.logResult(user.sub, id, dto);
  }

  // PATCH /fixtures/:id/status — Decision Log #254. JwtAuthGuard +
  // GuardianConsentGuard. Authz: either team's creator -> else 403. Body
  // `{ status: 'live' | 'full_time' }`. The legal machine (scheduled ->
  // live, live -> full_time; everything else 409) is enforced server-side
  // in GrassrootsService.updateFixtureStatus. Returns the updated fixture.
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async updateStatus(
    @CurrentUser() user: AccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateFixtureStatusDto,
  ) {
    return this.grassroots.updateFixtureStatus(user.sub, id, dto);
  }
}
