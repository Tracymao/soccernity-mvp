import { Prisma } from '@prisma/client';
import { POST_MEDIA_CODES, postMediaError } from './post-media.errors';

// backend/w14-post-media-pipeline (B-041; Decision Log #419 items 5 and 7). Attaching uploaded media to a
// new post, shared by POST /posts, POST /banter-rooms/:id/posts and POST /contest/final-entry (all go
// through FeedService.createPost, the single post-creation path).

export interface AttachableMedia {
  id: string;
  kind: 'image' | 'video';
  publicUrl: string;
}

export interface AttachRules {
  /** The final contest entry: exactly one file, and it must be a video. */
  singleVideoOnly?: boolean;
  /** Upper bound on files per post (config POST_MEDIA_MAX_PER_POST, at most 10). */
  maxPerPost?: number;
}

type Db = Pick<Prisma.TransactionClient, 'postMedia'>;

const NOT_ATTACHABLE = 'One or more of those files cannot be added to this post.';

/**
 * Loads the media a caller wants to attach and refuses anything that is not theirs, already attached,
 * rejected, or not yet verified. Returns them IN THE ORDER the caller listed them. Every refusal of
 * ownership/state is the SAME 400 so a caller learns nothing about someone else's upload ids.
 */
export async function loadAttachableMedia(
  db: Db,
  authorId: string,
  mediaIds: readonly string[],
  rules: AttachRules = {},
): Promise<AttachableMedia[]> {
  if (mediaIds.length === 0) {
    if (rules.singleVideoOnly) {
      throw postMediaError(400, POST_MEDIA_CODES.finalEntryNeedsVideo, 'A final entry needs exactly one video.');
    }
    return [];
  }
  if (new Set(mediaIds).size !== mediaIds.length) {
    throw postMediaError(400, POST_MEDIA_CODES.mediaNotAttachable, NOT_ATTACHABLE);
  }
  if (rules.maxPerPost !== undefined && mediaIds.length > rules.maxPerPost) {
    throw postMediaError(400, POST_MEDIA_CODES.mediaNotAttachable, `A post can have at most ${rules.maxPerPost} files.`);
  }
  if (rules.singleVideoOnly && mediaIds.length !== 1) {
    throw postMediaError(400, POST_MEDIA_CODES.finalEntryNeedsVideo, 'A final entry needs exactly one video.');
  }

  const rows = await db.postMedia.findMany({
    where: {
      id: { in: [...mediaIds] },
      uploaderId: authorId,
      postId: null,
      uploadState: 'ready',
      status: { not: 'rejected' },
    },
    select: { id: true, kind: true, publicUrl: true },
  });
  if (rows.length !== mediaIds.length) {
    throw postMediaError(400, POST_MEDIA_CODES.mediaNotAttachable, NOT_ATTACHABLE);
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered: AttachableMedia[] = mediaIds.map((id) => {
    const r = byId.get(id)!;
    return { id: r.id, kind: r.kind as 'image' | 'video', publicUrl: r.publicUrl as string };
  });

  if (ordered.filter((m) => m.kind === 'video').length > 1) {
    throw postMediaError(400, POST_MEDIA_CODES.tooManyVideos, 'A post can have only one video.');
  }
  if (rules.singleVideoOnly && ordered[0].kind !== 'video') {
    throw postMediaError(400, POST_MEDIA_CODES.finalEntryNeedsVideo, 'A final entry needs exactly one video.');
  }
  return ordered;
}

/**
 * Inside the post's own transaction: points the files at the new post. A guarded updateMany (still
 * unattached, still the caller's, still not rejected), so two posts racing for the same file cannot both
 * win: the loser's count comes back short and its whole transaction rolls back.
 */
export async function attachMediaToPost(
  tx: Db,
  postId: string,
  authorId: string,
  mediaIds: readonly string[],
): Promise<void> {
  if (mediaIds.length === 0) return;
  const res = await tx.postMedia.updateMany({
    where: { id: { in: [...mediaIds] }, uploaderId: authorId, postId: null, uploadState: 'ready', status: { not: 'rejected' } },
    data: { postId },
  });
  if (res.count !== mediaIds.length) {
    throw postMediaError(400, POST_MEDIA_CODES.mediaNotAttachable, NOT_ATTACHABLE);
  }
}
