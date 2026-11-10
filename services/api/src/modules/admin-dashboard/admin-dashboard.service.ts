import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { APP_CLOCK, Clock, systemClock } from '../../clock/clock';
import { PrismaService } from '../../prisma/prisma.service';
import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';
import { POST_NOT_REMOVED } from '../moderation/content-removal.util';
import { resolvePublicName } from '../users/public-name.util';
import { PageViewService, type MonthlyPageViewCount } from '../page-views/page-view.service';
import { DASHBOARD_LATEST_POSTS_DEFAULT } from './admin-dashboard.constants';
import { type DashboardMediaType, toExcerpt, toMediaType } from './latest-posts.util';
import { startOfCurrentMonthUtc } from './month.util';

// GET /admin/dashboard/stats' response shape. Every field here is
// directly computable from data this codebase already has.
//
// `totalVisits`/`visitsByMonth` were formerly `totalVisits: null` with no
// second field at all — see this module's own README.md's Decision Log
// #306 entry for the full history. feat/admin-dashboard-page-views
// resolves that: both are now real, backed by the new, strictly
// anonymous PageView model (modules/page-views/). `totalVisits` can
// genuinely be `0` now (no page views recorded yet) — that is an honest
// reading, not the old ambiguous "we don't track this" null.
export interface AdminDashboardStats {
  newUsersThisMonth: number;
  totalArticlesPublished: number;
  communityUsersTotal: number;
  totalVisits: number;
  visitsByMonth: MonthlyPageViewCount[];
}

// B-056 (Decision Log #472): one row of the Dashboard's "Latest posts" table. The author is the PUBLIC name
// (username, else the shared placeholder) and nothing else: no real name, no email, no account id.
export interface DashboardLatestPost {
  id: string;
  createdAt: Date;
  mediaType: DashboardMediaType;
  excerpt: string;
  author: { publicName: string };
  likeCount: number;
  commentCount: number;
}

// Which posts may appear in "Latest posts". DEFAULT, founder-veto-able (the register says this is not decided):
//  - the author must be an ACTIVE account: deactivated, pending-deletion, suspended and anonymised ('deleted')
//    authors are left out;
//  - the author must not be a minor (isMinor) or under 16 (isUnder16). A restricted-pending account is by
//    definition a minor whose guardian has not confirmed, so it is excluded by the same condition; a minor with
//    confirmed consent is excluded too, so an editor never sees a minor's post on this screen;
//  - the post must be visible: a final contest entry before its reveal (Post.visibleFrom) is hidden, and a post
//    with any media that is not approved (pending, rejected, or held for review) is hidden.
// B-289: Post.removedByModerationAt (a moderator's soft removal) is left out too; DELETE /posts/:id is a hard delete.
function latestPostsWhere(now: Date): Prisma.PostWhereInput {
  return {
    author: { accountStatus: 'active', isMinor: false, isUnder16: false },
    // B-289 (Decision Log #483): a post a moderator removed is not "a latest post" any more.
    AND: [{ OR: [{ visibleFrom: null }, { visibleFrom: { lte: now } }] }, POST_MEDIA_ALL_APPROVED, POST_NOT_REMOVED],
  };
}

// Build Plan Section 4.8 (Admin Service) — the Dashboard's literal
// contract line. See README.md for the full reasoning, including why
// this is its own module rather than folded into AdminUsersModule (they
// shipped in the same PR, sequenced together specifically because two of
// these three real stats are User-table reads, but "manage a user" and
// "aggregate-report across models" are a different job).
@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pageViewService: PageViewService,
    @Optional() @Inject(APP_CLOCK) private readonly clock: Clock = systemClock,
  ) {}

  // GET /admin/dashboard/latest-posts. Newest first (createdAt, then the monotonic Post.sequence as the
  // tiebreaker, so posts sharing a millisecond keep creation order). Plain reads only.
  async getLatestPosts(limit: number = DASHBOARD_LATEST_POSTS_DEFAULT): Promise<DashboardLatestPost[]> {
    const rows = await this.prisma.post.findMany({
      where: latestPostsWhere(this.clock.now()),
      orderBy: [{ createdAt: 'desc' }, { sequence: 'desc' }],
      take: limit,
      select: {
        id: true,
        createdAt: true,
        contentText: true,
        mediaUrls: true,
        likeCount: true,
        commentCount: true,
        media: { select: { kind: true } },
        // username, plus displayName ONLY so resolvePublicName can recognise the '[deleted user]' sentinel;
        // it is never copied into the response.
        author: { select: { username: true, displayName: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt,
      mediaType: toMediaType(
        row.media.map((m) => m.kind),
        row.mediaUrls,
      ),
      excerpt: toExcerpt(row.contentText),
      author: { publicName: resolvePublicName(row.author) },
      likeCount: row.likeCount,
      commentCount: row.commentCount,
    }));
  }

  async getStats(now: Date = new Date()): Promise<AdminDashboardStats> {
    const monthStart = startOfCurrentMonthUtc(now);

    const [newUsersThisMonth, totalArticlesPublished, communityUsersTotal, totalVisits, visitsByMonth] =
      await Promise.all([
        this.prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
        this.prisma.article.count({ where: { status: 'published' } }),
        this.prisma.user.count(),
        this.pageViewService.getTotalViewCount(),
        this.pageViewService.getMonthlyViewCounts(undefined, now),
      ]);

    return { newUsersThisMonth, totalArticlesPublished, communityUsersTotal, totalVisits, visitsByMonth };
  }
}
