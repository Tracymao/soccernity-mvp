import { User } from '@prisma/client';
import { TokenPair } from './token/token.types';

// The HTTP-facing shape returned by /auth/refresh (and embedded inside
// AuthResponse below for /auth/login and /auth/register).
//
// Non-negotiable (CLAUDE.md, Build Plan Section 5.7): nothing here beyond
// identity-adjacent token material. In particular, isMinor/consentStatus
// must never appear — those are structurally excluded already because
// TokenPair only ever carries what TokenService put in it (see
// token.types.ts's AccessTokenPayload), and this mapper doesn't touch the
// User record at all, so there is nothing to leak even by accident.
//
// Kept deliberately this narrow even after AuthResponse (below) was added:
// /auth/refresh only ever has a refresh token to work with (no re-verified
// User row loaded), so TokenPairResponse must stay usable on its own,
// without a `user` field bolted on.
export interface TokenPairResponse {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
}

export function toTokenPairResponse(pair: TokenPair): TokenPairResponse {
  return {
    accessToken: pair.accessToken.token,
    accessTokenExpiresIn: pair.accessToken.expiresIn,
    refreshToken: pair.refreshToken.token,
    refreshTokenExpiresAt: pair.refreshToken.expiresAt.toISOString(),
  };
}

// The HTTP-facing shape of a User row, shared by /auth/login and
// /auth/register (previously duplicated inline as
// registration.controller.ts's own `toRegisterResponse` object literal —
// extracted here so both endpoints stay in sync by construction rather
// than by two people remembering to update matching field lists).
//
// This is explicit response shaping, never a spread of the raw Prisma
// User: never leak `passwordHash`. `isMinor`/`verificationStatus` ARE
// deliberately included here — this is a fresh, one-time HTTP response
// body reading a user's own current state back to them, not the JWT
// payload TokenPairResponse's comment above is about. That non-negotiable
// (isMinor/consentStatus must never appear inside the *token*) is
// unaffected and unweakened by this: TokenService still puts only
// `{ sub, role }` in the access token itself, and this function never
// touches TokenService or token contents.
export interface AuthUserSummary {
  id: string;
  email: string;
  phone: string | null;
  displayName: string;
  dateOfBirth: Date;
  isMinor: boolean;
  role: string;
  verificationStatus: string;
  createdAt: Date;
}

export function toAuthUserSummary(user: User): AuthUserSummary {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    dateOfBirth: user.dateOfBirth,
    isMinor: user.isMinor,
    role: user.role,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt,
  };
}

// The HTTP-facing shape returned by /auth/login and (as of this PR)
// /auth/register — TokenPairResponse's four token fields plus a `user`
// snapshot, in one flat object. Deliberately its own, wider type rather
// than adding `user` onto TokenPairResponse itself — see that interface's
// comment for why /auth/refresh needs to stay narrow.
export interface AuthResponse extends TokenPairResponse {
  user: AuthUserSummary;
}
