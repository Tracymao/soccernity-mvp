import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Build Plan Section 5.5: "Paginate and lazy-load all feed, search and
// match-data endpoints — never return unbounded lists." GET /posts/feed
// is the first list endpoint built in this codebase, so this DTO is also
// the first precedent for query-param pagination here.
//
// Cursor-based (keyset), not offset-based: an offset ("skip N rows")
// degrades under concurrent inserts — a feed being written to while
// being paged through is the normal case, not an edge case, so a page-2
// request computed from a stale offset can skip or repeat rows once new
// posts land between page 1 and page 2. `cursor` instead encodes the
// exact (createdAt, id) position of the last row the client already
// saw — see feed.service.ts for how it's built/consumed. Opaque to the
// client on purpose (base64 of an internal JSON shape) so it isn't
// something a client is expected to construct or parse itself.
//
// Default/max page size: 20 default, 50 max. Both are deliberate,
// documented choices (Section 5.5 doesn't specify numbers) — 20 keeps a
// single response small under throttled/3G-equivalent conditions
// (Section 5.5), 50 is a hard ceiling so a client can't request an
// arbitrarily large page regardless of what it passes.
export class FeedQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export const FEED_DEFAULT_PAGE_SIZE = 20;
export const FEED_MAX_PAGE_SIZE = 50;
