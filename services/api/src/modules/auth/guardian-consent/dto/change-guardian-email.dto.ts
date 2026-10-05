import { IsEmail, MaxLength } from 'class-validator';

// Decision Log #60 / legal-copy Part C row 34: a minor changing the
// guardian's email on file while consent is still pending
// (POST /auth/guardian-consent/change-guardian-email). The only input is
// the NEW guardian email -- the guardian's name and relationship stay as
// captured at registration (see guardian-consent.service.ts's
// changeGuardianEmail() and the Decision Log entry for why).
export class ChangeGuardianEmailDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
