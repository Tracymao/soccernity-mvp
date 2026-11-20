import { randomBytes } from 'crypto';
import {
  DobDecryptError,
  DobKeyRing,
  decryptDob,
  decryptDobString,
  dobCiphertextVersion,
  encryptDob,
  encryptDobString,
  isEncryptedDob,
  parseDobKeyRing,
  parseDobKeyVersion,
} from './dob-crypto';
import { ConfigService } from '@nestjs/config';
import { DobEncryptionService } from './dob-encryption.service';
import { buildDobEncryptionWith } from './test-dob-encryption';

// Key rotation: the version in "v<N>:" names the key that made a value. Writes use the current key, reads use the key
// the value names, anything else fails loudly.
const oldKey = randomBytes(32);
const newKey = randomBytes(32);
const b64 = (k: Buffer) => k.toString('base64');

const v1Only: DobKeyRing = { current: { version: 1, key: oldKey } };
const rotating: DobKeyRing = { current: { version: 2, key: newKey }, previous: { version: 1, key: oldKey } };
const rotatedNoPrevious: DobKeyRing = { current: { version: 2, key: newKey } };

describe('dob-crypto: versioned values', () => {
  it('writes the current key and the current version into the prefix', () => {
    expect(encryptDobString('x', v1Only).startsWith('v1:')).toBe(true);
    expect(encryptDobString('x', rotating).startsWith('v2:')).toBe(true);
    expect(encryptDobString('x', { current: { version: 12, key: newKey } }).startsWith('v12:')).toBe(true);
  });

  it('a bare Buffer key is the pre-rotation shape: version 1', () => {
    const ct = encryptDobString('x', oldKey);
    expect(ct.startsWith('v1:')).toBe(true);
    expect(decryptDobString(ct, v1Only)).toBe('x');
    expect(decryptDobString(encryptDobString('x', v1Only), oldKey)).toBe('x');
  });

  it('reads a v1 value with the previous key and a v2 value with the current key, while both are live', () => {
    const dob = new Date('2011-05-06T00:00:00.000Z');
    const legacy = encryptDob(dob, v1Only);
    const fresh = encryptDob(dob, rotating);
    expect(decryptDob(legacy, rotating).toISOString()).toBe(dob.toISOString());
    expect(decryptDob(fresh, rotating).toISOString()).toBe(dob.toISOString());
  });

  it('a v1 value with no previous key configured fails loudly and names the setting, never guessing the current key', () => {
    const legacy = encryptDobString('secret', v1Only);
    const attempt = () => decryptDobString(legacy, rotatedNoPrevious);
    expect(attempt).toThrow(DobDecryptError);
    expect(attempt).toThrow(/DOB_ENCRYPTION_KEY_PREVIOUS/);
  });

  it('a version this process holds no key for fails loudly (older than previous, or newer than current)', () => {
    const v3 = encryptDobString('x', { current: { version: 3, key: randomBytes(32) } });
    const v0ish = 'v0:AAAA:AAAA:AAAA';
    expect(() => decryptDobString(v3, rotating)).toThrow(/key version 3/);
    expect(() => decryptDobString(v0ish, rotating)).toThrow(DobDecryptError);
    expect(() => decryptDobString(encryptDobString('x', v1Only), { current: { version: 3, key: newKey }, previous: { version: 2, key: oldKey } })).toThrow(
      /key version 1/,
    );
  });

  it('a value whose version names a key that does not match (wrong key under the right label) fails the auth tag', () => {
    const forged = encryptDobString('x', { current: { version: 2, key: randomBytes(32) } });
    expect(() => decryptDobString(forged, rotating)).toThrow(DobDecryptError);
    expect(() => decryptDobString(forged, rotating)).toThrow(/could not be decrypted/);
  });

  it('error messages never contain the value or a key', () => {
    const value = encryptDobString('1999-12-31T00:00:00.000Z', v1Only);
    for (const attempt of [
      () => decryptDobString(value, rotatedNoPrevious),
      () => decryptDobString(value.replace('v1:', 'v9:'), rotating),
      () => decryptDobString(value, { current: { version: 1, key: randomBytes(32) } }),
    ]) {
      let message = '';
      try {
        attempt();
      } catch (e) {
        message = (e as Error).message;
      }
      expect(message).not.toContain(value.split(':')[1]);
      expect(message).not.toContain(b64(oldKey));
      expect(message).not.toContain('1999');
    }
  });

  it('a malformed version prefix is rejected, not read as v1 ("v01", "v0")', () => {
    const body = encryptDobString('x', v1Only).split(':').slice(1).join(':');
    expect(() => decryptDobString(`v01:${body}`, v1Only)).toThrow(DobDecryptError);
    expect(() => decryptDobString(`v0:${body}`, v1Only)).toThrow(DobDecryptError);
  });

  it('isEncryptedDob and dobCiphertextVersion accept ANY v<digits>: prefix and nothing else', () => {
    expect(isEncryptedDob('v1:a:b:c')).toBe(true);
    expect(isEncryptedDob('v2:a:b:c')).toBe(true);
    expect(isEncryptedDob('v10:a:b:c')).toBe(true);
    expect(isEncryptedDob('2010-03-14T00:00:00.000Z')).toBe(false);
    expect(isEncryptedDob('')).toBe(false);
    expect(isEncryptedDob('v:a:b:c')).toBe(false);
    expect(isEncryptedDob('vx2:a')).toBe(false);
    expect(dobCiphertextVersion('v2:a:b:c')).toBe(2);
    expect(dobCiphertextVersion('v10:a:b:c')).toBe(10);
    expect(dobCiphertextVersion('2010-03-14')).toBeNull();
    expect(dobCiphertextVersion('v0:a:b:c')).toBeNull();
    expect(dobCiphertextVersion('v01:a:b:c')).toBeNull();
  });
});

describe('dob-crypto: reading the key settings', () => {
  const env = (over: Record<string, string | undefined>) => ({ DOB_ENCRYPTION_KEY: b64(newKey), ...over });

  it('unset or blank version is 1; a plain positive integer is accepted', () => {
    expect(parseDobKeyVersion(undefined)).toBe(1);
    expect(parseDobKeyVersion('')).toBe(1);
    expect(parseDobKeyVersion('  ')).toBe(1);
    expect(parseDobKeyVersion('2')).toBe(2);
    expect(parseDobKeyVersion(' 17 ')).toBe(17);
  });

  it.each(['0', '-1', '1.5', '1e2', 'two', '02', '+3', '99999999999999999999'])('rejects version %j', (bad) => {
    expect(() => parseDobKeyVersion(bad)).toThrow(/DOB_ENCRYPTION_KEY_VERSION/);
  });

  it('with only the current key it is the old single-key behaviour (version 1, no previous)', () => {
    const ring = parseDobKeyRing(env({}));
    expect(ring.current.version).toBe(1);
    expect(ring.current.key.equals(newKey)).toBe(true);
    expect(ring.previous).toBeUndefined();
  });

  it('a rotation: current = version N, previous = version N-1', () => {
    const ring = parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_VERSION: '3', DOB_ENCRYPTION_KEY_PREVIOUS: b64(oldKey) }));
    expect(ring.current.version).toBe(3);
    expect(ring.previous?.version).toBe(2);
    expect(ring.previous?.key.equals(oldKey)).toBe(true);
  });

  it('a blank previous key counts as unset (Render leaves a blank)', () => {
    expect(parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: '  ' })).previous).toBeUndefined();
  });

  it('refuses a previous key that is invalid, equal to the current one, or set while the version is still 1', () => {
    expect(() => parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: b64(randomBytes(16)) }))).toThrow(
      /DOB_ENCRYPTION_KEY_PREVIOUS must decode/,
    );
    expect(() => parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: b64(newKey) }))).toThrow(/must differ/);
    expect(() => parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_PREVIOUS: b64(oldKey) }))).toThrow(/VERSION is 1/);
    expect(() => parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_VERSION: '1', DOB_ENCRYPTION_KEY_PREVIOUS: b64(oldKey) }))).toThrow(/VERSION is 1/);
  });

  it('the settings errors never contain a key value', () => {
    const k = b64(randomBytes(16));
    let message = '';
    try {
      parseDobKeyRing(env({ DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: k }));
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).not.toContain(k);
    expect(message).not.toContain(b64(newKey));
  });
});

describe('DobEncryptionService with a rotation in progress', () => {
  const cfg = (vars: Record<string, string>) => buildDobEncryptionWith(vars);
  const OLD = b64(oldKey);
  const NEW = b64(newKey);

  it('with nothing but DOB_ENCRYPTION_KEY it behaves exactly as before: v1 values, no version setting needed', () => {
    const svc = cfg({ DOB_ENCRYPTION_KEY: OLD });
    const stored = svc.encrypt(new Date('2010-01-01T00:00:00.000Z'));
    expect(stored.startsWith('v1:')).toBe(true);
    expect(svc.decrypt(stored).toISOString()).toBe('2010-01-01T00:00:00.000Z');
  });

  it('reads old v1 values (date of birth AND a two-factor secret) and writes v2', () => {
    const before = cfg({ DOB_ENCRYPTION_KEY: OLD });
    const oldDob = before.encrypt(new Date('2010-01-01T00:00:00.000Z'));
    const oldSecret = before.encryptString('JBSWY3DPEHPK3PXP');

    const during = cfg({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: '2', DOB_ENCRYPTION_KEY_PREVIOUS: OLD });
    expect(during.decrypt(oldDob).toISOString()).toBe('2010-01-01T00:00:00.000Z');
    expect(during.decryptString(oldSecret)).toBe('JBSWY3DPEHPK3PXP');
    expect(during.encrypt(new Date('2010-01-01T00:00:00.000Z')).startsWith('v2:')).toBe(true);
    expect(during.encryptString('x').startsWith('v2:')).toBe(true);
  });

  it('after the previous key is removed, v2 values still read and an old v1 value fails loudly', () => {
    const before = cfg({ DOB_ENCRYPTION_KEY: OLD });
    const oldSecret = before.encryptString('JBSWY3DPEHPK3PXP');
    const after = cfg({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: '2' });
    expect(after.decryptString(after.encryptString('fresh'))).toBe('fresh');
    expect(() => after.decryptString(oldSecret)).toThrow(DobDecryptError);
  });

  it('a malformed version setting is an error on first use, not a silent default', () => {
    const svc = cfg({ DOB_ENCRYPTION_KEY: NEW, DOB_ENCRYPTION_KEY_VERSION: 'two' });
    expect(() => svc.encryptString('x')).toThrow(/DOB_ENCRYPTION_KEY_VERSION/);
  });

  it('reads the three settings by name from ConfigService', () => {
    const seen: string[] = [];
    const svc = new DobEncryptionService({
      get: (name: string) => {
        seen.push(name);
        return name === 'DOB_ENCRYPTION_KEY' ? NEW : undefined;
      },
    } as unknown as ConfigService);
    svc.encryptString('x');
    expect(seen.sort()).toEqual(['DOB_ENCRYPTION_KEY', 'DOB_ENCRYPTION_KEY_PREVIOUS', 'DOB_ENCRYPTION_KEY_VERSION']);
  });
});
