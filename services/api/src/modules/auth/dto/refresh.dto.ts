import { IsNotEmpty, IsString } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/refresh). Validated by main.ts's
// global ValidationPipe (added in PR B6) like every other auth DTO —
// see registration/dto/register.dto.ts for the same pattern.
export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
