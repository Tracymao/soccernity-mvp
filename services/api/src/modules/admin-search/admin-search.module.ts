import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AuthRateLimitModule } from '../auth/rate-limit/rate-limit.module';
import { AdminSearchController } from './admin-search.controller';
import { AdminSearchService } from './admin-search.service';

// B-114 (Decision Log #463): GET /admin/search. A read-only module with its own route; it changes no other module.
@Module({
  imports: [AdminAuthFoundationModule, AdminActionLogModule, AuthRateLimitModule],
  controllers: [AdminSearchController],
  providers: [AdminSearchService, PrismaService],
})
export class AdminSearchModule {}
