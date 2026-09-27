import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from './admin-action-log.service';

// feat/admin-action-log — a small, dedicated module purely to export
// AdminActionLogService. No controller of its own — there is no "list the
// audit log" read endpoint yet (flagged as an open follow-up in
// README.md, the same "schema/service exists, no read-side endpoint yet"
// gap this codebase has already disclosed for other modules before their
// own read endpoints landed, e.g. sports/README.md pre-#254).
//
// Imported by every module that needs to write an audit-log row —
// ModerationModule, AdminStaffVettingModule, AdminUsersModule today — the
// same "one small cross-cutting service, several importing modules" shape
// AccountDeletionModule already established for AccountDeletionSweepService.
@Module({
  providers: [AdminActionLogService, PrismaService],
  exports: [AdminActionLogService],
})
export class AdminActionLogModule {}
