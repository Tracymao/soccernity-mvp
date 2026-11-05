import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { GuardianDetailsDto } from '../../auth/registration/dto/guardian-details.dto';

// POST /auth/social/register: completes an account from a provider-verified identity. The same fields as
// POST /auth/register EXCEPT there is no email and no password (the email comes from the token, the password is a
// random unknown value) and a token in their place. Date of birth, guardian details and country come from the Age
// Gate exactly as for email registration; the provider's own birthday is never asked for or used.
export class SocialRegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  socialRegistrationToken!: string;

  // Optional override of the name the provider gave (the registration steps collect first and last name).
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName?: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuardianDetailsDto)
  guardian?: GuardianDetailsDto;

  @IsOptional()
  @IsUUID()
  clubId?: string;

  @Matches(/^[A-Za-z]{2}$/, { message: 'countryCode must be a 2-letter ISO country code' })
  countryCode!: string;
}
