import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionModule } from '../account-deletion/account-deletion.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

// sprint-5/admin-users-dashboard-backend — Build Plan Section 4.8
// (Admin Service), the platform-user management half. A dedicated
// top-level module, deliberately NOT folded into AdminModule (which
// stays scoped to Admin Console account/auth/profile) and deliberately a
// SEPARATE module from AdminContentModule/ModerationModule, even though
// all three are Section 4.8 admin surfaces — mirrors GrassrootsModule's
// own "one service, one/two resource-scoped controllers" shape, and
// ModerationModule's own precedent for needing more than one foundation
// module: AdminAuthFoundationModule for AdminJwtAuthGuard/AdminRolesGuard,
// AuthFoundationModule for TokenService (session revocation on
// suspend/delete — the exact mechanism AuthService.deactivateAccount/
// deleteAccount already use), and AccountDeletionModule for
// AccountDeletionSweepService (the immediate-delete reuse — see
// admin-users.service.ts's own comment on why this is reuse, not a
// parallel deletion implementation).
@Module({
  imports: [AdminAuthFoundationModule, AuthFoundationModule, AccountDeletionModule],
  controllers: [AdminUsersController],
  providers: [AdminUsersService, PrismaService],
})
export class AdminUsersModule {}
