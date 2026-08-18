// No class-validator/class-transformer in services/api's dependencies yet
// (checked package.json before adding this module) and no global
// ValidationPipe wired in main.ts — so, matching B1's own style of doing
// validation by hand rather than reaching for a library mid-PR (see
// refresh-token.store.ts's parseRawToken), this DTO is a plain interface
// and PasswordResetController does its own lightweight shape checks.
// Adding class-validator + a global ValidationPipe is a reasonable follow-up
// but touches main.ts, a file every one of B2/B3/B6 also has a stake in —
// flagged in this module's README rather than done unilaterally here.
export interface ForgotPasswordDto {
  email: string;
}
