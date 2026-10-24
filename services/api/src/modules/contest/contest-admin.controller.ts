import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { ContestAdminService } from './contest-admin.service';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { UpdateCycleDto } from './dto/update-cycle.dto';

// The Admin Console's Contest endpoints (backend/w7-contest, B-091; docs/contest-spec.md section 4).
// All AdminJwtAuthGuard-only (the separate Admin Console auth path, ADMIN_JWT_SECRET -- see
// modules/admin/README.md); a User access token cannot reach any of these.
//
// An admin CREATES and EDITS a contest. That is all: there is no judging, no "open the final", no
// "crown". Those endpoints (POST .../rounds/:week/results, .../final/open, .../crown) were the
// admin-judged model of Decision Log #218/#241, which was never the founder's design (spec section 3)
// and are REMOVED. The self-running schedule is ContestLifecycleService.
@Controller('admin/contest')
@UseGuards(AdminJwtAuthGuard)
export class ContestAdminController {
  constructor(private readonly contestAdminService: ContestAdminService) {}

  // `current` is declared before `cycles/:id` so Nest never matches the literal "current" segment
  // against the `:id` param.
  @Get('cycles')
  async listCycles() {
    return this.contestAdminService.listCyclesForAdmin();
  }

  @Get('current')
  async currentCycle() {
    return this.contestAdminService.getCurrentContestForAdmin();
  }

  @Get('cycles/:id')
  async cycleDetail(@Param('id') id: string) {
    return this.contestAdminService.getCycleByIdForAdmin(id);
  }

  @Post('cycles')
  async createCycle(@CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: CreateCycleDto) {
    return this.contestAdminService.createCycle(admin.sub, dto);
  }

  @Patch('cycles/:id')
  async updateCycle(
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCycleDto,
  ) {
    return this.contestAdminService.updateCycle(admin.sub, id, dto);
  }
}
