import { Prisma } from '@prisma/client';

// backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419 item 5). The read gate for posts with
// uploaded media: a post with ANY attached media that is not 'approved' (pending or rejected) is visible
// to its AUTHOR only; everyone else gets the same 404 as a post that does not exist. A post with no
// media, or with only approved media, is unaffected.
//
// One fragment, reused by every read path (feed, single post, saved posts, comments, search, the contest
// entry lists and the Final-week carousel), so no read path can forget it. It composes with the existing
// Post.visibleFrom gate and the block filter by AND.

/** True for a post whose attached media are ALL approved (vacuously true with none). */
export const POST_MEDIA_ALL_APPROVED: Prisma.PostWhereInput = {
  media: { none: { status: { not: 'approved' } } },
};

/** The media gate for a viewer: the author always passes; anyone else needs every media approved. */
export function postMediaVisibleTo(viewerId?: string): Prisma.PostWhereInput {
  return viewerId ? { OR: [{ authorId: viewerId }, POST_MEDIA_ALL_APPROVED] } : POST_MEDIA_ALL_APPROVED;
}
