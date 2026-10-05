import { encryptDob, parseDobKey } from '../src/crypto/dob-crypto';

// Seeding helper: e2e specs create User rows directly via Prisma, and
// User.dateOfBirth is stored as ciphertext (security/dob-field-encryption),
// so seeds must write ciphertext too -- using the exact same encryption
// code and DOB_ENCRYPTION_KEY the app uses (loaded by test/load-env.ts).
export function seedDob(dob: Date | string): string {
  const date = typeof dob === 'string' ? new Date(dob) : dob;
  return encryptDob(date, parseDobKey(process.env.DOB_ENCRYPTION_KEY));
}
