import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageModule } from '../../storage/storage.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminMediaController } from './admin-media.controller';
import { MediaService } from './media.service';

// sprint-5/admin-media-storage-backend — Build Plan Section 4.8 (Admin
// Service), the Media library half. A dedicated top-level module,
// deliberately NOT folded into AdminModule (which stays scoped to Admin
// Console account/auth/profile) and deliberately a SEPARATE module from
// AdminContentModule/ModerationModule/AdminUsersModule, even though all
// four are Section 4.8 admin surfaces — mirrors AdminContentModule's own
// "one service, one controller, no user-facing routes" shape (see
// admin-content.module.ts's own comment), so it only imports
// AdminAuthFoundationModule for AdminJwtAuthGuard/AdminRolesGuard.
// StorageModule is the one addition beyond that shape — the
// provider-agnostic file-storage abstraction this module's own
// MediaService depends on (see storage/storage.service.ts).
@Module({
  imports: [AdminAuthFoundationModule, StorageModule],
  controllers: [AdminMediaController],
  providers: [MediaService, PrismaService],
})
export class MediaModule {}
