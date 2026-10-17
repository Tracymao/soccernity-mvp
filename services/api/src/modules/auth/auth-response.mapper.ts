import { User } from '@prisma/client';
import { TokenPair } from './token/token.types';
import { resolvePublicName } from '../users/public-name.util';
import { deriveOnboardingState, GuardianConsentState, OnboardingNextStep } from './onboarding-state.util';

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
  username: string | null;
  publicName: string;
  dateOfBirth: Date | null;
  isMinor: boolean;
  role: string;
  verificationStatus: string;
  createdAt: Date;
  // B-027 / B-030 (Decision Log #367, #369, #394 A6): where this account stands
  // in the sign-up flow, so the web app can route on EVERY login without
  // re-deriving safeguarding rules. A routing hint only -- the guards enforce.
  //   profileComplete        a username has been chosen (the incomplete-profile
  //                          gate; incomplete accounts show as the placeholder
  //                          name and cannot post)
  //   guardianConsentStatus  'not_applicable' for an adult; 'pending' |
  //                          'confirmed' | 'declined' for a minor. 'declined'
  //                          is reported as itself, never folded into 'pending'
  //                          (audit section 5 item 5)
  //   nextStep               'restricted_pending' | 'verify_email' |
  //                          'create_profile' | 'none'
  // Not in the JWT (non-negotiable, token.types.ts): a fresh response body.
  profileComplete: boolean;
  guardianConsentStatus: GuardianConsentState;
  nextStep: OnboardingNextStep;
}

// `dateOfBirth` is passed in already decrypted (User.dateOfBirth is stored
// as ciphertext; see src/crypto/dob-encryption.service.ts) -- the mapper
// never sees or forwards the stored ciphertext.
export function toAuthUserSummary(
  user: User,
  dateOfBirth: Date | null,
  // The minor's Guardian.consentStatus, or null for an adult / no row. The
  // caller supplies it (one indexed lookup, minors only) so this mapper stays
  // a pure function of its arguments.
  guardianConsentStatus: string | null = null,
): AuthUserSummary {
  const onboarding = deriveOnboardingState({
    isMinor: user.isMinor,
    guardianConsentStatus,
    verificationStatus: user.verificationStatus,
    username: user.username,
  });
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    displayName: user.displayName,
    username: user.username,
    publicName: resolvePublicName(user),
    dateOfBirth,
    isMinor: user.isMinor,
    role: user.role,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt,
    ...onboarding,
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
