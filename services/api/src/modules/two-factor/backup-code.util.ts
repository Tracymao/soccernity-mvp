import { randomBytes } from 'crypto';
import { BACKUP_CODE_ALPHABET, BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH } from './two-factor.constants';

// One 10-character code from the 32-character alphabet (no 0, O, 1, I). 32 is a power of two, so masking a random
// byte with 0x1f is uniform: no modulo bias.
export function generateBackupCode(): string {
  const bytes = randomBytes(BACKUP_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < BACKUP_CODE_LENGTH; i++) code += BACKUP_CODE_ALPHABET[bytes[i] & 0x1f];
  return code;
}

// The 10 codes of one set, distinct from each other.
export function generateBackupCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < BACKUP_CODE_COUNT) codes.add(generateBackupCode());
  return [...codes];
}

// What a person types may be lower-case and grouped ("abcde-fghjk", "ABCDE FGHJK"): strip spaces and hyphens and
// upper-case it, so the hash is taken over, and compared against, one canonical form.
export function normaliseBackupCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

export function looksLikeBackupCode(normalised: string): boolean {
  if (normalised.length !== BACKUP_CODE_LENGTH) return false;
  for (const ch of normalised) if (!BACKUP_CODE_ALPHABET.includes(ch)) return false;
  return true;
}
