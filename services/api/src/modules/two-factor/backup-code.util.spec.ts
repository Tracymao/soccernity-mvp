import { generateBackupCode, generateBackupCodes, looksLikeBackupCode, normaliseBackupCode } from './backup-code.util';
import { BACKUP_CODE_ALPHABET, BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH } from './two-factor.constants';

describe('backup-code.util', () => {
  it('uses an alphabet of exactly 32 characters with no 0, O, 1 or I (so a random byte & 0x1f has no modulo bias)', () => {
    expect(BACKUP_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(BACKUP_CODE_ALPHABET).size).toBe(32);
    for (const banned of ['0', 'O', '1', 'I']) expect(BACKUP_CODE_ALPHABET).not.toContain(banned);
    expect(BACKUP_CODE_ALPHABET).toMatch(/^[A-Z2-9]+$/);
  });

  it('makes a 10-character code from that alphabet only', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateBackupCode();
      expect(code).toHaveLength(BACKUP_CODE_LENGTH);
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ2-9]{10}$/);
    }
  });

  it('makes a set of exactly 10 distinct codes', () => {
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(BACKUP_CODE_COUNT);
    expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
  });

  it('draws every alphabet character over many codes (nothing is unreachable)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) for (const ch of generateBackupCode()) seen.add(ch);
    expect(seen.size).toBe(32);
  });

  it('normalises what a person types: spaces, hyphens and lower case', () => {
    expect(normaliseBackupCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normaliseBackupCode(' ABCDE FGHJK ')).toBe('ABCDEFGHJK');
    expect(normaliseBackupCode('abcde - fghjk')).toBe('ABCDEFGHJK');
  });

  it('recognises a well-formed backup code and nothing else', () => {
    expect(looksLikeBackupCode('ABCDEFGHJK')).toBe(true);
    expect(looksLikeBackupCode('ABCDEFGHJ')).toBe(false); // 9
    expect(looksLikeBackupCode('ABCDEFGHJKL')).toBe(false); // 11
    expect(looksLikeBackupCode('ABCDEFGHJ0')).toBe(false); // 0 is not in the alphabet
    expect(looksLikeBackupCode('ABCDEFGHJI')).toBe(false); // nor is I
    expect(looksLikeBackupCode('123456')).toBe(false); // a TOTP code is never a backup code
  });
});
