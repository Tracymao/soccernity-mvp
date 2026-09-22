import { Prisma } from '@prisma/client';

// sprint-4/trending-topics-backend -- Build Plan Section 4.7 (GET
// /trending). No hashtag/topic model existed anywhere in this codebase
// before this PR (schema.prisma had no Hashtag/PostHashtag model at
// all). This is the single write primitive: called from
// FeedService.createPost's own $transaction (feed.service.ts), the ONE
// place a Post is ever created in this codebase, the same way
// points.util.ts's awardPoints() is called from that same transaction
// for engagement points.
//
// A plain function, NOT a NestJS service, for the identical reason
// points.util.ts documents on its own awardPoints(): it is called from
// FeedModule's own service, and a real HashtagService/SearchModule
// import would force FeedModule to import SearchModule for a one-line
// write. Always called with a transaction client
// (Prisma.TransactionClient) -- extraction lands atomically with the
// Post row itself, so a rolled-back post creation never leaves an
// orphaned Hashtag/PostHashtag row behind.

// v1 simplification, disclosed rather than silently shipped (mirrors
// search.service.ts's own "v1 simplification" header comment style): a
// simple #(\w+) regex scan over Post.contentText, not a real
// tokenizer/parser. \w matches [A-Za-z0-9_] only -- no Unicode word
// characters -- so a non-Latin hashtag like "#日本" is not extracted at
// all, and an accented one like "#café" is truncated at the first
// non-ASCII character ("#café" extracts "caf", not "café"). The same
// ASCII-only limitation search.service.ts's own ILIKE matching already
// carries (see search/README.md). Every extracted tag is lowercased
// before storage, so "#EPL" and "#epl" are the same Hashtag row -- there
// is no case-preserving "display form" kept anywhere; this module is
// backend-only (no frontend consumes it yet), so there is nothing to
// render the original casing to.
const HASHTAG_PATTERN = /#(\w+)/g;

// A crude spam/abuse guard, not a real limit anyone has specified: a
// pathological "word" of thousands of characters (there is no upper
// bound on \w+ on its own) is simply not recorded as a hashtag at all,
// rather than polluting the Hashtag table with something no one would
// ever plausibly search for or see trending. Real hashtags in the wild
// are short; 50 is a generous, arbitrary ceiling, not a researched one.
export const HASHTAG_MAX_TAG_LENGTH = 50;

// Extracts, normalizes (lowercase), de-duplicates, and length-filters
// every hashtag in a post's contentText. De-duplication matters here
// specifically because PostHashtag.@@unique([postId, hashtagId]) would
// otherwise throw P2002 on a post that repeats a tag twice (e.g.
// "#EPL news, more #epl talk") -- dedupe happens here, once, rather than
// wrapping every insert below in a try/catch for that one case.
export function extractHashtags(contentText: string): string[] {
  const matches = contentText.matchAll(HASHTAG_PATTERN);
  const tags = new Set<string>();
  for (const match of matches) {
    const tag = match[1].toLowerCase();
    if (tag.length <= HASHTAG_MAX_TAG_LENGTH) {
      tags.add(tag);
    }
  }
  return [...tags];
}

// Extracts every hashtag in `contentText` and records it against `postId`
// -- an upsert on Hashtag (incrementing the denormalized, all-time
// postCount cache per schema.prisma's own comment on that field) plus a
// fresh PostHashtag join row per tag, `createdAt` set to the POST's own
// createdAt (`occurredAt`), never `now()` -- see PostHashtag's own schema
// comment on why that distinction matters for the trending decay
// computation. A post with no hashtags at all is a correct, cheap no-op
// (the regex simply matches nothing).
//
// Sequential awaits inside the loop, not Promise.all -- the same
// established convention every other multi-row write inside a single
// $transaction in this codebase already follows (e.g.
// ContestService.recordRoundResults' own for-of loop over
// tx.contestRoundWinner.create), since concurrent queries sharing one
// interactive-transaction client are not safe.
export async function recordPostHashtags(
  tx: Prisma.TransactionClient,
  postId: string,
  contentText: string,
  occurredAt: Date,
): Promise<void> {
  const tags = extractHashtags(contentText);

  for (const tag of tags) {
    const hashtag = await tx.hashtag.upsert({
      where: { tag },
      create: { tag, postCount: 1 },
      update: { postCount: { increment: 1 } },
      select: { id: true },
    });

    await tx.postHashtag.create({
      data: { postId, hashtagId: hashtag.id, createdAt: occurredAt },
    });
  }
}
