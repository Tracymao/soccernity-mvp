// The one initials rule for the signed-in avatars in the site chrome (B-230,
// Decision Log #417 item 2 / #468): the header avatar (Header.tsx) and the mobile
// drawer's identity block (NavDrawer.tsx) both use it, so the two can never
// disagree about the same person. Drawn in Figma as "Avatar - Initials"
// (`6959:46000`); the rule is copied from what NavDrawer already did:
//
//   - split the name on whitespace and drop empty parts;
//   - no word -> "?"; one word -> its first letter; two or more words -> the
//     first letter of the first word plus the first letter of the LAST word
//     (middle names are ignored);
//   - upper-case, and never more than two characters.
//
// One deliberate difference from the old local copy: a "letter" is the first
// Unicode CODE POINT of the word, not the first UTF-16 unit. For every name in
// the Basic Multilingual Plane (Latin, Cyrillic, Arabic, CJK, ...) the two are
// the same, so the output is unchanged; for a word that starts outside it (an
// emoji, a rare script) the old code returned a lone surrogate half, which
// renders as a broken box (Figma pass W9, SCOPE OPEN 2). Each initial is also
// upper-cased on its own and cut to one code point, so a letter whose upper
// case is longer ("ß" -> "SS") still gives one character, keeping the
// two-character cap true.

function firstLetter(word: string): string {
  const first = Array.from(word)[0] ?? "";
  return Array.from(first.toUpperCase())[0] ?? "";
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return firstLetter(parts[0]) || "?";
  return `${firstLetter(parts[0])}${firstLetter(parts[parts.length - 1])}`;
}
