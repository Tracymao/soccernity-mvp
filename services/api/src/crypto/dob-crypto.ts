import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM field encryption for User.dateOfBirth (security/dob-field-
// encryption; Decision Log entry "DOB storage: encryption, not hashing").
//
// Stored format (a single TEXT value, safe to keep in User.dateOfBirth):
//   v1:<iv base64>:<auth tag base64>:<ciphertext base64>
// The "v1" prefix is the key/format version, so a future key rotation can
// tell which key a value needs without a schema change. A fresh random
// 96-bit IV per value means the same DOB never encrypts to the same string
// (so equal ciphertexts do not leak "same DOB"). The plaintext is the
// date as a UTC ISO-8601 string ("2010-01-01T00:00:00.000Z"), which
// round-trips a Date exactly.
export const DOB_CIPHERTEXT_PREFIX = 'v1:';
export const DOB_KEY_BYTES = 32;

export function parseDobKey(raw: string | undefined): Buffer {
  if (!raw || raw === 'replace-me') {
    throw new Error(
      'DOB_ENCRYPTION_KEY is not set (or is still the .env.example placeholder). ' +
        'Generate one with `openssl rand -base64 32`.',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== DOB_KEY_BYTES) {
    throw new Error(
      `DOB_ENCRYPTION_KEY must decode (base64) to exactly ${DOB_KEY_BYTES} bytes; got ${key.length}.`,
    );
  }
  return key;
}

export function isEncryptedDob(value: string): boolean {
  return value.startsWith(DOB_CIPHERTEXT_PREFIX);
}

export function encryptDob(dob: Date, key: Buffer): string {
  if (Number.isNaN(dob.getTime())) throw new Error('Cannot encrypt an invalid Date');
  return encryptDobString(dob.toISOString(), key);
}

export function encryptDobString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${DOB_CIPHERTEXT_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

// Strict: anything that is not a well-formed v1 value (including a legacy
// plaintext value) throws rather than being silently accepted, so an
// un-backfilled row fails loudly instead of being read as if protected.
export function decryptDobString(value: string, key: Buffer): string {
  if (!isEncryptedDob(value)) throw new Error('dateOfBirth value is not encrypted (missing v1 prefix)');
  const parts = value.slice(DOB_CIPHERTEXT_PREFIX.length).split(':');
  if (parts.length !== 3) throw new Error('Malformed encrypted dateOfBirth value');
  const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

export function decryptDob(value: string, key: Buffer): Date {
  const date = new Date(decryptDobString(value, key));
  if (Number.isNaN(date.getTime())) throw new Error('Decrypted dateOfBirth is not a valid date');
  return date;
}
