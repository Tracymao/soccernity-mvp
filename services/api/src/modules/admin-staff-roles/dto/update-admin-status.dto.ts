import { IsIn } from 'class-validator';
import { ADMIN_STAFF_ACCOUNT_STATUSES, AdminStaffAccountStatus } from '../admin-staff-roles.constants';

// PATCH /admin/staff/:id/status — superadmin-only. A single required
// field, `status` (`active` or `deactivated`) — this endpoint writes
// ONLY AdminUser.accountStatus, the same narrow-scope precedent
// UpdateAdminRoleDto already sets for `role` (fullName/email/phone have
// their own PATCH /admin/profile; childSafetyVetted has its own PATCH
// /admin/users/:id/child-safety-vetting). Mirrors
// admin-users/dto/update-user-status.dto.ts's `status` field name, but a
// narrower value set — there is no admin-side `pending_deletion`/`deleted`
// concept here, only "can this admin currently log in."
export class UpdateAdminStatusDto {
  @IsIn(ADMIN_STAFF_ACCOUNT_STATUSES)
  status!: AdminStaffAccountStatus;
}
