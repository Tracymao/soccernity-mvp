import { IsEmail } from 'class-validator';

// B-128 (POST /auth/resend-verification-email). Validated by the controller's
// ValidationPipe like every other auth DTO.
export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
