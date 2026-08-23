import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthResponse, toAuthUserSummary, toTokenPairResponse, TokenPairResponse } from './auth-response.mapper';
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

  async login(email: string, password: string): Promise<AuthResponse> {
    // Decision Log #16 (Build Plan Section 9): email is stored lowercase
    // on write (registration.service.ts's register()) so matching here
    // must normalize the same way, or a user who registered as
    // "Temi@x.com" (now stored as "temi@x.com") couldn't log back in
    // with the casing they originally typed.
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });

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

    // sprint-1/f5-f6-missing-endpoints: checked AFTER password
    // verification succeeds, deliberately — this distinct message is only
    // ever revealed to someone who already proved they know the correct
    // password, so it doesn't weaken the non-enumeration posture above
    // (an attacker without the real password still only ever sees the
    // generic "Invalid credentials"). A deactivated account gets a
    // specific, actionable message pointing at reactivateAccount() below;
    // pending_deletion deliberately does NOT (see deleteAccount()'s own
    // comment on why that state has no self-service undo in this PR).
    if (user.accountStatus === 'deactivated') {
      throw new UnauthorizedException(
        'This account has been deactivated. Use POST /auth/reactivate-account to restore it.',
      );
    }
    if (user.accountStatus !== 'active') {
      // Covers 'pending_deletion' (and any future non-'active' state) —
      // deliberately the same generic message as a wrong password/email,
      // not a distinct one, since this PR does not build a self-service
      // undo path for pending_deletion.
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokenPair = await this.tokenService.issueTokenPair(user.id, user.role);
    // `user` was already loaded above for password verification — this is
    // response-shaping only, not a new query. See auth-response.mapper.ts's
    // AuthResponse/toAuthUserSummary comments for why isMinor/
    // verificationStatus are safe to include here even though they must
    // never appear inside the access token itself.
    return { ...toTokenPairResponse(tokenPair), user: toAuthUserSummary(user) };
  }

  // POST /auth/change-password. userId comes from the verified JWT
  // (JwtAuthGuard), never a request-body field — a caller can only ever
  // change their own password via this endpoint. Fetches the real,
  // current passwordHash fresh from Postgres (never trusts anything off
  // the JWT beyond sub/role) and reuses PasswordService.verify, the exact
  // same call login() uses, rather than reimplementing argon2 logic.
  //
  // Error posture is deliberately distinct from login()'s: this is an
  // authenticated user who already proved identity via a valid JWT, so
  // there's no enumeration concern the way login's generic error
  // protects against (there's nothing to enumerate — the caller already
  // knows their own account exists). A specific "current password is
  // incorrect" message is fine here; it still never leaks hash internals.
  //
  // Revokes every other active session on success
  // (tokenService.revokeAllSessionsForUser) — a one-line reuse of the
  // exact mechanism logout(allSessions=true) and
  // PasswordResetService.resetPassword already use for the identical
  // "credential changed, kill other sessions" scenario. Deliberately not
  // skipped: a changed password that leaves old sessions valid defeats
  // much of the point of changing it (e.g. after suspecting compromise).
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      // Same rare-but-real "valid access token for a since-deleted
      // account" case JwtAuthGuard's own doc comment and
      // UsersService.getOwnProfile both call out.
      throw new UnauthorizedException('Invalid credentials');
    }

    const currentPasswordValid = await this.passwordService.verify(user.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await this.passwordService.hash(newPassword);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: newPasswordHash } });
    await this.tokenService.revokeAllSessionsForUser(userId);
  }

  // POST /auth/deactivate-account. Requires password re-entry as a
  // confirmation step (a hard requirement, not optional scope) — a bare
  // POST with no re-auth must never be able to deactivate an account.
  // Sets accountStatus = "deactivated" and revokes every existing
  // session: deactivation blocking *future* logins is meaningless if the
  // caller's current still-valid access/refresh tokens keep working, so
  // this is a required consequence, not scope creep.
  async deactivateAccount(userId: string, password: string): Promise<void> {
    const user = await this.assertPasswordCorrect(userId, password);
    await this.prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'deactivated' } });
    await this.tokenService.revokeAllSessionsForUser(userId);
  }

  // POST /auth/delete-account. Same password-re-entry requirement as
  // deactivateAccount. Sets accountStatus = "pending_deletion" —
  // deliberately does NOT hard-delete the User row (a hard requirement
  // from this PR's brief): this is a minors' data platform with real
  // GDPR/NDPA implications (see CLAUDE.md's safeguarding non-negotiables
  // and this project's DPIA history), and retention/erasure policy is
  // explicitly NOT decided here — see auth/README.md's Decision Log
  // candidate. This is deliberately incomplete pending that decision, not
  // a true delete, and the naming/response must never imply otherwise to
  // a caller. Revokes every session, same reasoning as deactivation.
  async deleteAccount(userId: string, password: string): Promise<void> {
    const user = await this.assertPasswordCorrect(userId, password);
    await this.prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'pending_deletion' } });
    await this.tokenService.revokeAllSessionsForUser(userId);
  }

  // POST /auth/reactivate-account. Unauthenticated (a deactivated
  // account's existing tokens are already revoked by deactivateAccount()
  // above, so there is no JWT to gate this behind) — same
  // credential-verification trust level and timing-safety posture as
  // login() itself, including the same fixed dummy-hash comparison so an
  // unknown email takes the same real argon2id work as a known one.
  //
  // Only a genuinely "deactivated" account is flipped back to "active"
  // and issued a fresh token pair — effectively "log in, but first
  // un-deactivate." An already-"active" account with correct credentials
  // is treated as a plain, no-state-change login (this endpoint is a
  // strict superset of login() for that case, not an error) rather than
  // rejected, since there's no reason to punish a caller who didn't
  // realize reactivation wasn't necessary. A "pending_deletion" account
  // is explicitly NOT reactivated by this endpoint — rejected with the
  // same generic "Invalid credentials" an unknown email/wrong password
  // gets, deliberately not a distinct message, since this PR builds no
  // self-service undo path for a deletion request and doesn't want to
  // even confirm to an unauthenticated caller that the account exists in
  // that state. Whether a deletion request should ever have a
  // self-service undo window at all is exactly the open question this
  // PR's Decision Log candidate raises — see auth/README.md.
  async reactivateAccount(email: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const hashToCheck = user?.passwordHash ?? this.dummyPasswordHash;
    const passwordValid = await this.passwordService.verify(hashToCheck, password);

    if (!user || !passwordValid || user.accountStatus === 'pending_deletion') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeUser =
      user.accountStatus === 'deactivated'
        ? await this.prisma.user.update({ where: { id: user.id }, data: { accountStatus: 'active' } })
        : user;

    const tokenPair = await this.tokenService.issueTokenPair(activeUser.id, activeUser.role);
    return { ...toTokenPairResponse(tokenPair), user: toAuthUserSummary(activeUser) };
  }

  // Shared re-auth step for deactivateAccount/deleteAccount: both require
  // the caller to re-enter their current password as a confirmation
  // gate, verified fresh against Postgres (never trusting anything off
  // the JWT beyond sub/role, same non-negotiable changePassword() above
  // follows).
  private async assertPasswordCorrect(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const passwordValid = await this.passwordService.verify(user.passwordHash, password);
    if (!passwordValid) {
      throw new UnauthorizedException('Incorrect password');
    }
    return user;
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
