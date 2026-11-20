// Distinct error types so callers (the future /auth/refresh endpoint in
// B2-B4) can tell "just an expired/invalid token, ask the user to log in
// again" apart from "reuse of an already-rotated token detected, treat
// this as a possible theft and consider notifying the user" without
// string-matching error messages.

export class InvalidRefreshTokenError extends Error {
  constructor(message = 'Refresh token is invalid, expired, or already used') {
    super(message);
    this.name = 'InvalidRefreshTokenError';
  }
}

export class RefreshTokenReuseDetectedError extends Error {
  constructor(message = 'Refresh token reuse detected; token family revoked') {
    super(message);
    this.name = 'RefreshTokenReuseDetectedError';
  }
}
