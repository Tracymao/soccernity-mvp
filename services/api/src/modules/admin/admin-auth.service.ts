import { Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
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
  async login(email: string, password: string): Promise<AdminAuthResponse> {
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

    const tokenPair = await this.adminTokenService.issueTokenPair(admin.id, admin.role);
    return { ...toAdminTokenPairResponse(tokenPair), admin: toAdminSummary(admin) };
  }

  async refresh(refreshToken: string): Promise<AdminTokenPairResponse> {
    try {
      const tokenPair = await this.adminTokenService.rotateRefreshToken(refreshToken);
      return toAdminTokenPairResponse(tokenPair);
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

  // Single-session logout always happens. `allSessions` additionally
  // wipes every other active session for the acting admin — mirrors
  // AuthService.logout()'s exact shape.
  async logout(refreshToken: string, allSessions: boolean, accessToken?: string): Promise<void> {
    await this.adminTokenService.revokeRefreshToken(refreshToken);

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
