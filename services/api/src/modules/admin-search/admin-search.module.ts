import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { AdminSearchController } from './admin-search.controller';
import { AdminSearchService } from './admin-search.service';

// B-114 (Decision Log #463): GET /admin/search. A read-only module with its own route; it changes no other module.
@Module({
  imports: [PrismaModule, AdminAuthFoundationModule, AdminActionLogModule, AuthRateLimitModule],
  controllers: [AdminSearchController],
  providers: [AdminSearchService],
})
export class AdminSearchModule {}
