import { IsIn } from 'class-validator';
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
}
