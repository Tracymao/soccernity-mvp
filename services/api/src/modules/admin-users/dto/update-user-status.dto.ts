import { IsIn, IsOptional } from 'class-validator';
import { REPORT_REASON_CATEGORIES, ReportReasonCategory } from '../../moderation/moderation.constants';
import { ADMIN_USER_ACTIONS, AdminUserAction } from '../admin-users.constants';

// PATCH /admin/users/:id — a genuine addition beyond Section 4.8's
// literal contract line (see README.md's Decision Log candidates).
// Exactly one action per request: `active` or `suspended` (a plain
// User.accountStatus write, see admin-users.constants.ts) or `deleted`
// (an immediate, admin-triggered hard delete — see
// AdminUsersService.updateUserStatus's own comment for why this is
// deliberately not `pending_deletion`).
export class UpdateUserStatusDto {
  @IsIn(ADMIN_USER_ACTIONS)
  status!: AdminUserAction;

  // B-291 (Decision Log #485): REQUIRED when status is 'suspended', refused for any other status. Both rules are
  // enforced in AdminUsersService (stable error codes); the DTO only checks the value is a known category.
  @IsOptional()
  @IsIn(REPORT_REASON_CATEGORIES)
  reasonCategory?: ReportReasonCategory;
}
