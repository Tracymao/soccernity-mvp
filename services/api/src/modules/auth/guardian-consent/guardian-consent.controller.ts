import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../guards/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AccessTokenPayload } from '../token/token.types';
import { AuthRateLimit } from '../rate-limit/auth-rate-limit.decorator';
import { DeclineGuardianConsentDto } from './dto/decline-guardian-consent.dto';
import { GuardianConsentDto } from './dto/guardian-consent.dto';
import { RequestConsentWithdrawalDto } from './dto/request-consent-withdrawal.dto';
import { ResendGuardianConsentDto } from './dto/resend-guardian-consent.dto';
import { WithdrawGuardianConsentDto } from './dto/withdraw-guardian-consent.dto';
import { GuardianConsentService, GuardianConsentStatusResponse } from './guardian-consent.service';

// Build Plan Section 4.1 (Auth Service): POST /auth/guardian-consent.
// No JwtAuthGuard here (unlike /users/* — see users/README.md) — the
// guardian confirming consent is not a Soccernity account holder at
// all; Guardian.consentToken (a server-issued, unguessable UUID) is
// itself the credential, the same trust model /auth/reset-password
// uses for its own token.
//
// Out of scope for this PR: the guardian-facing web page (Section 8.3
// step 4's "plain-language explanation of data collected, with an
// 'I consent' action") that would actually call this endpoint. That's
// a frontend concern for a separate PR — this endpoint is the API
// contract it will call, mirroring how registration.controller.ts
// flagged this same endpoint as out of scope for PR B2.
//
// sprint-1/guardian-consent-decline-withdraw-expiry added the decline and
// two-step withdrawal routes below under exactly the same scoping: API
// contract only. No guardian-facing page for "I do not consent" or
// "withdraw my consent" is built here either — and note that
// apps/web's GuardianConsentConfirmPage.tsx currently models the Figma
// frame's "I do not consent" button as "take no action, with an
// acknowledgement message", precisely BECAUSE no decline endpoint
// existed. That page can now be wired to a real action; doing so is the
// separate frontend ticket.
@Controller('auth')
export class GuardianConsentController {
  constructor(private readonly guardianConsentService: GuardianConsentService) {}

  @Post('guardian-consent')
  @HttpCode(HttpStatus.OK)
  async confirm(@Body() dto: GuardianConsentDto): Promise<{ message: string }> {
    await this.guardianConsentService.confirmConsent(dto.consentToken);
    return { message: 'Guardian consent confirmed.' };
  }

  // DPIA finding R5's re-send path. Rate-limited — an unlimited resend
  // endpoint targeting an arbitrary email address is a spam vector
  // against a guardian's inbox, same class of concern
  // password-reset/password-reset.controller.ts's forgotPassword()
  // already rate-limits. Always the same generic response regardless of
  // whether the email matched a real, pending-consent minor account —
  // see resendConsent()'s own comment for the full non-enumeration
  // reasoning.
  @AuthRateLimit()
  @Post('guardian-consent/resend')
  @HttpCode(HttpStatus.OK)
  async resend(@Body() dto: ResendGuardianConsentDto): Promise<{ message: string }> {
    await this.guardianConsentService.resendConsent(dto.email);
    return { message: 'If that account has a guardian consent request pending, a new email has been sent.' };
  }

  // sprint-1/guardian-consent-decline-withdraw-expiry — the guardian says
  // NO. No guard, same trust model as confirm() above: the consent token
  // is the credential. Rate-limited even though confirm() is not, and
  // deliberately so — brute-forcing a v4 UUID is infeasible either way,
  // but the CONSEQUENCE here is destructive (the minor's account is
  // closed and scheduled for deletion), so this gets the same throttle
  // every other destructive/credential-adjacent auth route in this
  // codebase carries. A real guardian clicking a link once is nowhere
  // near the limit.
  @AuthRateLimit()
  @Post('guardian-consent/decline')
  @HttpCode(HttpStatus.OK)
  async decline(@Body() dto: DeclineGuardianConsentDto): Promise<{ message: string }> {
    await this.guardianConsentService.declineConsent(dto.consentToken);
    return { message: 'Guardian consent declined.' };
  }

  // sprint-1/guardian-consent-decline-withdraw-expiry — step 1 of 2 for a
  // guardian TAKING BACK consent they previously gave. Structurally a
  // twin of resend() above: same minor's-email input, same rate limit,
  // same deliberately generic response whether or not anything matched,
  // and for the same non-enumeration reasons. The withdrawal link itself
  // only ever goes to Guardian.email, so this endpoint reveals nothing
  // and grants nothing to a caller who guessed an address.
  @AuthRateLimit()
  @Post('guardian-consent/withdraw/request')
  @HttpCode(HttpStatus.OK)
  async requestWithdrawal(@Body() dto: RequestConsentWithdrawalDto): Promise<{ message: string }> {
    await this.guardianConsentService.requestWithdrawal(dto.email);
    return {
      message:
        'If that account has confirmed guardian consent, a withdrawal link has been sent to the guardian.',
    };
  }

  // sprint-1/guardian-consent-decline-withdraw-expiry — step 2 of 2.
  // Consumes the single-use Guardian.withdrawalToken from that email and
  // closes the account. Same destructive-consequence reasoning as
  // decline() for the rate limit.
  @AuthRateLimit()
  @Post('guardian-consent/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(@Body() dto: WithdrawGuardianConsentDto): Promise<{ message: string }> {
    await this.guardianConsentService.withdrawConsent(dto.withdrawalToken);
    return { message: 'Guardian consent withdrawn.' };
  }

  // Sprint 1 / sprint-1/f5-f6-missing-endpoints — GET /auth/guardian-consent/status.
  // JwtAuthGuard ONLY, deliberately NOT GuardianConsentGuard — this is the
  // route a restricted-pending minor uses to check WHY they're
  // restricted, so it cannot itself be gated behind the guard that
  // enforces the restriction (see guardian-consent.service.ts's
  // getConsentStatus() and auth/README.md for the full reasoning).
  // `:sub` (the caller's own id, off the verified JWT) is always what's
  // looked up — there is no path param, so this can never be used to read
  // another user's guardian-consent state.
  @UseGuards(JwtAuthGuard)
  @Get('guardian-consent/status')
  async status(@CurrentUser() user: AccessTokenPayload): Promise<GuardianConsentStatusResponse> {
    return this.guardianConsentService.getConsentStatus(user.sub);
  }
}
