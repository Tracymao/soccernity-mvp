import { BadRequestException } from '@nestjs/common';
import { INVALID_PROFILE_COUNTRY_CODE, normaliseProfileCountry, PROFILE_COUNTRY_CODES } from './profile-country.constants';

describe('profile country (B-038, Decision Log #403 item 17)', () => {
  it('is the full ISO 3166-1 alpha-2 list: 249 distinct upper-case codes', () => {
    expect(PROFILE_COUNTRY_CODES.size).toBe(249);
    for (const code of PROFILE_COUNTRY_CODES) expect(code).toMatch(/^[A-Z]{2}$/);
    for (const c of ['GB', 'NG', 'US', 'FR', 'DE', 'ZA', 'KE', 'GH', 'IE', 'BR', 'AR']) expect(PROFILE_COUNTRY_CODES.has(c)).toBe(true);
  });

  it('stores upper-case whatever the case or surrounding whitespace', () => {
    expect(normaliseProfileCountry('ng')).toBe('NG');
    expect(normaliseProfileCountry(' Gb ')).toBe('GB');
  });

  it.each([null, '', '   '])('clears on %p', (v) => {
    expect(normaliseProfileCountry(v as string | null)).toBeNull();
  });

  // ZZ ("Another country") belongs to the SAFEGUARDING vocabulary only.
  it.each(['ZZ', 'XX', 'AA', 'UK', 'G', 'GBR', 'N1'])('refuses %p with a coded 400', (v) => {
    const err = (() => {
      try {
        normaliseProfileCountry(v);
      } catch (e) {
        return e as BadRequestException;
      }
    })();
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err?.getResponse()).toMatchObject({ code: INVALID_PROFILE_COUNTRY_CODE });
  });
});
