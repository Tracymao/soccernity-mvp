import { IsEmail, IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import {
  GUARDIAN_RELATIONSHIPS,
  GuardianRelationship,
} from '../../registration/constants/guardian-relationship.constants';

// Decision Log #60 / #365: a minor changing the guardian on file while
// consent is still pending (POST /auth/guardian-consent/change-guardian-email).
//
// Name and relationship are REQUIRED alongside the new email, not optional:
// the new address may belong to a different person, and silently keeping the
// previous guardian's name/relationship against it would leave the Guardian
// row (and the consent record eventually snapshotted from it) describing
// someone who was never asked. Same field rules as registration's
// GuardianDetailsDto.
export class ChangeGuardianEmailDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(GUARDIAN_RELATIONSHIPS)
  relationship!: GuardianRelationship;
}
