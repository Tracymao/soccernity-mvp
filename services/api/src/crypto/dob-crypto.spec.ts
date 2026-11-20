import { randomBytes } from 'crypto';
import {
  decryptDob,
  decryptDobString,
  encryptDob,
  encryptDobString,
  isEncryptedDob,
  parseDobKey,
} from './dob-crypto';

const key = randomBytes(32);

describe('dob-crypto (AES-256-GCM)', () => {
  it('round-trips a Date exactly', () => {
    const dob = new Date('2010-03-14T00:00:00.000Z');
    expect(decryptDob(encryptDob(dob, key), key).getTime()).toBe(dob.getTime());
  });

  it('never contains the plaintext and is v1-prefixed', () => {
    const ct = encryptDob(new Date('2010-03-14T00:00:00.000Z'), key);
    expect(isEncryptedDob(ct)).toBe(true);
    expect(ct).not.toContain('2010');
  });

  it('uses a fresh IV: the same DOB encrypts to different strings', () => {
    const dob = new Date('2010-03-14T00:00:00.000Z');
    expect(encryptDob(dob, key)).not.toBe(encryptDob(dob, key));
  });

  it('rejects a tampered ciphertext (GCM auth tag)', () => {
    const ct = encryptDob(new Date('2010-03-14T00:00:00.000Z'), key);
    const parts = ct.split(':');
    const bytes = Buffer.from(parts[3], 'base64');
    bytes[0] ^= 1;
    parts[3] = bytes.toString('base64');
    expect(() => decryptDobString(parts.join(':'), key)).toThrow();
  });

  it('rejects the wrong key', () => {
    const ct = encryptDob(new Date('2010-03-14T00:00:00.000Z'), key);
    expect(() => decryptDobString(ct, randomBytes(32))).toThrow();
  });

  it('refuses plaintext (strict) and malformed values', () => {
    expect(() => decryptDobString('2010-03-14T00:00:00.000Z', key)).toThrow(/not encrypted/);
    expect(() => decryptDobString('v1:abc', key)).toThrow(/Malformed/);
  });

  it('encryptDobString/decryptDobString round-trip arbitrary text', () => {
    expect(decryptDobString(encryptDobString('hello', key), key)).toBe('hello');
  });

  it('parseDobKey requires a real 32-byte base64 key', () => {
    expect(() => parseDobKey(undefined)).toThrow(/not set/);
    expect(() => parseDobKey('replace-me')).toThrow(/not set/);
    expect(() => parseDobKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(parseDobKey(key.toString('base64')).equals(key)).toBe(true);
  });
});
