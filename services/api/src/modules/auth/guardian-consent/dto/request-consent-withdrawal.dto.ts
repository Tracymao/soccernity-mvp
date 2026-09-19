import { IsEmail } from 'class-validator';

// sprint-1/guardian-consent-decline-withdraw-expiry
// (POST /auth/guardian-consent/withdraw/request). Takes the MINOR's
// registered email, NOT the guardian's -- identical to
// ResendGuardianConsentDto, and for the same reasons plus one more:
// Guardian.email has no uniqueness constraint, so a guardian of two
// children could not be resolved to a single record from their address
// alone. See GuardianConsentService.requestWithdrawal() for the full
// reasoning. Validated by main.ts's global ValidationPipe.
export class RequestConsentWithdrawalDto {
  @IsEmail()
  email!: string;
}
