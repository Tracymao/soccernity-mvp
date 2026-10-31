import { ConfigService } from '@nestjs/config';
import { buildTestDobEncryption } from './test-dob-encryption';
import { DobEncryptionService } from './dob-encryption.service';

// backend/b086-two-factor (Decision Log #405 item 8): the TOTP secrets are encrypted with the SAME key and code as the
// date of birth. The new string methods are thin wrappers over the existing exported functions; the date-of-birth
// methods and their stored format must not have changed.
describe('DobEncryptionService', () => {
  const service = buildTestDobEncryption();

  describe('encryptString / decryptString (two-factor secrets)', () => {
    it('round-trips text and stores it as v1:<iv>:<tag>:<ciphertext>, never as plaintext', () => {
      const secret = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
      const stored = service.encryptString(secret);
      expect(stored.startsWith('v1:')).toBe(true);
      expect(stored.split(':')).toHaveLength(4);
      expect(stored).not.toContain(secret);
      expect(service.decryptString(stored)).toBe(secret);
    });

    it('uses a fresh IV every time, so equal secrets never encrypt to equal strings', () => {
      expect(service.encryptString('same')).not.toBe(service.encryptString('same'));
    });

    it('refuses a tampered value (GCM tag), a plaintext value and a different key', () => {
      const stored = service.encryptString('JBSWY3DPEHPK3PXP');
      const [v, iv, tag, ct] = stored.split(':');
      const flipped = Buffer.from(ct, 'base64');
      flipped[0] ^= 0x01;
      expect(() => service.decryptString([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
      expect(() => service.decryptString('JBSWY3DPEHPK3PXP')).toThrow();

      const otherKey = Buffer.from('another-test-only-key-32-bytes!!').toString('base64');
      const other = new DobEncryptionService({ get: () => otherKey } as unknown as ConfigService);
      expect(() => other.decryptString(stored)).toThrow();
    });
  });

  describe('the date-of-birth methods are unchanged', () => {
    it('still round-trips a Date, stored as the UTC ISO string under the same v1 format', () => {
      const dob = new Date('2010-01-01T00:00:00.000Z');
      const stored = service.encrypt(dob);
      expect(stored.startsWith('v1:')).toBe(true);
      expect(service.decrypt(stored).toISOString()).toBe(dob.toISOString());
      // The generic method reads a date-of-birth value as its ISO text: it is one format, one key, one code.
      expect(service.decryptString(stored)).toBe('2010-01-01T00:00:00.000Z');
      expect(service.decryptNullable(null)).toBeNull();
    });

    it('a string encrypted by the new method is readable by the same decryptor a date uses (one code path)', () => {
      expect(service.decryptString(service.encryptString('2010-01-01T00:00:00.000Z'))).toBe('2010-01-01T00:00:00.000Z');
      expect(service.decrypt(service.encryptString('2010-01-01T00:00:00.000Z')).toISOString()).toBe('2010-01-01T00:00:00.000Z');
    });
  });
});
