import { IsIn } from 'class-validator';
import { ADMIN_USER_ROLES, AdminUserRole } from '../admin-staff-roles.constants';

// PATCH /admin/staff/:id/role — superadmin-only. A single required
// field, `role` (one of the real editor | moderator | superadmin value
// set) — this endpoint reassigns ONLY AdminUser.role. It does not touch
// fullName/email/phone/accountStatus/childSafetyVetted — those already
// have their own dedicated write paths (PATCH /admin/profile for
// self-service; PATCH /admin/users/:id/child-safety-vetting for
// AdminStaffVettingModule) and are out of this endpoint's scope.
export class UpdateAdminRoleDto {
  @IsIn(ADMIN_USER_ROLES)
  role!: AdminUserRole;
}
