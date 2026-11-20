// Deliberately one error type, unlike refresh-token.store.ts's two
// (Invalid vs ReuseDetected). A reused/expired/unknown/malformed reset
// token all mean the same thing to the caller here: "ask for a new
// reset link" — there is no theft-detection/family-revocation concept
// for a single-purpose, single-use token like this one.
export class InvalidResetTokenError extends Error {
  constructor(message = 'Reset token is invalid, expired, or already used') {
    super(message);
    this.name = 'InvalidResetTokenError';
  }
}
