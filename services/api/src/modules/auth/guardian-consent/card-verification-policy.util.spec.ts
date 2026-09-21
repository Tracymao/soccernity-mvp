import {
  normalizeDeclaredCountry,
  requiresCardVerification,
  verificationMethodFor,
} from './card-verification-policy.util';

const asOf = new Date('2026-09-21T12:00:00Z');

describe('card-verification-policy', () => {
  it('normalizes country', () => {
    expect(normalizeDeclaredCountry(' us ')).toBe('US');
    expect(normalizeDeclaredCountry('')).toBeNull();
    expect(normalizeDeclaredCountry(undefined)).toBeNull();
  });

  it('under 13 the day before the 13th birthday is in scope; on the birthday it is not', () => {
    expect(requiresCardVerification(new Date('2013-09-22T00:00:00Z'), 'US', asOf)).toBe(true);
    expect(requiresCardVerification(new Date('2013-09-21T00:00:00Z'), 'US', asOf)).toBe(false);
  });

  it('non-US under-13 is out of scope; unknown country under-13 is in scope', () => {
    const dob = new Date('2018-01-01T00:00:00Z');
    expect(requiresCardVerification(dob, 'GB', asOf)).toBe(false);
    expect(requiresCardVerification(dob, null, asOf)).toBe(true);
    expect(requiresCardVerification(dob, undefined, asOf)).toBe(true);
  });

  it('13-17 anywhere is never in scope', () => {
    const dob = new Date('2011-01-01T00:00:00Z');
    expect(requiresCardVerification(dob, 'US', asOf)).toBe(false);
    expect(requiresCardVerification(dob, undefined, asOf)).toBe(false);
  });

  it('maps to the audit method string', () => {
    expect(verificationMethodFor(true)).toBe('email_link_plus_card_charge');
    expect(verificationMethodFor(false)).toBe('email_link');
  });
});
