import { TokenPair } from './token/token.types';

// The HTTP-facing shape returned by /auth/login and /auth/refresh.
//
// Non-negotiable (CLAUDE.md, Build Plan Section 5.7): nothing here beyond
// identity-adjacent token material. In particular, isMinor/consentStatus
// must never appear — those are structurally excluded already because
// TokenPair only ever carries what TokenService put in it (see
// token.types.ts's AccessTokenPayload), and this mapper doesn't touch the
// User record at all, so there is nothing to leak even by accident.
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
