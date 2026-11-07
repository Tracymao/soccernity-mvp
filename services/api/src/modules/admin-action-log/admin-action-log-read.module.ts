import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminActionLogReadController } from './admin-action-log-read.controller';
import { AdminActionLogReadService } from './admin-action-log-read.service';

// GET /admin/action-log. A separate module from AdminActionLogModule on purpose: that one is a tiny write-side
// service imported by many modules; this one adds a route and the admin auth guards, and nothing imports it.
@Module({
  imports: [PrismaModule, AdminAuthFoundationModule],
  controllers: [AdminActionLogReadController],
  providers: [AdminActionLogReadService],
})
export class AdminActionLogReadModule {}
