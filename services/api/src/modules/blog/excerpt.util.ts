// Article (schema.prisma) has no `excerpt` column — BlogPage.tsx's own
// dummy data has one, but Section 3 doesn't. Two real options were
// weighed before writing any code here:
//
//   (a) add a real `Article.excerpt String?` column, editable from the
//       admin Create/Edit Article form, the same "flag a genuine schema
//       addition rather than add it silently" precedent
//       Article.createdAt / Category.status each set.
//   (b) truncate `Article.body` server-side at read time, on this
//       (public) side only, and never store anything new.
//
// (a) was rejected for THIS ticket specifically: making a real column
// useful means giving an admin a way to SET it, which means editing
// admin-content.service.ts's CreateArticleDto/UpdateArticleDto and the
// two service methods that consume them — and this ticket's own brief
// is explicit that admin-content's behavior stays unchanged. Building a
// real `excerpt` field is therefore bigger than "a clean, small
// addition" once the write side is accounted for, not just a bare
// migration — so it's deferred, not built, and flagged as a Decision Log
// candidate in README.md the same way Category.status was flagged in
// the prior sprint rather than being added silently.
//
// (b) is what ships: a plain, unstored, word-boundary truncation of
// `body`, computed once per request in BlogService and never persisted
// anywhere. It's a real substitute, not a stopgap masquerading as one —
// re-truncating on every read costs nothing a Postgres text column
// wouldn't also cost to select, and it can be swapped for a real column
// later with zero API-shape change (the response already returns a
// field literally named `excerpt`).
export const EXCERPT_MAX_LENGTH = 200;

export function truncateExcerpt(body: string, maxLength: number = EXCERPT_MAX_LENGTH): string {
  const trimmed = body.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const sliced = trimmed.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return `${base.trimEnd()}…`;
}
