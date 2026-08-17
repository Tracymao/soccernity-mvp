import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { toTokenPairResponse, TokenPairResponse } from './auth-response.mapper';
import { PasswordService } from './password/password.service';
import { InvalidRefreshTokenError, RefreshTokenReuseDetectedError } from './token/token.errors';
import { TokenService } from './token/token.service';

// Sprint 1 / PR B3 — POST /auth/login, refresh, logout. Section 4.1 lists
// /auth/login but not a refresh or logout path explicitly; both are
// required by Section 5.7's "rotated on every use, revocable server-side"
// spec (and B1 built TokenService/RefreshTokenStore anticipating exactly
// this), so this PR adds them as the concrete build-out of that spec.
// Flagging per CLAUDE.md: this is a Decision Log / Section 4 addition
// candidate, not a silent deviation — see the PR report.
@Injectable()
export class AuthService implements OnModuleInit {
  // Fixed-cost dummy hash so an unknown-email login takes roughly the same
  // argon2id work as a real one, denying a timing side-channel on top of
  // the already-generic error message. Generated once at startup from
  // random bytes (never a guessable constant string).
  private dummyPasswordHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordService.hash(randomBytes(32).toString('hex'));
  }

  async login(email: string, password: string): Promise<TokenPairResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Verify against a real hash when the user exists, and against the
    // fixed dummy hash otherwise — never skip the argon2 call, and never
    // branch the response on which case happened.
    const hashToCheck = user?.passwordHash ?? this.dummyPasswordHash;
    const passwordValid = await this.passwordService.verify(hashToCheck, password);

    if (!user || !passwordValid) {
      // Deliberately generic per the non-negotiable in the task spec: never
      // reveal whether the email or the password was the wrong part.
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokenPair = await this.tokenService.issueTokenPair(user.id, user.role);
    return toTokenPairResponse(tokenPair);
  }

  async refresh(refreshToken: string): Promise<TokenPairResponse> {
    try {
      const tokenPair = await this.tokenService.rotateRefreshToken(refreshToken);
      return toTokenPairResponse(tokenPair);
    } catch (error) {
      if (error instanceof RefreshTokenReuseDetectedError) {
        // The store has already revoked the whole family by this point
        // (see refresh-token.store.ts's verifyAndConsume) — surface a 401,
        // not a 500, so the client knows to send the user back to login.
        throw new UnauthorizedException(
          'Refresh token reuse detected; all sessions in this family have been revoked',
        );
      }
      if (error instanceof InvalidRefreshTokenError) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }
      throw error;
    }
  }

  // Single-session logout always happens. `allSessions` additionally wipes
  // every other active session for the acting user — that requires proof
  // of identity, which we get from a still-valid access token rather than
  // by reimplementing RefreshTokenStore's token-decoding logic here (the
  // README is explicit: callers should depend on TokenService, not
  // RefreshTokenStore, directly).
  async logout(refreshToken: string, allSessions: boolean, accessToken?: string): Promise<void> {
    await this.tokenService.revokeRefreshToken(refreshToken);

    if (!allSessions) {
      return;
    }

    if (!accessToken) {
      throw new UnauthorizedException(
        'A valid access token is required to log out of all sessions',
      );
    }
    const { sub: userId } = this.tokenService.verifyAccessToken(accessToken);
    await this.tokenService.revokeAllSessionsForUser(userId);
  }
}
