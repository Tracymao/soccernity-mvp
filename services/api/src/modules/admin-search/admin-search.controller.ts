import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { ADMIN_SEARCH_RATE_LIMIT } from './admin-search.constants';
import { AdminSearchService } from './admin-search.service';
import { AdminSearchQueryDto } from './dto/admin-search-query.dto';

// B-114 (Decision Log #463). Any authenticated admin may CALL this route; which groups come back depends on the
// caller's role, decided inside the service from each section's own role rule (see admin-search.service.ts). So
// there is deliberately no @AdminRoles(...) here: AdminRolesGuard is in the chain for consistency with every other
// admin controller, and with no required roles it lets any admin through, as its header comment documents.
//
// @AuthRateLimit(...) is the existing per-IP, per-handler limiter (the form the admin login uses); the tag below
// is required by global-rate-limit.coverage.spec.ts for every handler that carries it (a no-op on a GET).
@Controller('admin/search')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
export class AdminSearchController {
  constructor(private readonly search: AdminSearchService) {}

  @Get()
  @AuthRateLimit(ADMIN_SEARCH_RATE_LIMIT)
  @SkipGlobalWriteLimit()
  async run(@Query() query: AdminSearchQueryDto, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.search.search(query.q, admin);
  }
}
