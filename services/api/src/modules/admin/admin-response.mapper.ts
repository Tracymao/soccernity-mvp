import { AdminUser } from '@prisma/client';
import { AdminTokenPair } from './token/admin-token.types';

// Mirrors services/api/src/modules/auth/auth-response.mapper.ts's
// TokenPairResponse exactly, for the AdminUser side. Kept deliberately
// narrow for the same reason: POST /admin/auth/refresh only ever has a
// refresh token to work with, no re-verified AdminUser row loaded.
export interface AdminTokenPairResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export function toAdminTokenPairResponse(pair: AdminTokenPair): AdminTokenPairResponse {
  return {
    accessToken: pair.accessToken.token,
    accessTokenExpiresIn: pair.accessToken.expiresIn,
    refreshToken: pair.refreshToken.token,
    refreshTokenExpiresAt: pair.refreshToken.expiresAt.toISOString(),
  };
}

// The HTTP-facing shape of an AdminUser row — explicit response shaping,
// never a spread of the raw Prisma AdminUser: never leak `passwordHash`.
// Matches the four fields the Admin Profile Figma screen shows (Full
// name, Email, Role, Phone) plus accountStatus/createdAt/updatedAt for
// completeness, the same "fresh DB read, safe to show the caller their
// own current state" posture toAuthUserSummary() already established for
// the User side.
export interface AdminSummary {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  accountStatus: string;
  // B-280: the admin's OWN child-safety-vetting state, so the Admin Console knows whether to show the
  // child-safety-vetted-only sections (for example "Guardian notices"). Sent only about the caller themselves
  // (login, GET /admin/profile); never about another admin in this shape.
  childSafetyVetted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function toAdminSummary(admin: AdminUser): AdminSummary {
  return {
    id: admin.id,
    email: admin.email,
    fullName: admin.fullName,
    phone: admin.phone,
    role: admin.role,
    accountStatus: admin.accountStatus,
    childSafetyVetted: admin.childSafetyVetted,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

// The HTTP-facing shape returned by POST /admin/auth/login —
// AdminTokenPairResponse's four token fields plus an `admin` snapshot.
export interface AdminAuthResponse extends AdminTokenPairResponse {
  admin: AdminSummary;
}
