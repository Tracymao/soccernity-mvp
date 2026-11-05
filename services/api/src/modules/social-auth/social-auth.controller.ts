import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SkipGlobalWriteLimit } from '../../rate-limit/global-rate-limit.decorators';
import { USER_SESSION_COOKIE, applyCookieSession } from '../../session-cookie/session-cookie';
import { AuthLimit } from '../auth/rate-limit/auth-limits/auth-limits.interceptor';
import { AuthRateLimit } from '../auth/rate-limit/auth-rate-limit.decorator';
import { toRegisterResponse } from '../auth/registration/registration.controller';
import { SocialCallbackDto } from './dto/social-callback.dto';
import { SocialEmailCodeDto, SocialEmailVerifyDto } from './dto/social-email-code.dto';
import { SocialRegisterDto } from './dto/social-register.dto';
import { StartSocialDto } from './dto/start-social.dto';
import { SOCIAL_PROVIDER_UNAVAILABLE_CODE, SocialProvider, isSocialProvider } from './social-auth.constants';
import { SocialAuthService } from './social-auth.service';

// B-084 (Decision Log #378, #468): Google and Facebook sign-in, backend only. Every route is public (a person who is
// signing in has no session yet; the credentials are the single-use state and registration tokens). Nothing here is a
// JwtAuthGuard route, so none of the consent / email / profile guards of write-route-guards.spec.ts applies: it is
// listed there as deliberately open, with the reason.
//
// The routes with a limiter carry @SkipGlobalWriteLimit() (global-rate-limit.coverage.spec.ts requires it): they have
// their own, stricter limits, and a class of children behind one school IP must not share the 30-a-minute writes budget.
@Controller('auth/social')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
export class SocialAuthController {
  constructor(private readonly social: SocialAuthService) {}

  // Which providers are switched on (keys set AND a usable WEB_APP_BASE_URL). The web shows a button for each of these
  // and none for the rest. Nothing is revealed about accounts.
  @Get('providers')
  providers(): { providers: SocialProvider[] } {
    return { providers: this.social.enabledProviders() };
  }

  // Step 1: returns the provider's authorisation URL (state + PKCE challenge included). The web navigates the browser to it.
  @Post(':provider/start')
  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  async start(@Param('provider') provider: string, @Body() dto: StartSocialDto): Promise<{ authorizationUrl: string }> {
    return this.social.start(this.asProvider(provider), dto.staySignedIn === true);
  }

  // Step 2: the web app's redirect page posts what the provider sent back. @AuthLimit('login') is the SAME limiter the
  // password login uses: the per-IP ceiling (60 per 10 minutes) applies, a refused sign-in counts toward it. (The
  // per-account failed-attempt budget is keyed on an email in the body; there is none here and nothing to guess.)
  @Post(':provider/callback')
  @SkipGlobalWriteLimit()
  @AuthLimit('login')
  @HttpCode(HttpStatus.OK)
  async callback(
    @Param('provider') provider: string,
    @Body() dto: SocialCallbackDto,
    @Req() req?: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.social.handleCallback(this.asProvider(provider), dto.code, dto.state);
    switch (result.kind) {
      case 'session':
        // Exactly as POST /auth/login: in cookie mode the refresh token goes into the httpOnly cookie, not the body.
        return {
          status: 'signed_in' as const,
          ...applyCookieSession(USER_SESSION_COOKIE, req, res, result.response, result.persistent),
        };
      case 'two_factor_required':
        // No session and no cookie; POST /auth/login/two-factor finishes it, as after a password.
        return { status: 'two_factor_required' as const, ...result.challenge };
      case 'registration_required':
        return {
          status: 'registration_required' as const,
          socialRegistrationToken: result.socialRegistrationToken,
          profile: result.profile,
        };
    }
  }

  // The provider gave no email: enter one and receive a code. ('email-code' and 'email-code/verify' cannot clash with
  // ':provider/start' and ':provider/callback': the second segment differs.)
  @Post('email-code')
  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  async emailCode(@Body() dto: SocialEmailCodeDto): Promise<{ sent: true }> {
    return this.social.requestEmailCode(dto.socialRegistrationToken, dto.email);
  }

  @Post('email-code/verify')
  @SkipGlobalWriteLimit()
  @AuthRateLimit()
  @HttpCode(HttpStatus.OK)
  async verifyEmailCode(@Body() dto: SocialEmailVerifyDto): Promise<{ email: string; emailVerified: true }> {
    return this.social.verifyEmailCode(dto.socialRegistrationToken, dto.code);
  }

  // Step 3 for a new person: the normal registration, with the token in place of an email and a password. 201 and the
  // same body as POST /auth/register (a session, `user`, and `guardian` for a minor, who is restricted-pending).
  @Post('register')
  @SkipGlobalWriteLimit()
  @AuthLimit('signup')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: SocialRegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res?: Response,
  ) {
    const result = await this.social.completeRegistration(dto, req.ip);
    return applyCookieSession(USER_SESSION_COOKIE, req, res, toRegisterResponse(result), false);
  }

  // An unknown provider is the same 404 as one that is switched off: nothing about which exist is revealed.
  private asProvider(provider: string): SocialProvider {
    if (!isSocialProvider(provider)) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: SOCIAL_PROVIDER_UNAVAILABLE_CODE,
        message: 'This sign-in method is not available.',
      });
    }
    return provider;
  }
}
