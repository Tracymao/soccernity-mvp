// See admin-login.dto.ts's comment — ChangePasswordDto ({
// currentPassword, newPassword }) is equally generic and safe to reuse
// directly. newPassword keeps the exact same @IsString() @MinLength(8)
// rule the User-facing DTO uses, deliberately not stricter or looser for
// admin accounts.
export { ChangePasswordDto as AdminChangePasswordDto } from '../../auth/dto/change-password.dto';
