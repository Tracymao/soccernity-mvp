import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountDeletionModule } from '../account-deletion/account-deletion.module';
import { AdminActionLogModule } from '../admin-action-log/admin-action-log.module';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { AdminUserDetailService } from './admin-user-detail.service';
import { AdminUserDobCorrectionService } from './admin-user-dob-correction.service';
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
//
// feat/admin-action-log — AdminActionLogModule imported so
// updateUserStatus can record an audit-log row after each successful
// accountStatus write. See modules/admin-action-log/README.md.
@Module({
  // B-103/B-109: ConfigModule (consent-token TTL) and RegistrationEmailService
  // (the guardian consent email a DOB-correction restart sends). DobEncryptionService
  // comes from the global CryptoModule.
  imports: [AdminAuthFoundationModule, AuthFoundationModule, AccountDeletionModule, AdminActionLogModule, ConfigModule],
  controllers: [AdminUsersController],
  providers: [
    AdminUsersService,
    AdminUserDetailService,
    AdminUserDobCorrectionService,
    PrismaService,
    RegistrationEmailService,
  ],
})
export class AdminUsersModule {}
