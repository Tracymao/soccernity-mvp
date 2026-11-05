import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

// POST /auth/social/email-code: the person enters an email address (the provider gave none) and is sent a code.
export class SocialEmailCodeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  socialRegistrationToken!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}

// POST /auth/social/email-code/verify: the code that arrived at that address.
export class SocialEmailVerifyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  socialRegistrationToken!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}
