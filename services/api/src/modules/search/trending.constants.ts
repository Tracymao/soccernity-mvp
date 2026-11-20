// GET /trending (Build Plan Section 4.7) -- v1 simplification, disclosed
// per search/README.md's own "Trending topics" section: trending is a
// TIME-DECAYED score over a rolling window, not an all-time count. An
// all-time count would mean nothing new could ever displace an early,
// heavily-used hashtag -- Hashtag.postCount (the denormalized all-time
// cache schema.prisma's own comment documents) is explicitly NOT what
// trending.service.ts reads from for this reason.
//
// Exponential decay with a half-life: each PostHashtag row inside the
// window contributes 2^(-ageInHours / TRENDING_HALF_LIFE_HOURS) to its
// hashtag's score, so a post `ageInHours` old counts for HALF as much as
// a post from right now once ageInHours reaches the half-life, a QUARTER
// once it reaches 2x the half-life, and so on. This is a simple,
// well-understood decay shape (the same family Hacker News's own ranking
// algorithm uses) -- picked for clarity over tuning, per this task's own
// "doesn't need to be sophisticated for v1, just documented" brief.
//
// TRENDING_WINDOW_HOURS bounds the SQL query itself (rows older than this
// are never read at all, not merely decayed toward zero) -- this both
// caps the worst-case table scan and matches "trending" meaning
// "recently active," not "ever active." The two constants are chosen to
// work together, not fight each other: at the window's own edge (48h), a
// post has already decayed to 2^(-48/6) ≈ 0.4% of its original weight
// under TRENDING_HALF_LIFE_HOURS=6 -- functionally negligible well before
// the window would have cut it off outright.
export const TRENDING_WINDOW_HOURS = 48;
export const TRENDING_HALF_LIFE_HOURS = 6;

// A small, deterministic top-N list, not a browsable/paginated catalog --
// see trending.service.ts's own header comment for why no cursor is
// offered here, unlike every list endpoint elsewhere in this codebase.
export const TRENDING_DEFAULT_LIMIT = 10;
export const TRENDING_MAX_LIMIT = 50;
