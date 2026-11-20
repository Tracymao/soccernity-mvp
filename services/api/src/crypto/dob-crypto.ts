import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM field encryption for User.dateOfBirth (security/dob-field-
// encryption; Decision Log entry "DOB storage: encryption, not hashing") and,
// since B-086, for the two-factor secrets (User/AdminUser.totpSecretEncrypted).
//
// Stored format (a single TEXT value, safe to keep in User.dateOfBirth):
//   v<N>:<iv base64>:<auth tag base64>:<ciphertext base64>
// N is the KEY version: which key made the value. Until a rotation, every
// value is v1 and DOB_ENCRYPTION_KEY_VERSION is unset (default 1), so nothing
// changes for an existing deployment. A fresh random 96-bit IV per value means
// the same DOB never encrypts to the same string (so equal ciphertexts do not
// leak "same DOB"). The plaintext is the date as a UTC ISO-8601 string
// ("2010-01-01T00:00:00.000Z"), which round-trips a Date exactly.
//
// Key rotation (docs/dob-encryption-rollback.md): while a rotation is in
// progress TWO keys are live. DOB_ENCRYPTION_KEY is the CURRENT key (version N,
// DOB_ENCRYPTION_KEY_VERSION). DOB_ENCRYPTION_KEY_PREVIOUS is the key of
// version N-1. Writes always use the current key; reads use whichever key the
// value's own version names. A value of any other version, or of the previous
// version when no previous key is set, FAILS LOUDLY -- it is never silently
// accepted and never guessed at with the wrong key.
export const DOB_DEFAULT_KEY_VERSION = 1;
export const DOB_KEY_BYTES = 32;

// Any "v<digits>:" prefix. Deliberately NOT "v1:": the backfill script uses this to decide "already encrypted, leave
// alone", and after a rotation the stored values are v2, v3 ... (a "v1:"-only test would treat them as plaintext and
// encrypt them a second time).
const VERSION_PREFIX = /^v(\d+):/;
const VALID_VERSION = /^[1-9]\d*$/;

// Thrown when a stored value cannot be turned back into plaintext: not versioned, malformed, a version this process
// holds no key for, or a failed authentication tag (wrong key or altered value). Key CONFIGURATION problems (unset,
// wrong length) are plain Errors from parseDobKey and are deliberately not this type. The message never contains the
// value or a key.
export class DobDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DobDecryptError';
  }
}

export interface DobKeyEntry {
  version: number;
  key: Buffer;
}

export interface DobKeyRing {
  current: DobKeyEntry;
  previous?: DobKeyEntry;
}

// A bare Buffer is the pre-rotation shape: one key, version 1.
export type DobKeyInput = Buffer | DobKeyRing;

function asRing(input: DobKeyInput): DobKeyRing {
  return Buffer.isBuffer(input) ? { current: { version: DOB_DEFAULT_KEY_VERSION, key: input } } : input;
}

export function parseDobKey(raw: string | undefined, name = 'DOB_ENCRYPTION_KEY'): Buffer {
  if (!raw || raw === 'replace-me') {
    throw new Error(
      `${name} is not set (or is still the .env.example placeholder). ` + 'Generate one with `openssl rand -base64 32`.',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== DOB_KEY_BYTES) {
    throw new Error(`${name} must decode (base64) to exactly ${DOB_KEY_BYTES} bytes; got ${key.length}.`);
  }
  return key;
}

// DOB_ENCRYPTION_KEY_VERSION: unset or blank = 1; otherwise a positive integer written as plain digits.
export function parseDobKeyVersion(raw: string | undefined): number {
  const text = raw?.trim();
  if (!text) return DOB_DEFAULT_KEY_VERSION;
  const version = Number(text);
  if (!VALID_VERSION.test(text) || !Number.isSafeInteger(version)) {
    throw new Error('DOB_ENCRYPTION_KEY_VERSION must be a positive whole number (1, 2, 3 ...), or unset for 1.');
  }
  return version;
}

// Builds the key ring from the three environment variables. One place, used by the app (DobEncryptionService), the
// boot check and both scripts, so they can never disagree about what is valid.
export function parseDobKeyRing(env: {
  DOB_ENCRYPTION_KEY?: string;
  DOB_ENCRYPTION_KEY_VERSION?: string;
  DOB_ENCRYPTION_KEY_PREVIOUS?: string;
}): DobKeyRing {
  const key = parseDobKey(env.DOB_ENCRYPTION_KEY);
  const version = parseDobKeyVersion(env.DOB_ENCRYPTION_KEY_VERSION);
  const ring: DobKeyRing = { current: { version, key } };

  const previousRaw = env.DOB_ENCRYPTION_KEY_PREVIOUS?.trim();
  if (previousRaw) {
    if (version < 2) {
      // The previous key is the key of version N-1; version 1 has none. This is also the classic rotation mistake
      // (new key and previous key set, version number forgotten): writes would go on as v1 under the NEW key while
      // every existing v1 value was made by the OLD one, and nothing would decrypt.
      throw new Error(
        'DOB_ENCRYPTION_KEY_PREVIOUS is set but DOB_ENCRYPTION_KEY_VERSION is 1 (or unset). During a rotation set ' +
          "DOB_ENCRYPTION_KEY_VERSION to the new key's version (2 for the first rotation).",
      );
    }
    const previousKey = parseDobKey(previousRaw, 'DOB_ENCRYPTION_KEY_PREVIOUS');
    if (previousKey.equals(key)) {
      throw new Error('DOB_ENCRYPTION_KEY_PREVIOUS must differ from DOB_ENCRYPTION_KEY.');
    }
    ring.previous = { version: version - 1, key: previousKey };
  }
  return ring;
}

export function isEncryptedDob(value: string): boolean {
  return VERSION_PREFIX.test(value);
}

// The key version a stored value names, or null when it is not a versioned value (plaintext, empty, garbage).
export function dobCiphertextVersion(value: string): number | null {
  const m = VERSION_PREFIX.exec(value);
  if (!m || !VALID_VERSION.test(m[1])) return null;
  const version = Number(m[1]);
  return Number.isSafeInteger(version) ? version : null;
}

export function encryptDob(dob: Date, key: DobKeyInput): string {
  if (Number.isNaN(dob.getTime())) throw new Error('Cannot encrypt an invalid Date');
  return encryptDobString(dob.toISOString(), key);
}

// Always the CURRENT key, written with the current version.
export function encryptDobString(plaintext: string, key: DobKeyInput): string {
  const { version, key: current } = asRing(key).current;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', current, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${version}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function keyForVersion(ring: DobKeyRing, version: number): Buffer {
  if (version === ring.current.version) return ring.current.key;
  if (ring.previous && version === ring.previous.version) return ring.previous.key;
  if (version === ring.current.version - 1) {
    throw new DobDecryptError(
      `A stored value is at key version ${version} but no previous key is configured. ` +
        'Set DOB_ENCRYPTION_KEY_PREVIOUS to the old key (see docs/dob-encryption-rollback.md).',
    );
  }
  throw new DobDecryptError(
    `A stored value is at key version ${version}, which this process holds no key for ` +
      `(current version ${ring.current.version}${ring.previous ? `, previous ${ring.previous.version}` : ''}).`,
  );
}

// Strict: anything that is not a well-formed versioned value (including a legacy plaintext value) throws rather than
// being silently accepted, so an un-backfilled row fails loudly instead of being read as if protected.
export function decryptDobString(value: string, key: DobKeyInput): string {
  if (!isEncryptedDob(value)) throw new DobDecryptError('dateOfBirth value is not encrypted (missing version prefix)');
  const version = dobCiphertextVersion(value);
  if (version === null) throw new DobDecryptError('Malformed encrypted dateOfBirth value (bad version prefix)');
  const parts = value.slice(value.indexOf(':') + 1).split(':');
  if (parts.length !== 3) throw new DobDecryptError('Malformed encrypted dateOfBirth value');
  const usedKey = keyForVersion(asRing(key), version);
  try {
    const [iv, tag, ct] = parts.map((p) => Buffer.from(p, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', usedKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    // Node's own message can be "Unsupported state or unable to authenticate data"; one stable, value-free message.
    throw new DobDecryptError('Stored value could not be decrypted (wrong key for its version, or the value was altered).');
  }
}

export function decryptDob(value: string, key: DobKeyInput): Date {
  const date = new Date(decryptDobString(value, key));
  if (Number.isNaN(date.getTime())) throw new DobDecryptError('Decrypted dateOfBirth is not a valid date');
  return date;
}
