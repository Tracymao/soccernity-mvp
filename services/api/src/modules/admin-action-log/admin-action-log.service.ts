import { Injectable } from '@nestjs/common';
import { AdminActionLog } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// AdminActionLog (see that model's own schema.prisma comment) — a
// general-purpose, append-only audit trail of admin/moderator actions,
// distinct from Report's own reviewedByAdminId/actionTaken/appeal fields,
// which record ONLY the moderation-decision lifecycle of one specific
// Report. This service is the ONE place in the codebase that writes to
// AdminActionLog — see README.md for the full list of call sites and
// the action/targetType values each one uses (moderation.constants.ts's
// ADMIN_ACTION_LOG_ACTIONS / ADMIN_ACTION_LOG_TARGET_TYPES equivalent,
// admin-action-log.constants.ts).
//
// record() is deliberately NOT run inside the caller's own $transaction
// (actionReport/decideAppeal each wrap their own Report update +
// Notification writes in one) — it is called immediately after the
// mutating action has already committed successfully. A disclosed, minor
// limitation: a crash in the narrow window between the two could in
// theory leave a real state change with no matching log row, but never
// the reverse (a log row for an action that never actually happened).
// Failures here are NOT swallowed the way RegistrationEmailService's own
// fire-and-forget sends are — an audit-log write failing is itself a
// safeguarding-relevant signal, so it propagates and fails the calling
// request loudly rather than being logged-and-ignored.
@Injectable()
export class AdminActionLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    adminId: string,
    action: string,
    targetType: string,
    targetId: string,
    notes?: string,
  ): Promise<AdminActionLog> {
    return this.prisma.adminActionLog.create({
      data: { adminId, action, targetType, targetId, notes: notes ?? null },
    });
  }
}
