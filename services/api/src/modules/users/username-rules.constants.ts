// B-032 (Decision Log #369, #398 D3, #402 item 3): the username rules.
// #369 left the rules "specified in the build PR, not decided"; THIS file and
// username-rules.util.ts are that specification. Everything here that the
// founder has not decided is an adopted default, veto-able, listed in
// docs/backend-w4-username-report.md.
//
// Matching is deliberately LOW-PRECISION, English-only and string-based, the
// same stance as the pre-publication sensitive-content screen
// (sensitive-content.util.ts). It is a first line, not moderation: a handle that
// gets through is handled by the admin revoke (B-033), which is why that exists.

// How long a changed username must stand before it can be changed again. Only a
// change from one value to another starts the clock; the first choice (or the
// pick after an admin revoke) does not -- see User.usernameChangedAt.
export const USERNAME_CHANGE_COOLDOWN_DAYS = 30;

// Decision Log #398 D3 / #402 item 3: a revoked handle is held, for everyone,
// for this long. (The revoked user can never re-pick it, hold or no hold.)
export const USERNAME_REVOKE_HOLD_DAYS = 30;

// Stable machine code for every "this username is not allowed" refusal, so the
// web app can branch on it without parsing prose.
export const USERNAME_NOT_ALLOWED_CODE = 'username_not_allowed';
export const USERNAME_CHANGE_COOLDOWN_CODE = 'username_change_cooldown';
export const USERNAME_REQUIRED_CODE = 'username_required';

// Handles that must not be taken because they read as Soccernity itself, its
// staff, or a system account. Compared against the NORMALISED handle (lower
// case, underscores removed, digits that look like letters mapped back -- see
// normaliseForMatching), either exactly or with one of NOISE_AFFIXES attached
// ("realadmin", "supportteam", "adminofficial").
export const RESERVED_HANDLES: readonly string[] = [
  'admin',
  'administrator',
  'superadmin',
  'moderator',
  'moderation',
  'mod',
  'staff',
  'support',
  'helpdesk',
  'help',
  'official',
  'system',
  'root',
  'security',
  'safeguarding',
  'safety',
  'trustandsafety',
  'team',
  'owner',
  'founder',
  'ceo',
  'legal',
  'privacy',
  'press',
  'billing',
  'abuse',
  'postmaster',
  'webmaster',
  'noreply',
  'info',
  'contact',
  'null',
  'undefined',
  'anonymous',
  'deleted',
  'deleteduser',
  'member',
  'me',
  'you',
  'everyone',
  'all',
];

// Words that, attached to a reserved handle, do not make it a different one.
export const NOISE_AFFIXES: readonly string[] = [
  'the',
  'real',
  'official',
  'iam',
  'im',
  'my',
  'mr',
  'mrs',
  'ms',
  'team',
  'hq',
  'bot',
  'support',
  'staff',
  'mod',
  'app',
];

// The platform's own name is reserved wherever it appears in the handle.
export const BRAND_FRAGMENTS: readonly string[] = ['soccernity'];

// Offensive terms. CONTAINS: long or distinctive enough that an innocent handle
// containing them is rare (a Scunthorpe-style false positive is accepted and
// the user is simply asked to choose another name). EXACT: short or ambiguous
// words that are also parts of ordinary names ("torpedo", "Nazir", "Dickson"),
// refused only when the handle IS the word (after normalisation) or when an
// underscore-separated token of the raw handle is exactly the word.
export const PROFANITY_CONTAINS: readonly string[] = [
  'fuck',
  'shit',
  'bitch',
  'cunt',
  'whore',
  'slut',
  'nigg',
  'fagg',
  'retard',
  'rapist',
  'paedophile',
  'pedophile',
  'molest',
  'incest',
  'porn',
  'penis',
  'vagina',
  'cumshot',
  'blowjob',
  'handjob',
  'terrorist',
  // QA D-06 (Decision Log #407 item 3): long, unambiguous hate and sexual
  // terms. Before this they sat in PROFANITY_EXACT, so a handle with letters
  // glued on either side (xxhitlerxx) passed. No ordinary name or word that a
  // person is likely to choose contains any of these, so the Scunthorpe-style
  // false positive is accepted, as for the terms above.
  'hitler',
  'pussy',
  'paedo',
  'swastika',
  'whitepower',
  'gangbang',
  'deepthroat',
  'creampie',
  'orgasm',
  'masturbat',
  'erotic',
];

// CONTAINS, with named exceptions. 'nazi' is four letters and sits inside real
// given names (Nazir, Nazim, Nazia, Nazih, Nazik), so a plain CONTAINS would
// refuse them. The innocent names are cut out of the handle first; whatever is
// left is then searched. 'nazifan' / 'xxnazixx' / 'nazirnazi' are refused;
// 'nazir10' / 'nazim_fc' are accepted. 'Nazif' / 'Nazifa' / 'Nazifah' are real
// names too, but a named exception ('nazif') would cut them out of 'nazifan'
// and accept it (B-165, Decision Log #408 item 3), so they are allowed as
// WHOLE handles only: see PROFANITY_ALLOWED_WHOLE_HANDLES.
export const PROFANITY_CONTAINS_GUARDED: ReadonlyArray<{ term: string; innocent: readonly string[] }> = [
  { term: 'nazi', innocent: ['nazir', 'nazim', 'nazia', 'nazih', 'nazik'] },
];

// B-165 (Decision Log #408 item 3): real given names that start with 'nazi'.
// Allowed only when the handle IS the name (letters and digits with underscores
// removed, no digit-to-letter mapping); this exempts the CONTAINS rule above and
// nothing else. 'nazifan', 'nazifah_fan', 'xxnazifxx' and 'nazif_10' are NOT
// covered and stay refused; whether suffixes should be accepted is not decided.
export const PROFANITY_ALLOWED_WHOLE_HANDLES: readonly string[] = ['nazif', 'nazifa', 'nazifah'];

export const PROFANITY_EXACT:readonly string[] = [
  'dick',
  'cock',
  'anal',
  'anus',
  'sex',
  'sexy',
  'rape',
  'nazi',
  'kkk',
  'isis',
  'pedo',
  'tits',
  'boobs',
  'ass',
  'arse',
  'twat',
  'wank',
  'cum',
  'nude',
  'nudes',
];

// Contact details and off-platform handles: a username that advertises another
// way to reach the account holder is a safeguarding concern on a platform with
// minors (and a way to put a real identity into a "pseudonym").
export const CONTACT_FRAGMENTS: readonly string[] = [
  'whatsapp',
  'telegram',
  'snapchat',
  'instagram',
  'tiktok',
  'discord',
  'gmail',
  'hotmail',
  'yahoo',
  'outlook',
  'icloud',
  'protonmail',
];

// Digit runs that look like a phone number or a full date of birth.
export const PHONE_LIKE_DIGIT_RUN = 6;
export const PHONE_LIKE_TOTAL_DIGITS = 8;

// Own-name matching only considers names at least this long, so a short name
// ("Al", "Jo") does not make a lot of ordinary handles unavailable.
export const OWN_NAME_MIN_LENGTH = 4;
// The email local part is compared the same way.
export const OWN_EMAIL_LOCAL_MIN_LENGTH = 5;

export const USERNAME_NOT_ALLOWED_MESSAGE = 'That username is not available. Please choose another.';
// The one refusal that says why: it is about the user's OWN details, so naming
// the reason leaks nothing and tells a child what to avoid.
export const USERNAME_PERSONAL_DATA_MESSAGE =
  "Usernames can't include your name, email address, phone number or date of birth. Please choose another.";
