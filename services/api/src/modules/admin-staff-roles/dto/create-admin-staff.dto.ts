import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ADMIN_USER_ROLES, AdminUserRole } from '../admin-staff-roles.constants';

// POST /admin/staff — superadmin-only. Provisions a new AdminUser
// (Decision Log #191: previously direct-DB-insert only).
//
// `temporaryPassword` is OPTIONAL. Omitted -> the service generates a
// random one and returns it exactly once in the response. Supplied ->
// same @IsString() @MinLength(8) rule every other password field in this
// codebase uses (RegisterDto, ChangePasswordDto), deliberately not
// stricter or looser for admin accounts.
export class CreateAdminStaffDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullName!: string;

  @IsIn(ADMIN_USER_ROLES)
  role!: AdminUserRole;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  temporaryPassword?: string;
}
