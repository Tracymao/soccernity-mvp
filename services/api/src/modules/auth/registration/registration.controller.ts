import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { toAuthUserSummary, toTokenPairResponse } from '../auth-response.mapper';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RegisterResult, RegistrationService } from './registration.service';

// Build Plan Section 4.1 (Auth Service): POST /auth/register and
// POST /auth/verify-email. POST /auth/guardian-consent (also listed in
// Section 4.1) is a distinct, guardian-facing endpoint — out of this PR's
// scope; the Guardian row and its consentToken this controller creates
// are consumed by that endpoint, built in PR B5 — see
// ../guardian-consent/guardian-consent.controller.ts.
//
// ValidationPipe is applied at the controller level (not globally in
// main.ts) so this PR doesn't contend with B3/B4/B6's parallel auth PRs
// over a shared main.ts edit — see this PR's report for the same
// reasoning CLAUDE.md/the task brief applies to app.module.ts.
@Controller('auth')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post('register')
  @AuthRateLimit()
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterDto) {
    const result = await this.registrationService.register(dto);
    return toRegisterResponse(result);
  }

  // Decision Log #38: `guardianConsentStatus` is additive alongside the
  // pre-existing `verified`/`userId` fields, not a replacement for either
  // — see RegistrationService.VerifyEmailResult's own comment for the
  // full shape/value reasoning. This lets a minor's own frontend
  // (VerifyEmailPage.tsx) tell a fully-verified user apart from a
  // verified-but-still-restricted-pending one without a second
  // round-trip to GET /auth/guardian-consent/status.
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const { userId, guardianConsentStatus } = await this.registrationService.verifyEmail(dto.token);
    return { verified: true, userId, guardianConsentStatus };
  }
}

// Explicit response shaping — never spread the raw Prisma User (would
// leak passwordHash) or Guardian row (would leak consentToken; the
// guardian, not the registrant, receives that via the consent email).
//
// `user` and the token fields now come from auth-response.mapper.ts's
// shared toAuthUserSummary()/toTokenPairResponse() — the same functions
// POST /auth/login uses — instead of a second, independently-maintained
// field list and a nested `accessToken: { token, expiresIn }` shape. See
// auth/README.md's "response shape reconciliation" note for why these two
// endpoints intentionally return the identical token/user shape now.
function toRegisterResponse(result: RegisterResult) {
  const { user, guardian, tokens } = result;
  return {
    user: toAuthUserSummary(user),
    guardian: guardian
      ? {
          id: guardian.id,
          name: guardian.name,
          email: guardian.email,
          relationship: guardian.relationship,
          consentStatus: guardian.consentStatus,
        }
      : null,
    ...toTokenPairResponse(tokens),
  };
}
