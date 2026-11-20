import { IsOptional, IsString, Length, Matches } from 'class-validator';

// PATCH /admin/profile — explicit allowlist of self-editable AdminUser
// fields, mirroring services/api/src/modules/users/dto/update-user.dto.ts's
// UpdateUserDto exactly in spirit: deliberately absent, even though they
// exist on AdminUser and a client could try to send them: `role` (an
// admin must never be able to promote themselves — role changes are a
// future superadmin-only admin-management action, out of this PR's
// scope), `email` (treated as read-only via this endpoint, a judgment
// call — see admin/README.md), and `accountStatus` (self-suspension makes
// no sense, and un-suspension must never be self-service). The global
// ValidationPipe (main.ts) has `whitelist: true, forbidNonWhitelisted:
// true`, so a request body containing any other key is rejected outright
// (400) before it reaches the controller — belt-and-braces alongside
// AdminProfileService's own allowlist.
export class UpdateAdminProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;
}
