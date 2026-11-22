// R107: a username that the username rules can never refuse.
// The generator only uses the ten letters in SAFE_LETTERS and never a digit or an underscore, so by construction:
//  - no profane, reserved, brand or contact term can appear (every one of them contains a letter outside
//    SAFE_LETTERS plus the leading "u", see username-rules.constants.ts),
//  - the digit rules (phone-like runs, birth year) cannot fire,
//  - the handle cannot contain the owner's email local part, display name or date of birth.
// Uniqueness comes from the run's start time, a per-process random part and the counter, all written as letters.
export const SAFE_LETTERS = 'bdgjpqvwxz';
let usernameCounter = 0;
const RUN_START_MS = Date.now();
const RUN_RANDOM = Array.from({ length: 4 }, () => SAFE_LETTERS[Math.floor(Math.random() * SAFE_LETTERS.length)]).join('');
function digitsToLetters(digits: string): string {
  return digits
    .split('')
    .map((d) => SAFE_LETTERS[Number(d)])
    .join('');
}
/** A handle (3-30 chars, letters only) the username rules accept. `label` is accepted for call-site readability only and is not used. */
export function uniqueUsername(_label?: string): string {
  usernameCounter += 1;
  return `u${digitsToLetters(String(RUN_START_MS))}${RUN_RANDOM}${digitsToLetters(String(usernameCounter).padStart(4, '0'))}`;
}

