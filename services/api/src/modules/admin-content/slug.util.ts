// Server-side slug derivation for Category.slug — never trust a
// client-supplied slug (the task brief's own explicit instruction);
// CreateCategoryDto/UpdateCategoryDto don't even accept a `slug` field.
// Lowercase, non-alphanumeric runs collapsed to a single hyphen, leading/
// trailing hyphens trimmed. Uniqueness itself is enforced by
// Category.slug's own @unique constraint (see
// AdminContentService.createCategory/updateCategory's P2002 handling) —
// this function only computes the candidate value.
export function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // A name made entirely of symbols/whitespace-adjacent punctuation
  // (e.g. "!!!") would otherwise slugify to an empty string, which can
  // never satisfy Category.slug's @unique constraint for more than one
  // such category. Extremely unlikely given CreateCategoryDto's own
  // @MinLength(1) on `name`, but a real edge case, not a hypothetical.
  return base || `category-${Date.now()}`;
}
