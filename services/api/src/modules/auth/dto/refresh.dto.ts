import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/refresh). Validated by main.ts's
// global ValidationPipe (added in PR B6) like every other auth DTO —
// see registration/dto/register.dto.ts for the same pattern.
export class RefreshDto {
  // Optional at the DTO level ONLY because cookie mode (B-245) reads the cookie and never
  // the body. Outside cookie mode the controller still rejects a missing token with 400
  // (requireBodyRefreshToken), exactly as before.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
