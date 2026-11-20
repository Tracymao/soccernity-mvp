import { Prisma } from '@prisma/client';

// backend/b289-content-removal (B-289, Decision Log #483): the three read fragments, kept in their OWN file
// (no other imports) so code that is itself called FROM content-removal.util.ts -- the contest removal seam
// (B-300, Decision Log #488) -- can use them without an import cycle. content-removal.util.ts re-exports
// them, so every existing import of `POST_NOT_REMOVED` etc. from there is unchanged.

/**
 * Read fragment: a post a moderator has NOT removed. ANDed into every user-facing post read (feeds, search, saved
 * items, single post, comments, reactions, counts, contest lists, trending). One constant, so a new read path has
 * a single obvious thing to add.
 */
export const POST_NOT_REMOVED: Prisma.PostWhereInput = { removedByModerationAt: null };

/** Same for comments (used where a comment is counted or looked up for an action; the thread shows a stub). */
export const COMMENT_NOT_REMOVED: Prisma.CommentWhereInput = { removedByModerationAt: null };

/** Same for messages. */
export const MESSAGE_NOT_REMOVED: Prisma.MessageWhereInput = { removedByModerationAt: null };
