// The OPTIONAL profile country (Decision Log #403 item 17): chosen from the full
// country list, stored by the server as an upper-case ISO 3166-1 alpha-2 code.
//
// This is the same 249 officially assigned codes services/api accepts
// (profile-country.constants.ts); the server refuses anything else with 400
// `invalid_profile_country`. Names come from the browser's own
// `Intl.DisplayNames`, so no translated name table lives here. It is NOT the
// safeguarding country (Age Gate / IP): that one is never shown or edited.
const CODES = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
  "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
  "DE DJ DK DM DO DZ " +
  "EC EE EG EH ER ES ET " +
  "FI FJ FK FM FO FR " +
  "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
  "HK HM HN HR HT HU " +
  "ID IE IL IM IN IO IQ IR IS IT " +
  "JE JM JO JP " +
  "KE KG KH KI KM KN KP KR KW KY KZ " +
  "LA LB LC LI LK LR LS LT LU LV LY " +
  "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
  "NA NC NE NF NG NI NL NO NP NR NU NZ " +
  "OM " +
  "PA PE PF PG PH PK PL PM PN PR PS PT PW PY " +
  "QA " +
  "RE RO RS RU RW " +
  "SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ " +
  "TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ " +
  "UA UG UM US UY UZ " +
  "VA VC VE VG VI VN VU " +
  "WF WS " +
  "YE YT " +
  "ZA ZM ZW"
)
  .split(" ")
  .filter(Boolean);

export interface CountryOption {
  code: string;
  name: string;
}

let displayNames: Intl.DisplayNames | null | undefined;

/** The English name of an ISO code, or the code itself when the runtime has no name for it. */
export function countryName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      displayNames = null;
    }
  }
  const upper = code.toUpperCase();
  try {
    return displayNames?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

let cached: CountryOption[] | null = null;

/** Every assignable country, alphabetical by name. */
export function profileCountryOptions(): CountryOption[] {
  if (!cached) {
    cached = CODES.map((code) => ({ code, name: countryName(code) })).sort((a, b) =>
      a.name.localeCompare(b.name, "en"),
    );
  }
  return cached;
}
