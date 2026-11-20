import { IsString, MinLength } from 'class-validator';

// Sprint 1 / sprint-1/f5-f6-missing-endpoints (POST /auth/change-password).
// Validated by main.ts's global ValidationPipe, matching every other auth
// DTO. newPassword uses the exact same @IsString() @MinLength(8) rule
// RegisterDto.password uses (registration/dto/register.dto.ts) —
// deliberately not stricter or looser, per this PR's own brief.
export class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}
