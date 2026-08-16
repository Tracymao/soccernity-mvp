// See forgot-password.dto.ts for why this is a plain interface rather
// than a class-validator DTO.
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}
