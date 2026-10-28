import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { USER_SESSION_COOKIE, applyCookieSession } from '../../../session-cookie/session-cookie';
import { toAuthUserSummary, toTokenPairResponse } from '../auth-response.mapper';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { AuthLimit } from '../rate-limit/auth-limits/auth-limits.interceptor';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import {
  RESEND_VERIFICATION_GENERIC_MESSAGE,
  ResendVerificationService,
} from './email-verification/resend-verification.service';
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
  constructor(
    private readonly registrationService: RegistrationService,
    private readonly resendVerificationService: ResendVerificationService,
  ) {}

  // security/auth-limits-shared-networks: 30 per 10 minutes per IP (a class signing up together), replacing
  // the shared 5-per-60s auth throttler on this route only; resend-verification-email below keeps it.
  @Post('register')
  @AuthLimit('signup')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    // req.ip is read here and passed on for one transient GeoLite2 lookup. It
    // is deliberately not stored or logged anywhere (B-024, Decision Log #368).
    const result = await this.registrationService.register(dto, req.ip);
    // B-245: in cookie mode the refresh token goes into the cookie (session cookie -- register has
    // no "stay signed in" choice) and is omitted from the body; otherwise unchanged.
    return applyCookieSession(USER_SESSION_COOKIE, req, res, toRegisterResponse(result), false);
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

  // B-128 (Decision Log #406 item 3, #37): send a fresh verification link.
  // Unauthenticated, keyed by email, per-IP throttled by @AuthRateLimit() and
  // per-account capped inside the service. ONE response for every outcome (no
  // such account, already verified, closed account, over the cap), so the route
  // cannot be used to find out which addresses are registered.
  @Post('resend-verification-email')
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  async resendVerificationEmail(@Body() dto: ResendVerificationDto): Promise<{ message: string }> {
    await this.resendVerificationService.resend(dto.email);
    return { message: RESEND_VERIFICATION_GENERIC_MESSAGE };
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
  const { user, dateOfBirth, guardian, tokens } = result;
  return {
    // A freshly registered minor's guardian row is always 'pending' (B-030).
    user: toAuthUserSummary(user, dateOfBirth, guardian?.consentStatus ?? null),
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
