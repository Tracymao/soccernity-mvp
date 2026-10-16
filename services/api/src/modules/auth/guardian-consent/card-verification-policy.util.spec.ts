import {
  normalizeCountryCode,
  requiresCardVerification,
  verificationMethodFor,
} from './card-verification-policy.util';

const asOf = new Date('2026-09-21T12:00:00Z');

describe('card-verification-policy', () => {
  it('normalizes a country code; blank or malformed input is null', () => {
    expect(normalizeCountryCode(' us ')).toBe('US');
    expect(normalizeCountryCode('')).toBeNull();
    expect(normalizeCountryCode(undefined)).toBeNull();
    expect(normalizeCountryCode('USA')).toBeNull();
    expect(normalizeCountryCode('1A')).toBeNull();
  });

  it('under 13 the day before the 13th birthday is in scope; on the birthday it is not', () => {
    expect(requiresCardVerification(new Date('2013-09-22T00:00:00Z'), 'US', asOf)).toBe(true);
    expect(requiresCardVerification(new Date('2013-09-21T00:00:00Z'), 'US', asOf)).toBe(false);
  });

  // B-025: the DERIVED country decides. A resolved non-US country is out of
  // scope; an UNRESOLVED lookup (null / undefined / blank / malformed) applies
  // the stronger control.
  it('derived non-US under-13 is out of scope; unresolved under-13 is in scope', () => {
    const dob = new Date('2018-01-01T00:00:00Z');
    expect(requiresCardVerification(dob, 'GB', asOf)).toBe(false);
    expect(requiresCardVerification(dob, 'ZZ', asOf)).toBe(false);
    expect(requiresCardVerification(dob, null, asOf)).toBe(true);
    expect(requiresCardVerification(dob, undefined, asOf)).toBe(true);
    expect(requiresCardVerification(dob, '  ', asOf)).toBe(true);
    expect(requiresCardVerification(dob, 'USA', asOf)).toBe(true);
  });

  it('derived US under-13 is in scope regardless of case', () => {
    expect(requiresCardVerification(new Date('2018-01-01T00:00:00Z'), 'us', asOf)).toBe(true);
  });

  it('13-17 anywhere is never in scope, even when unresolved', () => {
    const dob = new Date('2011-01-01T00:00:00Z');
    expect(requiresCardVerification(dob, 'US', asOf)).toBe(false);
    expect(requiresCardVerification(dob, undefined, asOf)).toBe(false);
  });

  it('maps to the audit method string', () => {
    expect(verificationMethodFor(true)).toBe('email_link_plus_card_charge');
    expect(verificationMethodFor(false)).toBe('email_link');
  });
});
