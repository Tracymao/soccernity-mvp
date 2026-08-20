import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsOptional, IsString, IsUUID, MinLength, ValidateNested } from 'class-validator';
import { GuardianDetailsDto } from './guardian-details.dto';

// Build Plan Section 4.1 (POST /auth/register) and Section 3 (User entity
// fields this maps onto). `guardian` is only required when the declared
// dateOfBirth makes the registrant a minor — that's a cross-field rule
// depending on computed age, so it's enforced in RegistrationService
// rather than as a static @IsOptional()/@IsNotEmpty() pair here.
export class RegisterDto {
  @IsEmail()
  email!: string;

  // Build Plan Section 5.7 doesn't set a minimum password length; 8
  // characters is a conventional floor pending any stricter policy —
  // argon2id (PasswordService) does the actual hashing regardless of
  // input strength.
  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(1)
  displayName!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsDateString()
  dateOfBirth!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GuardianDetailsDto)
  guardian?: GuardianDetailsDto;

  // Sprint 2 / sprint-2/auto-join-on-signup — Build Plan Section 6's
  // Sprint 2 line called for "club fan pages ... with auto-join on
  // signup" but PR #58 (club pages themselves) shipped with no
  // club-selection field anywhere in RegisterDto, flagged there as an
  // open gap. Optional, matching ClubPage.id's real `@id
  // @default(uuid())` type (schema.prisma) — omitting this field
  // entirely is the "no club for now" path, not a special sentinel
  // value. See RegistrationService.register()'s handling of this field
  // for the club-existence-before-user-creation ordering this requires.
  @IsOptional()
  @IsUUID()
  clubId?: string;
}
