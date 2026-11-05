import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthResponse } from '../auth/auth-response.mapper';
import { AuthService } from '../auth/auth.service';
import { RegisterDto } from '../auth/registration/dto/register.dto';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { buildWebAppLink } from '../auth/registration/email/web-app-link.util';
import { RegisterResult, RegistrationService } from '../auth/registration/registration.service';
import { TwoFactorChallenge } from '../two-factor/two-factor.service';
import { SocialRegisterDto } from './dto/social-register.dto';
import { SocialAuthClient, SocialProfile } from './social-auth.client';
import {
  SOCIAL_AUTH_FAILED_CODE,
  SOCIAL_EMAIL_CODE_INVALID_CODE,
  SOCIAL_EMAIL_CODE_RATE_LIMITED_CODE,
  SOCIAL_EMAIL_NOT_NEEDED_CODE,
  SOCIAL_EMAIL_REQUIRED_CODE,
  SOCIAL_PROVIDER_UNAVAILABLE_CODE,
  SOCIAL_PROVIDERS,
  SOCIAL_REGISTRATION_INVALID_CODE,
  SocialProvider,
} from './social-auth.constants';
import { SocialAuthStateStore, SocialRegistrationPayload, SocialRegistrationStore } from './social-auth.stores';

// What the callback decided. The controller turns it into the HTTP body and, for a session, the cookie.
export type SocialCallbackResult =
  | { kind: 'session'; response: AuthResponse; persistent: boolean }
  | { kind: 'two_factor_required'; challenge: TwoFactorChallenge }
  | {
      kind: 'registration_required';
      socialRegistrationToken: string;
      profile: { displayName: string; email: string | null; emailVerified: boolean; needsEmail: boolean };
    };

// B-084 (Decision Log #378, #468). Social sign-in with Google and Facebook, built behind configuration. The rules (and
// the adopted defaults a)-e)) are in README.md; the short version:
//
//  - A provider is enabled only when its keys are set. Off = every endpoint of it answers 404 and nothing else changes.
//  - A known identity signs in through AuthService.signInVerifiedUser -- the SAME code the password login uses after
//    the password check -- so the status checks, the two-factor challenge and the session are not copied.
//  - A NEW person does not get an account at the callback. They get a short-lived registration token and finish the
//    normal registration (Age Gate DOB, guardian flow, country, club) through RegistrationService.register, which
//    skips only the password. The provider's date of birth is never requested and never trusted.
//  - An existing account is linked automatically ONLY for Google, with a provider-verified email AND a verified,
//    active existing account. Facebook never links automatically. Everything else is indistinguishable from "new
//    person" and ends, at the last step, in one generic answer.
@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: SocialAuthClient,
    private readonly states: SocialAuthStateStore,
    private readonly registrations: SocialRegistrationStore,
    private readonly auth: AuthService,
    private readonly registration: RegistrationService,
    private readonly emailService: RegistrationEmailService,
    private readonly config: ConfigService,
  ) {}

  // The page on the web app the provider sends the browser back to; the web posts `code` and `state` from it to the
  // callback endpoint. Null when WEB_APP_BASE_URL is unusable, in which case no provider is enabled.
  redirectUri(provider: SocialProvider): string | null {
    return buildWebAppLink(this.config.get<string>('WEB_APP_BASE_URL'), `/auth/social/${provider}/callback`, {});
  }

  isEnabled(provider: SocialProvider): boolean {
    return this.client.isConfigured(provider) && this.redirectUri(provider) !== null;
  }

  enabledProviders(): SocialProvider[] {
    return SOCIAL_PROVIDERS.filter((p) => this.isEnabled(p));
  }

  // POST /auth/social/:provider/start
  async start(provider: SocialProvider, staySignedIn: boolean): Promise<{ authorizationUrl: string }> {
    const redirectUri = this.requireEnabled(provider);
    const { state, codeChallenge } = await this.states.issue(provider, staySignedIn);
    return { authorizationUrl: this.client.buildAuthorizationUrl(provider, { state, codeChallenge, redirectUri }) };
  }

  // POST /auth/social/:provider/callback
  async handleCallback(provider: SocialProvider, code: string, state: string): Promise<SocialCallbackResult> {
    const redirectUri = this.requireEnabled(provider);

    // A missing, expired, spent or other-provider state is the same failure as a provider error: say nothing more.
    const saved = await this.states.consume(state);
    if (!saved || saved.provider !== provider) throw this.authFailed();

    let profile: SocialProfile;
    try {
      profile = await this.client.exchangeCode(provider, { code, codeVerifier: saved.codeVerifier, redirectUri });
    } catch (err) {
      // Class and message only: the provider's responses carry the person's profile and the request carried the code.
      this.logger.warn(`[social-auth] ${provider} code exchange failed: ${(err as Error).message}`);
      throw this.authFailed();
    }
    if (profile.provider !== provider || !profile.providerAccountId) throw this.authFailed();

    // 1. Already linked: sign in.
    const identity = await this.prisma.socialIdentity.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
      include: { user: true },
    });
    if (identity) return this.signIn(identity.user, saved.persistent);

    // 2. Google only: a provider-verified email that matches a VERIFIED, ACTIVE existing account links it. The
    // existing account's own email must be verified so an address someone merely typed at registration (unproven)
    // can never be claimed by whoever later signs in with Google using that address.
    if (provider === 'google' && profile.email && profile.emailVerified) {
      const existing = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (existing && existing.verificationStatus === 'verified' && existing.accountStatus === 'active') {
        const linked = await this.link(existing, profile);
        return this.signIn(linked, saved.persistent);
      }
    }

    // 3. Everything else -- including every case where the email already has an account that was not linked above --
    // is the same answer as a new person: a registration token. A taken email only shows at the last step, as one
    // generic message that names no cause.
    const payload: SocialRegistrationPayload = {
      provider,
      providerAccountId: profile.providerAccountId,
      displayName: profile.displayName,
      email: profile.email,
      emailVerified: profile.emailVerified,
    };
    const socialRegistrationToken = await this.registrations.issue(payload);
    return {
      kind: 'registration_required',
      socialRegistrationToken,
      profile: {
        displayName: payload.displayName,
        email: payload.email,
        emailVerified: payload.emailVerified,
        needsEmail: payload.email === null,
      },
    };
  }

  // POST /auth/social/email-code -- the provider gave no email. Sends a one-time code to the address typed. The answer
  // is the same whether or not that address already has an account (the account check happens at the last step).
  async requestEmailCode(token: string, email: string): Promise<{ sent: true }> {
    const payload = await this.requirePayload(token);
    if (payload.email !== null) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: SOCIAL_EMAIL_NOT_NEEDED_CODE,
        message: 'This sign-in already has an email address.',
      });
    }
    const normalised = email.trim().toLowerCase();
    const code = await this.registrations.startEmailCode(token, normalised);
    if (code === null) {
      throw new HttpException(
        {
          statusCode: 429,
          error: 'Too Many Requests',
          code: SOCIAL_EMAIL_CODE_RATE_LIMITED_CODE,
          message: 'Too many codes have been requested. Start again from the sign-in page.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    void this.emailService.sendSocialEmailCodeEmail(normalised, code).catch((err: Error) => {
      this.logger.warn(`[social-auth] could not queue the email-code email: ${err.message}`);
    });
    return { sent: true };
  }

  // POST /auth/social/email-code/verify -- on success the SAME token now carries a verified email.
  async verifyEmailCode(token: string, code: string): Promise<{ email: string; emailVerified: true }> {
    const payload = await this.requirePayload(token);
    if (payload.email !== null) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: SOCIAL_EMAIL_NOT_NEEDED_CODE,
        message: 'This sign-in already has an email address.',
      });
    }
    const checked = await this.registrations.checkEmailCode(token, code);
    // A wrong code, an expired one and one that used up its attempts are the same answer.
    if (checked.result !== 'ok' || !checked.email) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: SOCIAL_EMAIL_CODE_INVALID_CODE,
        message: 'That code did not work. Check it, or ask for a new one.',
      });
    }
    await this.registrations.replace(token, { ...payload, email: checked.email, emailVerified: true });
    return { email: checked.email, emailVerified: true };
  }

  // POST /auth/social/register -- the registration steps, with a token in place of an email and a password. All the
  // age, guardian, country, club and session logic is RegistrationService.register's own.
  async completeRegistration(dto: SocialRegisterDto, clientIp?: string): Promise<RegisterResult> {
    const payload = await this.requirePayload(dto.socialRegistrationToken);
    if (payload.email === null) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: SOCIAL_EMAIL_REQUIRED_CODE,
        message: 'Add and verify an email address first.',
      });
    }

    const registerDto = Object.assign(new RegisterDto(), {
      email: payload.email,
      // A random value nobody ever sees: the account gets an argon2id hash of it, so no password sign-in can succeed
      // until the person sets one through forgot-password. register() hashes it exactly as it hashes a real password.
      password: randomBytes(48).toString('base64url'),
      displayName: dto.displayName?.trim() || payload.displayName,
      dateOfBirth: dto.dateOfBirth,
      guardian: dto.guardian,
      clubId: dto.clubId,
      countryCode: dto.countryCode,
    } satisfies Omit<RegisterDto, 'phone'>);

    const result = await this.registration.register(registerDto, clientIp, {
      provider: payload.provider,
      providerAccountId: payload.providerAccountId,
      emailVerified: payload.emailVerified,
    });

    // Single use. The token is spent only after the account exists, so a validation slip (a mistyped date of birth) does
    // not burn it; a replay after success cannot create a second account because the email and the provider identity
    // are both unique.
    await this.registrations.discard(dto.socialRegistrationToken).catch((err: Error) => {
      this.logger.warn(`[social-auth] could not discard a spent registration token: ${err.message}`);
    });
    return result;
  }

  // ---------------------------------------------------------------------------------------------------------------

  private requireEnabled(provider: SocialProvider): string {
    const redirectUri = this.redirectUri(provider);
    if (!this.client.isConfigured(provider) || redirectUri === null) {
      throw new NotFoundException({
        statusCode: 404,
        error: 'Not Found',
        code: SOCIAL_PROVIDER_UNAVAILABLE_CODE,
        message: 'This sign-in method is not available.',
      });
    }
    return redirectUri;
  }

  private authFailed(): UnauthorizedException {
    return new UnauthorizedException({
      statusCode: 401,
      error: 'Unauthorized',
      code: SOCIAL_AUTH_FAILED_CODE,
      message: 'Social sign-in did not work. Try again, or sign in with your email and password.',
    });
  }

  private async requirePayload(token: string): Promise<SocialRegistrationPayload> {
    const payload = await this.registrations.peek(token);
    if (!payload) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: SOCIAL_REGISTRATION_INVALID_CODE,
        message: 'This sign-in has expired. Start again from the sign-in page.',
      });
    }
    return payload;
  }

  // Same refusals, same two-factor challenge, same session as a password login (AuthService.signInVerifiedUser).
  private async signIn(user: User, persistent: boolean): Promise<SocialCallbackResult> {
    const result = await this.auth.signInVerifiedUser(user, persistent);
    if ('twoFactorRequired' in result) return { kind: 'two_factor_required', challenge: result };
    return { kind: 'session', response: result, persistent };
  }

  private async link(user: User, profile: SocialProfile): Promise<User> {
    try {
      await this.prisma.socialIdentity.create({
        data: { provider: profile.provider, providerAccountId: profile.providerAccountId, userId: user.id },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Linked in the meantime. Fine if it was linked to THIS account (a double click); otherwise refuse.
        const now = await this.prisma.socialIdentity.findUnique({
          where: { provider_providerAccountId: { provider: profile.provider, providerAccountId: profile.providerAccountId } },
        });
        if (now?.userId !== user.id) throw this.authFailed();
      } else {
        throw err;
      }
    }
    return user;
  }
}
