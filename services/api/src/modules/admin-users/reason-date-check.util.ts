// B-129 (Decision Log #406 item 4). The DOB-correction audit row records the
// admin's free-text reason. It must never hold a date of birth (the old or the
// new one), because the audit trail is read by more people than the DOB itself
// and is kept after the account is gone. The client already warns the admin;
// this is the SERVER-SIDE check, so a direct API call cannot bypass it.
//
// WHAT COUNTS AS "DATE-SHAPED". A day, month and/or year that together read as
// a calendar date:
//   - numeric with separators:   2010-03-04, 2010/3/4, 04/03/2010, 4.3.10
//   - compact eight digits:      20100304, 04032010
//   - month name with a day:     4 March, 4th of March, March 4, Mar 4th
//   - month name with a year:    March 2010, Mar 2010, 2010 March
//
// WHAT IT DOES NOT CATCH, stated honestly. Free text cannot be proven free of
// every date form, so this is a floor, not a guarantee:
//   - a bare four-digit year ("born in 2010") passes: it is not date-shaped, and
//     rejecting every 19xx/20xx would reject ticket numbers and years of
//     incidents;
//   - dates spelled out in words ("the fourth of March two thousand and ten"),
//     in another script, or split across punctuation the patterns do not allow;
//   - a deliberately obfuscated date ("2 0 1 0-0 3-04" is caught only when the
//     digits are contiguous).
// It errs towards false positives (a version number such as 1.2.34, or "may 10"
// as in "it may 10 ...") because the cost of one is rewording a sentence and the
// cost of a miss is a date of birth in a long-lived audit log.
export const REASON_CONTAINS_DATE_CODE = 'reason_contains_date';
export const REASON_CONTAINS_DATE_MESSAGE =
  'The reason must not contain a date. Describe the correction without writing either date of birth.';

const MONTH =
  '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const YEAR4 = '(?:19|20)\\d{2}';
const ORDINAL = '(?:st|nd|rd|th)?';

const DATE_SHAPES: readonly RegExp[] = [
  // Year first: 2010-03-04, 2010/3/4, 2010.03.04, optionally with spaces.
  // Digit lookarounds, not \b: an ISO datetime ("2010-03-04T00:00") has a word
  // character straight after the day, which \b would not treat as a boundary.
  new RegExp(`(?<!\\d)${YEAR4}\\s?[-/.]\\s?\\d{1,2}\\s?[-/.]\\s?\\d{1,2}(?!\\d)`),
  // Day/month first: 04/03/2010, 4-3-10, 4.3.2010.
  new RegExp('(?<!\\d)\\d{1,2}\\s?[-/.]\\s?\\d{1,2}\\s?[-/.]\\s?(?:\\d{4}|\\d{2})(?!\\d)'),
  // Compact: yyyymmdd and ddmmyyyy.
  new RegExp(`(?<!\\d)${YEAR4}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\\d|3[01])(?!\\d)`),
  new RegExp(`(?<!\\d)(?:0[1-9]|[12]\\d|3[01])(?:0[1-9]|1[0-2])${YEAR4}(?!\\d)`),
  // Day then month name: 4 March, 4th of March, 04-Mar.
  new RegExp(`\\b\\d{1,2}${ORDINAL}\\s*(?:of\\s+)?[-/.]?\\s*${MONTH}\\b`, 'i'),
  // Month name then day: March 4, Mar 4th.
  new RegExp(`\\b${MONTH}\\.?\\s*[-/.]?\\s*\\d{1,2}${ORDINAL}\\b`, 'i'),
  // Month name with a year: March 2010, Mar, 2010, 2010 March.
  new RegExp(`\\b${MONTH}\\.?,?\\s*${YEAR4}\\b`, 'i'),
  new RegExp(`\\b${YEAR4},?\\s*${MONTH}\\b`, 'i'),
];

export function containsDateShapedString(text: string): boolean {
  return DATE_SHAPES.some((shape) => shape.test(text));
}
