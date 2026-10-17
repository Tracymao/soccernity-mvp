import { IsNotEmpty, IsString } from 'class-validator';

// B-029 (Decision Log #372): POST /auth/guardian-consent/report-incorrect-details.
// Same field name and shape as GuardianConsentDto / DeclineGuardianConsentDto --
// the guardian is acting on the one consent token they were emailed.
//
// Deliberately NOTHING else: no free-text note and no "the correct date of
// birth is ...". The caller is an unauthenticated token holder; collecting a
// child's real DOB or a free-text description from them would add personal
// data the flag does not need (support contacts the guardian at the address on
// file). `forbidNonWhitelisted` on the global ValidationPipe rejects any extra
// key, so a client cannot smuggle one in.
export class ReportIncorrectDetailsDto {
  @IsString()
  @IsNotEmpty()
  consentToken!: string;
}
