import { BadRequestException } from '@nestjs/common';

// backend/w5-profile-block (B-038; Decision Log #403 item 17). The OPTIONAL
// profile country is chosen "from the full country list" (the default adopted in
// #403, veto-able). The full list = every officially assigned ISO 3166-1 alpha-2
// code (249). It is stored as the upper-case code; names are a client concern.
//
// This is NOT the safeguarding country. `User.declaredCountry` (Age Gate) and
// `User.derivedCountry` (IP) are never shown, never editable and decide US
// under-13 card verification; they use a looser, audit-only vocabulary that
// includes 'ZZ' ("Another country"). The profile country accepts ONLY real codes
// ('ZZ', 'XX' and unassigned codes are refused) and nothing here reads or writes
// the safeguarding columns.
export const PROFILE_COUNTRY_CODES: ReadonlySet<string> = new Set(
  (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ ' +
    'BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ ' +
    'CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
    'DE DJ DK DM DO DZ ' +
    'EC EE EG EH ER ES ET ' +
    'FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY ' +
    'HK HM HN HR HT HU ' +
    'ID IE IL IM IN IO IQ IR IS IT ' +
    'JE JM JO JP ' +
    'KE KG KH KI KM KN KP KR KW KY KZ ' +
    'LA LB LC LI LK LR LS LT LU LV LY ' +
    'MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ ' +
    'NA NC NE NF NG NI NL NO NP NR NU NZ ' +
    'OM ' +
    'PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
    'QA ' +
    'RE RO RS RU RW ' +
    'SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ ' +
    'TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
    'UA UG UM US UY UZ ' +
    'VA VC VE VG VI VN VU ' +
    'WF WS ' +
    'YE YT ' +
    'ZA ZM ZW'
  ).split(' ').filter(Boolean),
);

export const INVALID_PROFILE_COUNTRY_CODE = 'invalid_profile_country';

// 422 code for a bio / preferred club value the sensitive-content screen flagged
// (#394 A3: an inline "please rephrase" state on the field). Distinct from
// Grassroots' sensitive_content_review_required, which means "confirm to
// publish anyway"; this one has no confirm path.
export const SENSITIVE_PROFILE_REPHRASE_CODE = 'sensitive_content_rephrase_required';

// Returns the value to store: the upper-case ISO code, or null to clear
// (null, empty or whitespace-only). Any other string must be an assigned code.
// Case-insensitive input ("ng" -> "NG").
export function normaliseProfileCountry(value: string | null): string | null {
  if (value === null || value.trim() === '') return null;
  const code = value.trim().toUpperCase();
  if (!PROFILE_COUNTRY_CODES.has(code)) {
    throw new BadRequestException({
      message: 'Choose a country from the list.',
      code: INVALID_PROFILE_COUNTRY_CODE,
    });
  }
  return code;
}
