import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { ContestService } from './contest.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { CrownCycleDto } from './dto/crown-cycle.dto';
import { RoundResultsDto } from './dto/round-results.dto';

// sprint-2/contest-data-model-backend — the admin transitions that drive
// the Contest state machine. All AdminJwtAuthGuard-only (the separate
// Admin Console auth path, ADMIN_JWT_SECRET — see modules/admin/README.md);
// a User access token cannot reach any of these.
//
// The full state machine (each step is one call here):
//   POST /admin/contest/cycles                          create → status 'active', phase 'vacant'
//   POST /admin/contest/cycles/:id/rounds/1/results     judge week 1 → phase 'week_1'
//   POST /admin/contest/cycles/:id/rounds/2/results     judge week 2 → phase 'weeks_1_2'
//   POST /admin/contest/cycles/:id/rounds/3/results     judge week 3 → phase 'weeks_1_3'
//   POST /admin/contest/cycles/:id/final/open           → status 'final', phase 'final_live'
//   POST /admin/contest/cycles/:id/crown                → status 'completed', phase 'crowned'
//
// No Section 4 line exists for any of these — genuine additions, Decision
// Log #218. Also NOT the Decision Log #73 "Admin — Create Competition"
// screen: that's the separate (still-deferred) Competition umbrella.
@Controller('admin/contest')
@UseGuards(AdminJwtAuthGuard)
export class ContestAdminController {
  constructor(private readonly contestService: ContestService) {}

  // -----------------------------------------------------------------
  // Read surface — sprint-2/admin-contest-read-endpoints (Decision Log
  // #241, Task 1 of 3 resolving Decision Log #239). Nothing returned
  // the entry/user ids the WRITE endpoints below consume; an admin
  // could not see the running cycle, its phase, who entered a round, or
  // what each entrant submitted. These three GETs close that.
  // AdminJwtAuthGuard is inherited from the class decorator.
  //
  // `current` is declared before `cycles/:id` so Nest never matches the
  // literal "current" segment against the `:id` param (same ordering
  // discipline ContestController uses for its own routes).
  // -----------------------------------------------------------------

  @Get('cycles')
  async listCycles() {
    return this.contestService.listCyclesForAdmin();
  }

  @Get('current')
  async currentCycle() {
    return this.contestService.getCurrentContestForAdmin();
  }

  @Get('cycles/:id')
  async cycleDetail(@Param('id') id: string) {
    return this.contestService.getCycleByIdForAdmin(id);
  }

  @Post('cycles')
  async createCycle(@Body() dto: CreateCycleDto) {
    return this.contestService.createCycle(dto);
  }

  @Post('cycles/:id/rounds/:week/results')
  async recordRoundResults(
    @Param('id') id: string,
    @Param('week', ParseIntPipe) week: number,
    @Body() dto: RoundResultsDto,
  ) {
    return this.contestService.recordRoundResults(id, week, dto);
  }

  @Post('cycles/:id/final/open')
  async openFinal(@Param('id') id: string) {
    return this.contestService.openFinal(id);
  }

  @Post('cycles/:id/crown')
  async crown(@Param('id') id: string, @Body() dto: CrownCycleDto) {
    return this.contestService.crownCycle(id, dto);
  }
}
