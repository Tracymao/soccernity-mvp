import { createHash, randomBytes, timingSafeEqual } from 'crypto';

// Recovery tokens are "<requestId>.<secret>": the id finds the row, the 256-bit secret is compared (as a SHA-256
// hash, in constant time) with the hash stored on it. Only the hash is stored. The same pattern as
// two-factor-token.store.ts and password-reset/reset-token.store.ts.

export interface IssuedRecoveryToken {
  token: string;
  hash: string;
}

export const hashRecoverySecret = (secret: string) => createHash('sha256').update(secret).digest('hex');

export function issueRecoveryToken(requestId: string): IssuedRecoveryToken {
  const secret = randomBytes(32).toString('base64url');
  return { token: `${requestId}.${secret}`, hash: hashRecoverySecret(secret) };
}

export function parseRecoveryToken(raw: unknown): { id: string; secret: string } | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 200) return null;
  const i = raw.indexOf('.');
  if (i <= 0 || i === raw.length - 1) return null;
  return { id: raw.slice(0, i), secret: raw.slice(i + 1) };
}

export function recoverySecretMatches(secret: string, storedHashHex: string | null | undefined): boolean {
  if (!storedHashHex) return false;
  const candidate = Buffer.from(hashRecoverySecret(secret), 'hex');
  const stored = Buffer.from(storedHashHex, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}
