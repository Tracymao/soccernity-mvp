import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminActionLogReadService } from './admin-action-log-read.service';
import { ListActionLogQueryDto } from './dto/list-action-log-query.dto';

// GET /admin/action-log (Decision Log #464, option B). EVERY admin role may call it, so there is deliberately no
// @AdminRoles(...) here (AdminRolesGuard with no required roles lets any authenticated admin through, as its own
// header documents). What a caller GETS is decided in the service: a superadmin reads every row, any other role only
// its own, and child-safety rows only reach a child-safety-vetted admin. The caller's id and role come from the
// verified token, never from the request.
@Controller('admin/action-log')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminActionLogReadController {
  constructor(private readonly actionLog: AdminActionLogReadService) {}

  @Get()
  async list(@Query() query: ListActionLogQueryDto, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.actionLog.list(query, admin);
  }
}
