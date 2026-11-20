import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Build Plan Section 4.1 (POST /auth/login). Validated by main.ts's
// global ValidationPipe (added in PR B6) like every other auth DTO —
// see registration/dto/register.dto.ts for the same pattern.
export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  // B-245 "Stay signed in": only affects cookie mode (X-Auth-Mode: cookie or an allowlisted Origin, B-248). true -> a
  // persistent refresh cookie (Max-Age = the refresh TTL); false/absent -> a session cookie.
  // Declared here because forbidNonWhitelisted rejects any undeclared body field.
  @IsOptional()
  @IsBoolean()
  staySignedIn?: boolean;
}
