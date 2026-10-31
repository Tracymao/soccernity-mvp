import { buildOtpauthUri, generateTotpCode, generateTotpSecret, stepAt, verifyTotp } from './totp.util';

// RFC 6238 Appendix B test vector for SHA-1: the 20-byte ASCII secret "12345678901234567890" (base32
// GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ), time 59 seconds -> the 8-digit code 94287082, i.e. 6-digit 287082.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('totp.util', () => {
  it('matches the RFC 6238 SHA-1 test vector at t=59s (a standard authenticator would show the same code)', () => {
    expect(generateTotpCode(RFC_SECRET, 59_000)).toBe('287082');
    expect(generateTotpCode(RFC_SECRET, 1_111_111_109_000)).toBe('081804');
  });

  it('generates a 160-bit base32 secret, different every time', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/); // 20 bytes -> 32 base32 characters, no padding
    expect(a).not.toBe(b);
  });

  it('builds an otpauth URI an authenticator app accepts (issuer, label, SHA1, 6 digits, 30 s)', () => {
    const uri = buildOtpauthUri(RFC_SECRET, 'kid@example.com');
    expect(uri.startsWith('otpauth://totp/Soccernity:kid%40example.com?')).toBe(true);
    const query = new URLSearchParams(uri.split('?')[1]);
    expect(query.get('secret')).toBe(RFC_SECRET);
    expect(query.get('issuer')).toBe('Soccernity');
    expect(query.get('algorithm')).toBe('SHA1');
    expect(query.get('digits')).toBe('6');
    expect(query.get('period')).toBe('30');
  });

  describe('verifyTotp: one 30-second step either side', () => {
    const t = 1_700_000_015_000; // somewhere inside a step
    const step = stepAt(t);

    it('accepts the current step and reports it', () => {
      expect(verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, t), t)).toBe(step);
    });

    it('accepts the previous and the next step, and reports which one', () => {
      expect(verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, t - 30_000), t)).toBe(step - 1);
      expect(verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, t + 30_000), t)).toBe(step + 1);
    });

    it('refuses two steps away in either direction', () => {
      expect(verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, t - 60_000), t)).toBeNull();
      expect(verifyTotp(RFC_SECRET, generateTotpCode(RFC_SECRET, t + 60_000), t)).toBeNull();
    });

    it('refuses anything that is not exactly six digits', () => {
      for (const bad of ['', '12345', '1234567', 'abcdef', '12 345', '１２３４５６']) {
        expect(verifyTotp(RFC_SECRET, bad, t)).toBeNull();
      }
    });

    it('refuses a code made with another secret', () => {
      const other = generateTotpSecret();
      expect(verifyTotp(RFC_SECRET, generateTotpCode(other, t), t)).toBeNull();
    });
  });

  it('computes the step as floor(seconds / 30)', () => {
    expect(stepAt(0)).toBe(0);
    expect(stepAt(29_999)).toBe(0);
    expect(stepAt(30_000)).toBe(1);
    expect(stepAt(59_000)).toBe(1);
  });
});
