import {
  BRAND_FRAGMENTS,
  CONTACT_FRAGMENTS,
  NOISE_AFFIXES,
  OWN_EMAIL_LOCAL_MIN_LENGTH,
  OWN_NAME_MIN_LENGTH,
  PHONE_LIKE_DIGIT_RUN,
  PHONE_LIKE_TOTAL_DIGITS,
  PROFANITY_CONTAINS,
  PROFANITY_ALLOWED_WHOLE_HANDLES,
  PROFANITY_CONTAINS_GUARDED,
  PROFANITY_EXACT,
  RESERVED_HANDLES,
} from './username-rules.constants';

// B-032 (Decision Log #369): the PURE username rules -- no database, no clock.
// UsernamePolicyService adds the checks that need one (club names, the revoked
// handle bar and hold, the change cooldown). See username-rules.constants.ts
// for what each list is and why it is low-precision.

export type UsernameRuleFailure =
  | 'no_letters' // a handle of only digits and underscores
  | 'reserved' // reads as Soccernity itself, staff or a system account
  | 'profanity'
  | 'contact_details' // names an email provider or another messaging platform
  | 'personal_data'; // the user's own name / email / phone-like digits / birth date

// What a rule check needs to know about the person choosing the handle. All
// optional so the same function serves tests and call sites that hold less.
export interface UsernameOwnerContext {
  displayName?: string | null;
  email?: string | null;
  // Plain (already decrypted) date of birth. Never logged or returned.
  dateOfBirth?: Date | null;
}

// Letters-and-digits form of a handle: lower case, every non-alphanumeric
// character (the underscores) removed.
export function squash(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' };

function leet(squashed: string, oneAs: 'i' | 'l'): string {
  return squashed.replace(/[0134-57]/g, (d) => (d === '1' ? oneAs : (LEET[d] ?? d)));
}

// Every normalised form a handle is matched in. A digit can stand for a letter
// ("adm1n", "4dmin") or be plain decoration ("admin2024"), so both readings are
// kept: the fully letter-mapped string, and the same after trimming leading and
// trailing digit runs first. "1" can read as i or l, so both are produced.
export function normalisedForms(raw: string): string[] {
  const base = squash(raw);
  const trimmed = base.replace(/^\d+/, '').replace(/\d+$/, '');
  const forms = new Set<string>();
  for (const source of [base, trimmed]) {
    if (!source) continue;
    forms.add(leet(source, 'i'));
    forms.add(leet(source, 'l'));
  }
  return [...forms];
}

function isReservedForm(form: string): boolean {
  for (const word of RESERVED_HANDLES) {
    if (form === word) return true;
    for (const noise of NOISE_AFFIXES) {
      if (form === noise + word || form === word + noise) return true;
    }
  }
  return BRAND_FRAGMENTS.some((b) => form.includes(b));
}

// B-181 (Decision Log #410 item 2): the handle AS TYPED, case-insensitive, is an
// allowed given name, or the name then digits only with at most one underscore
// between them. No underscore is removed first.
export function isAllowedNameHandle(raw: string): boolean {
  const names = PROFANITY_ALLOWED_WHOLE_HANDLES.join('|');
  return new RegExp(`^(?:${names})(?:_?[0-9]+)?$`, 'i').test(raw);
}

function isProfane(raw: string, forms: string[]): boolean {
  if (forms.some((f) => PROFANITY_CONTAINS.some((w) => f.includes(w)))) return true;
  // CONTAINS with named innocent exceptions ('nazi' inside Nazir, Nazim, ...): cut the
  // innocent names out, then search what is left. A space stands in for the cut so
  // the two halves cannot join up into the term.
  // B-181: a handle that IS one of the allowed given names (or the name plus
  // digits), as typed, skips this rule only.
  const allowedWholeHandle = isAllowedNameHandle(raw);
  if (
    !allowedWholeHandle &&
    forms.some((f) =>
      PROFANITY_CONTAINS_GUARDED.some(({ term, innocent }) => {
        let rest = f;
        for (const name of innocent) rest = rest.split(name).join(' ');
        return rest.includes(term);
      }),
    )
  ) {
    return true;
  }
  if (forms.some((f) => PROFANITY_EXACT.includes(f))) return true;
  // An underscore-separated token that IS a short word ("big_dick_77").
  const tokens = raw
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((t) => t.replace(/\d+$/, '').replace(/^\d+/, ''));
  return tokens.some((t) => t.length > 0 && PROFANITY_EXACT.includes(t));
}

function hasContactDetails(forms: string[]): boolean {
  return forms.some((f) => CONTACT_FRAGMENTS.some((c) => f.includes(c)));
}

function letters(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z]/g, '');
}

// The user's own details. Compared on the plain squashed form (not the
// letter-mapped one), so "ada_obi" matches "Ada Obi" but "4da0bi" does not
// start matching things by accident.
function revealsOwnDetails(raw: string, owner: UsernameOwnerContext): boolean {
  const flat = squash(raw);

  // Phone-number-like or date-like digit runs.
  if (new RegExp(`\\d{${PHONE_LIKE_DIGIT_RUN},}`).test(raw)) return true;
  if ((raw.match(/\d/g) ?? []).length >= PHONE_LIKE_TOTAL_DIGITS) return true;

  // The user's own full name, either order for two or three words.
  const name = owner.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).map(letters).filter(Boolean);
    const candidates = new Set<string>();
    candidates.add(parts.join(''));
    if (parts.length >= 2) candidates.add([...parts].reverse().join(''));
    for (const c of candidates) {
      if (c.length >= OWN_NAME_MIN_LENGTH && letters(flat).includes(c)) return true;
    }
  }

  // The local part of the user's own email address.
  const local = owner.email?.split('@')[0];
  if (local) {
    const l = squash(local);
    if (l.length >= OWN_EMAIL_LOCAL_MIN_LENGTH && flat.includes(l)) return true;
  }

  // The user's own birth year, or a full date of birth written as digits.
  const dob = owner.dateOfBirth;
  if (dob && !Number.isNaN(dob.getTime())) {
    const yyyy = String(dob.getUTCFullYear());
    const dd = String(dob.getUTCDate()).padStart(2, '0');
    const mm = String(dob.getUTCMonth() + 1).padStart(2, '0');
    if (flat.includes(yyyy)) return true;
    if (flat.includes(`${dd}${mm}${yyyy.slice(2)}`)) return true;
  }

  return false;
}

// The first rule a handle breaks, or null when the pure rules pass. The input
// is the handle as typed: format (3-30 of [A-Za-z0-9_]) is the DTO's job and is
// assumed to have passed.
export function checkUsernameRules(raw: string, owner: UsernameOwnerContext = {}): UsernameRuleFailure | null {
  if (!/[A-Za-z]/.test(raw)) return 'no_letters';

  const forms = normalisedForms(raw);
  if (forms.some(isReservedForm)) return 'reserved';
  if (isProfane(raw, forms)) return 'profanity';
  if (hasContactDetails(forms)) return 'contact_details';
  if (revealsOwnDetails(raw, owner)) return 'personal_data';
  return null;
}

// The handle reduced the way a ClubPage name is reduced in SQL
// (UsernamePolicyService.matchesClubName), so a handle that is just a club's
// name -- with or without "fc" / "official" around it -- can be refused as
// impersonation. Letters and digits only, no letter-mapping (club names are
// plain), with a leading or trailing "fc" / "official" removed.
export function clubComparableForm(raw: string): string {
  return squash(raw).replace(/^(fc|official)+/, '').replace(/(fc|official)+$/, '');
}
