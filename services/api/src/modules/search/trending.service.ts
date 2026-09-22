import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TRENDING_HALF_LIFE_HOURS, TRENDING_WINDOW_HOURS } from './trending.constants';

// Raw shape $queryRaw below actually returns. postCount is explicitly
// cast to ::INTEGER in the SQL (see getTrending's own comment on why);
// score is a genuine SQL `double precision`, which the pg driver already
// maps straight to a JS `number` with no cast needed.
interface TrendingHashtagRow {
  tag: string;
  postCount: number;
  score: number;
}

export interface TrendingHashtagResult {
  tag: string;
  // The RAW (undecayed) number of posts using this hashtag within the
  // window -- returned purely for transparency/debuggability. This is
  // NEVER the sort key; `score` is.
  postCount: number;
  // The time-decayed trending score (see trending.constants.ts). Higher
  // is more "trending right now." Not a percentage or a bounded value --
  // an arbitrary positive float, meaningful only relative to the other
  // items in the same response.
  score: number;
}

export interface TrendingResult {
  items: TrendingHashtagResult[];
}

// GET /trending (Build Plan Section 4.7). See trending.constants.ts for
// the decay/window reasoning and search/README.md's "Trending topics"
// section for the full write-up, including why no hashtag/topic model
// existed anywhere in this codebase before this PR.
//
// No pagination/cursor is offered here, unlike every list endpoint
// elsewhere in this codebase (feed/cursor.util.ts, clubs/cursor.util.ts,
// this module's own cursor.util.ts for GET /search) -- deliberately. A
// keyset cursor identifies a stable position in a stable ordering; this
// endpoint's ordering is a SNAPSHOT score that reorders between one call
// and the next as new posts land and old ones decay out of the window,
// so "continue from where I left off" has no coherent meaning here.
// `limit` alone (a plain top-N cut) is the right and sufficient shape.
@Injectable()
export class TrendingService {
  constructor(private readonly prisma: PrismaService) {}

  // `now` defaults to the real clock but is an explicit parameter, the
  // same LeaderboardRollupService.runRollup(now) precedent — so a test
  // can prove window/decay behavior deterministically without mocking
  // global time. The real HTTP path (TrendingController) always calls
  // this with no second argument, which is fine: the default covers it.
  async getTrending(limit: number, now: Date = new Date()): Promise<TrendingResult> {
    const windowStart = new Date(now.getTime() - TRENDING_WINDOW_HOURS * 60 * 60 * 1000);

    // One raw, parameterized $queryRaw, not Prisma's query builder — the
    // same established precedent LeaderboardRollupService.rollupPeriod
    // and ClubsService's own raw SQL already set in this codebase for
    // "the ORM cannot express this aggregation": Prisma's query builder
    // has no GROUP BY + arbitrary-SQL-expression SUM, which the
    // exponential decay weight (POWER(2, -ageInHours / halfLifeHours))
    // needs.
    //
    // COUNT(*) returns bigint (int8) by default, which node-postgres (and
    // therefore Prisma's $queryRaw) would otherwise hand back as a JS
    // `bigint`, not a plain `number` — the same reason
    // LeaderboardRollupService's own aggregation casts its computed
    // columns to ::INTEGER (see that file's own comment).
    //
    // The `2::DOUBLE PRECISION` cast on POWER's base, and the outer
    // CAST(... AS DOUBLE PRECISION) on the whole SUM, are both load-
    // bearing, confirmed by a real e2e failure during development (see
    // test/trending.e2e-spec.ts) — without them, Postgres resolves
    // POWER(2, ...) to its NUMERIC overload (the bare integer literal
    // `2` combined with the ${TRENDING_HALF_LIFE_HOURS} parameter's
    // inferred numeric type), and node-postgres returns a Postgres
    // `numeric` as a JS STRING (e.g. "0.890897...") to avoid silent
    // precision loss — not a plain `number` at all, breaking
    // `score > score` comparisons and ORDER BY on the JS side. Forcing
    // double-precision arithmetic throughout gets a genuine JS `number`
    // back, with more than enough precision for a ranking score.
    //
    // Rows older than `windowStart` are excluded from the query entirely
    // (never merely decayed toward zero) — see trending.constants.ts on
    // why the window and the half-life are chosen to work together.
    const rows = await this.prisma.$queryRaw<TrendingHashtagRow[]>`
      SELECT
        h."tag" AS "tag",
        CAST(COUNT(*) AS INTEGER) AS "postCount",
        CAST(
          SUM(
            POWER(2::DOUBLE PRECISION, -1.0 * EXTRACT(EPOCH FROM (${now} - ph."createdAt")) / (3600.0 * ${TRENDING_HALF_LIFE_HOURS}))
          )
        AS DOUBLE PRECISION) AS "score"
      FROM "PostHashtag" ph
      INNER JOIN "Hashtag" h ON h.id = ph."hashtagId"
      WHERE ph."createdAt" >= ${windowStart}
      GROUP BY h.id, h."tag"
      ORDER BY "score" DESC
      LIMIT ${limit}
    `;

    return { items: rows };
  }
}
