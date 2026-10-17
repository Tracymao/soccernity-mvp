import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { GuardianDetailsDto } from '../../auth/registration/dto/guardian-details.dto';

// POST /admin/users/:id/dob-correction (B-103, Decision Log #390, #395 B4,
// #398). The corrected date goes through the SAME validation registration
// applies: IsDateString here, then isPlausibleDateOfBirth in the service.
export class CorrectDobDto {
  @IsDateString()
  dateOfBirth!: string;

  // REQUIRED. Recorded verbatim in the audit entry, so the admin must not type
  // either date of birth into it (the audit trail never holds DOB values --
  // the form copy and README say so). Bounded so it stays a reason, not a log.
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;

  // Needed ONLY when the corrected date makes an account a minor and no
  // Guardian row exists yet (an adult account corrected to under 18): there is
  // nobody on file to send the consent request to. Ignored in every other case.
  @IsOptional()
  @ValidateNested()
  @Type(() => GuardianDetailsDto)
  guardian?: GuardianDetailsDto;
}
