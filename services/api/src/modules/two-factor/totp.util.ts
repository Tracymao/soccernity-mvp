import * as OTPAuth from 'otpauth';
import {
  TOTP_ALGORITHM,
  TOTP_DIGITS,
  TOTP_PERIOD_SECONDS,
  TOTP_SECRET_BYTES,
  TOTP_WINDOW_STEPS,
  TWO_FACTOR_ISSUER,
} from './two-factor.constants';

// Pure RFC 6238 helpers on top of `otpauth` (one dependency, @noble/hashes). Nothing here touches the database or
// Redis. The secret is handled as a base32 string; ONLY the caller decides where (and how encrypted) it is stored.

function totpFor(secretBase32: string, label = 'account'): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: TWO_FACTOR_ISSUER,
    label,
    algorithm: TOTP_ALGORITHM,
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

// 20 random bytes (160 bits, the RFC 4226 recommendation), base32 without padding: what an authenticator app shows
// as the "manual key".
export function generateTotpSecret(): string {
  return new OTPAuth.Secret({ size: TOTP_SECRET_BYTES }).base32;
}

// otpauth://totp/Soccernity:<label>?... -- the frontend draws the QR code from this; the server never makes an image.
export function buildOtpauthUri(secretBase32: string, label: string): string {
  return totpFor(secretBase32, label).toString();
}

// The 30-second time step a timestamp falls in.
export function stepAt(timestampMs: number): number {
  return Math.floor(timestampMs / 1000 / TOTP_PERIOD_SECONDS);
}

// Checks a 6-digit code against the secret, accepting one step either side. Returns the step the code belongs to
// (so the caller can refuse a replay of a step already used), or null if no step in the window matches.
export function verifyTotp(secretBase32: string, code: string, timestampMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totpFor(secretBase32).validate({ token: code, timestamp: timestampMs, window: TOTP_WINDOW_STEPS });
  return delta === null ? null : stepAt(timestampMs) + delta;
}

// For tests and tooling: the code a device would show at a moment in time.
export function generateTotpCode(secretBase32: string, timestampMs: number = Date.now()): string {
  return totpFor(secretBase32).generate({ timestamp: timestampMs });
}
