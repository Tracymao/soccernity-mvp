import { IsNotEmpty, IsString } from 'class-validator';

// sprint-1/guardian-consent-decline-withdraw-expiry
// (POST /auth/guardian-consent/withdraw). Carries the freshly-issued
// Guardian.withdrawalToken from the withdrawal email -- a SEPARATE
// credential from consentToken, deliberately named differently here so a
// frontend cannot accidentally post a consent token to the withdrawal
// endpoint (or vice versa) and have it silently accepted. Validated by
// main.ts's global ValidationPipe.
export class WithdrawGuardianConsentDto {
  @IsString()
  @IsNotEmpty()
  withdrawalToken!: string;
}
