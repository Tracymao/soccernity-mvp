import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AdminUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE } from '../two-factor/two-factor.constants';
import { AdminEnrolmentRequired, TwoFactorChallenge, TwoFactorService } from '../two-factor/two-factor.service';
import { PasswordService } from '../auth/password/password.service';
import { InvalidRefreshTokenError, RefreshTokenReuseDetectedError } from '../auth/token/token.errors';
import {
  AdminAuthResponse,
  AdminTokenPairResponse,
  toAdminSummary,
  toAdminTokenPairResponse,
} from './admin-response.mapper';
import { AdminTokenService } from './token/admin-token.service';

// Sprint 2 / sprint-2/admin-console-account-entity (Decision Log #54) —
// the Admin Console's own login/refresh/logout/change-password service,
// mirroring services/api/src/modules/auth/auth.service.ts's structure and
// security posture closely (same non-enumeration / constant-time /
// revoke-on-change-password discipline — none of that is User-specific,
// it's just sound auth practice), but operating on AdminUser end to end,
// never User. See admin-token.service.ts's header comment for why this
// is a genuinely separate implementation rather than a reuse of
// AuthService.
@Injectable()
export class AdminAuthService implements OnModuleInit {
  // Fixed-cost dummy hash so an unknown-email login takes roughly the
  // same argon2id work as a real one — identical reasoning to
  // AuthService's own dummyPasswordHash.
  private dummyPasswordHash!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly adminTokenService: AdminTokenService,
    // backend/b086-two-factor (B-086, B-270): the second step of admin sign-in, and the enrolment gate.
    private readonly twoFactor: TwoFactorService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.passwordService.hash(randomBytes(32).toString('hex'));
  }

  // POST /admin/auth/login. No dedicated rate-limiting is applied to this
  // route in this PR — flagged, not silently skipped, see
  // admin/README.md's Decision Log candidate note (reusing the shared
  // 'auth' named Throttler config via @AuthRateLimit() on
  // admin-auth.controller.ts's login handler was considered and is the
  // recommended follow-up; it was left out of this PR specifically to
  // keep this PR's own verification scope to schema + auth-isolation +
  // CRUD, not because it's an intentional security choice to skip it
  // forever).
  //
  // backend/b086-two-factor (B-086, B-270; Decision Log #446). After the password and the account status, one of three
  // things happens, and only the third issues a session:
  //   1. the admin HAS two-factor on        -> 200 { twoFactorRequired, challengeToken, ... }, finished by
  //                                            POST /admin/auth/login/two-factor
  //   2. no two-factor and ADMIN_2FA_ENFORCED is "true" -> 200 { twoFactorEnrolmentRequired, enrolmentToken, ... },
  //                                            finished by POST /admin/auth/login/two-factor/enrol/{start,confirm}.
  //                                            No grace period: there is no way to a session without enrolling.
  //   3. no two-factor and enforcement off  -> the session, as before (the default until the admin screens exist).
  // Sessions that already exist when ADMIN_2FA_ENFORCED is switched on are ended at their next REFRESH (see
  // refreshSession); a peer reset ends the target's sessions, so a reset admin faces the gate at the next sign-in.
  async login(
    email: string,
    password: string,
    persistent = false,
  ): Promise<AdminAuthResponse | TwoFactorChallenge | AdminEnrolmentRequired> {
    // Same case-insensitive-email convention Decision Log #16 established
    // for User — email is expected to be stored lowercase (see
    // updateOwnProfile's normalization) so matching here must normalize
    // the same way.
    const admin = await this.prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });

    const hashToCheck = admin?.passwordHash ?? this.dummyPasswordHash;
    const passwordValid = await this.passwordService.verify(hashToCheck, password);

    if (!admin || !passwordValid) {
      // Deliberately generic — never reveal whether the email or the
      // password was the wrong part, same non-enumeration posture
      // AuthService.login() uses.
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.accountStatus !== 'active') {
      // Covers 'deactivated' and any future non-'active' state. No
      // self-service reactivation path exists for AdminUser in this PR
      // (see schema.prisma's own comment on AdminUser.accountStatus) —
      // deliberately the same generic message as a wrong password, not a
      // distinct one, since there is nothing actionable to tell an
      // unauthenticated caller here.
      throw new UnauthorizedException('Invalid credentials');
    }

    if (admin.totpEnabledAt) {
      return this.twoFactor.issueChallenge('admin', admin.id, persistent);
    }
    if (this.twoFactor.isAdminEnforced()) {
      return this.twoFactor.issueAdminEnrolmentToken(admin.id, persistent);
    }

    return this.buildAuthResponse(admin, persistent);
  }

  // POST /admin/auth/login/two-factor -- an admin with two-factor on finishes sign-in with an authenticator code or a
  // backup code. The challenge is an ADMIN one: a user challenge (a different Redis namespace) is not found here.
  async completeTwoFactorLogin(
    challengeToken: string,
    code: string,
  ): Promise<{ response: AdminAuthResponse; persistent: boolean }> {
    const done = await this.twoFactor.completeChallenge('admin', challengeToken, code);
    const admin = await this.prisma.adminUser.findUnique({ where: { id: done.subjectId } });
    if (!admin || admin.accountStatus !== 'active') throw new UnauthorizedException('Invalid credentials');
    return { response: await this.buildAuthResponse(admin, done.persistent), persistent: done.persistent };
  }

  // POST /admin/auth/login/two-factor/enrol/confirm -- the first valid code enrols the admin AND finishes sign-in; the
  // 10 backup codes come back once, alongside the session.
  async completeEnrolmentLogin(
    enrolmentToken: string,
    code: string,
  ): Promise<{ response: AdminAuthResponse; persistent: boolean; backupCodes: string[] }> {
    const done = await this.twoFactor.confirmAdminEnrolmentWithToken(enrolmentToken, code);
    const admin = await this.prisma.adminUser.findUnique({ where: { id: done.adminId } });
    if (!admin || admin.accountStatus !== 'active') throw new UnauthorizedException('Invalid credentials');
    return {
      response: await this.buildAuthResponse(admin, done.persistent),
      persistent: done.persistent,
      backupCodes: done.backupCodes,
    };
  }

  private async buildAuthResponse(admin: AdminUser, persistent: boolean): Promise<AdminAuthResponse> {
    const tokenPair = await this.adminTokenService.issueTokenPair(admin.id, admin.role, persistent);
    return { ...toAdminTokenPairResponse(tokenPair), admin: toAdminSummary(admin) };
  }

  async refresh(refreshToken: string): Promise<AdminTokenPairResponse> {
    return (await this.refreshSession(refreshToken)).response;
  }

  // B-245: refresh() plus the session's "Stay signed in" flag, for the cookie-mode controller.
  async refreshSession(
    refreshToken: string,
  ): Promise<{ response: AdminTokenPairResponse; persistent: boolean }> {
    try {
      const tokenPair = await this.adminTokenService.rotateRefreshToken(refreshToken);
      await this.assertEnrolledWhenEnforced(tokenPair.accessToken.token);
      return { response: toAdminTokenPairResponse(tokenPair), persistent: tokenPair.persistent };
    } catch (error) {
      if (error instanceof RefreshTokenReuseDetectedError) {
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

  // backend/b086-two-factor-followups (founder decision 2026-10-31: block at next refresh). With ADMIN_2FA_ENFORCED
  // "true", an admin whose session predates the switch and who has no two-factor cannot keep refreshing it: the
  // refresh is a coded 401 and ALL of that admin's sessions end. It runs AFTER rotation on purpose: the refresh token
  // is validated and consumed first (a bad or replayed token is the ordinary 401 and touches no account), the admin's
  // identity comes from the token that was actually consumed, and revoking the whole family then also removes the
  // replacement just issued -- it was never returned, so no usable refresh token is left behind. Off (anything but
  // the literal "true") costs no query. Access tokens already issued stay valid until they expire (15 minutes by
  // default); there is deliberately no per-request database check.
  private async assertEnrolledWhenEnforced(newAccessToken: string): Promise<void> {
    if (!this.twoFactor.isAdminEnforced()) return;
    const { sub: adminId } = this.adminTokenService.verifyAccessToken(newAccessToken);
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId }, select: { totpEnabledAt: true } });
    // No row: the account was removed; nothing to gate (unchanged behaviour).
    if (!admin || admin.totpEnabledAt) return;
    await this.adminTokenService.revokeAllSessionsForAdmin(adminId);
    throw new UnauthorizedException({
      statusCode: 401,
      error: 'Unauthorized',
      code: ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE,
      message: 'Two-factor enrolment is required.',
    });
  }

  // Single-session logout always happens. `allSessions` additionally
  // wipes every other active session for the acting admin — mirrors
  // AuthService.logout()'s exact shape.
  async logout(refreshToken: string | undefined, allSessions: boolean, accessToken?: string): Promise<void> {
    if (refreshToken) await this.adminTokenService.revokeRefreshToken(refreshToken);

    if (!allSessions) {
      return;
    }

    if (!accessToken) {
      throw new UnauthorizedException(
        'A valid access token is required to log out of all sessions',
      );
    }
    const { sub: adminId } = this.adminTokenService.verifyAccessToken(accessToken);
    await this.adminTokenService.revokeAllSessionsForAdmin(adminId);
  }

  // POST /admin/auth/change-password. adminId comes from the verified
  // admin JWT (AdminJwtAuthGuard), never a request-body field. Revokes
  // every other active session on success, same "credential changed, kill
  // other sessions" reasoning AuthService.changePassword() uses.
  async changePassword(adminId: string, currentPassword: string, newPassword: string): Promise<void> {
    const admin = await this.prisma.adminUser.findUnique({ where: { id: adminId } });
    if (!admin) {
      // Same rare-but-real "valid access token for a since-removed admin
      // account" case JwtAuthGuard's own doc comment calls out for User.
      throw new UnauthorizedException('Invalid credentials');
    }

    const currentPasswordValid = await this.passwordService.verify(admin.passwordHash, currentPassword);
    if (!currentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await this.passwordService.hash(newPassword);
    await this.prisma.adminUser.update({ where: { id: adminId }, data: { passwordHash: newPasswordHash } });
    await this.adminTokenService.revokeAllSessionsForAdmin(adminId);
  }
}
