import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { GUARDIAN_RELATIONSHIPS, GuardianRelationship } from '../constants/guardian-relationship.constants';

// Build Plan Section 8.3, step 2 ("Guardian-details capture"): guardian
// name, email and relationship to the minor, captured before account
// creation completes for any declared-under-18 registrant.
export class GuardianDetailsDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEmail()
  email!: string;

  @IsIn(GUARDIAN_RELATIONSHIPS)
  relationship!: GuardianRelationship;
}
