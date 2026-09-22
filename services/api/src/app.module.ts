import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { SentryModule } from '@sentry/nestjs/setup';
import { HealthModule } from './health/health.module';
import { PasswordResetModule } from './modules/auth/password-reset/password-reset.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuthRegistrationModule } from './modules/auth/registration/registration.module';
import { GuardianConsentModule } from './modules/auth/guardian-consent/guardian-consent.module';
import { UsersModule } from './modules/users/users.module';
import { FeedModule } from './modules/feed/feed.module';
import { ClubsModule } from './modules/clubs/clubs.module';
import { AccountDeletionModule } from './modules/account-deletion/account-deletion.module';
import { AgeReclassificationModule } from './modules/age-reclassification/age-reclassification.module';
import { AdminModule } from './modules/admin/admin.module';
import { ContestModule } from './modules/contest/contest.module';
import { GrassrootsModule } from './modules/grassroots/grassroots.module';
import { BanterModule } from './modules/banter/banter.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { CommunityGroupsModule } from './modules/community-groups/community-groups.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { AdminContentModule } from './modules/admin-content/admin-content.module';
import { AdminUsersModule } from './modules/admin-users/admin-users.module';
import { AdminDashboardModule } from './modules/admin-dashboard/admin-dashboard.module';
import { MediaModule } from './modules/media/media.module';
import { BlogModule } from './modules/blog/blog.module';
import { SportsModule } from './modules/sports/sports.module';
import { SearchModule } from './modules/search/search.module';

// Feature modules land in src/modules/* as each is built — see the
// Sprint-by-Sprint Backlog (MVP Build Plan Section 6) for build order.
// Do not import Discover- or Careers-pillar modules; they are out of
// MVP scope per Build Plan Section 2.2.
@Module({
  imports: [
    // Must be the first import per @sentry/nestjs setup docs. Safe to import
    // even when SENTRY_DSN is unset — Sentry.init() was never called (see
    // src/instrument.ts), so the interceptors this module wires up become
    // no-ops rather than doing anything.
    SentryModule.forRoot(),
    // envFilePath is explicit and built from __dirname (this compiled
    // file's real on-disk location — services/api/dist/ under both
    // `nest start` and `nest build`, per nest-cli.json's default
    // sourceRoot/outDir), not left to default. This is a confirmed bug
    // fix, not a hypothetical one: the default envFilePath resolves
    // relative to process.cwd(), and there is no services/api/.env —
    // only the repo-root one, per CLAUDE.md's "one root .env for now"
    // decision (see PR #8's flagged gap, and CLAUDE.md's Environment
    // variables section). __dirname sidesteps process.cwd() entirely,
    // so this resolves correctly no matter how the process is launched
    // — via `npm run dev:api` from the repo root, directly from inside
    // services/api, or a process manager invoking dist/main.js with an
    // arbitrary cwd. Do not "simplify" this back to a bare
    // envFilePath-less ConfigModule.forRoot({ isGlobal: true }) call.
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: join(__dirname, '..', '..', '..', '.env'),
    }),
    // Registered once, globally — any @Cron()/@Interval()/@Timeout()
    // decorator anywhere in the app (currently just
    // AccountDeletionSweepService) needs this to actually run; it does
    // not belong to that module specifically.
    ScheduleModule.forRoot(),
    HealthModule, // Sprint 0 infra — MVP Build Plan Section 5
    PasswordResetModule, // Sprint 1 / PR B4 — /auth/forgot-password, /auth/reset-password
    AuthModule, // Sprint 1 / PR B3 — login, refresh, logout (Section 4.1 / 5.7)
    // Sprint 1 / PR B2 — POST /auth/register, POST /auth/verify-email
    // only (Build Plan Section 4.1). Deliberately its own module, not a
    // shared "AuthModule" — see registration.module.ts. B3/B4/B6 add the
    // rest of the Auth/User endpoints in their own parallel modules; a
    // small merge-order conflict on the lines around this import is
    // expected when those land, not something to avoid architecturally.
    AuthRegistrationModule,
    GuardianConsentModule, // Sprint 1 / PR B5 — /auth/guardian-consent (Section 4.1 / 8.3 step 4)
    UsersModule, // Sprint 1 — B6 (profile endpoints, Section 4.2, self-scope only for now)
    // Sprint 2 — Section 4.3 slice one only: POST /posts + GET /posts/feed.
    // GET /posts/:id, like, comment, save (also Section 4.3) are a
    // separate follow-up slice — see modules/feed/README.md.
    FeedModule,
    // Sprint 2 — Section 4.4 (Club & Banter Service), club subset only:
    // GET /clubs, GET /clubs/:id, POST /clubs/:id/join. /banter-rooms*
    // (the other half of Section 4.4) remains Sprint 3 — see
    // modules/clubs/README.md.
    ClubsModule,
    // sprint-2/account-deletion-sweep — Build Plan Section 9, Decision
    // Log #42. No route: registers AccountDeletionSweepService's daily
    // @Cron() job only. See modules/account-deletion/README.md.
    AccountDeletionModule,
    AgeReclassificationModule,
    // sprint-2/admin-console-account-entity — Decision Log #54. Admin
    // Console account/auth/profile slice ONLY: POST /admin/auth/login,
    // /admin/auth/refresh, /admin/auth/logout, /admin/auth/change-password,
    // GET/PATCH /admin/profile. Section 4.8's moderation-queue endpoints
    // are now built too, but in a separate module — see ModerationModule
    // below and modules/admin/README.md.
    AdminModule,
    // sprint-5/admin-moderation-queue-backend — Section 4.8 (Admin
    // Service) + Section 8.4 (Moderation & appeals workflow). POST
    // /reports, POST /reports/:id/appeal (both JwtAuthGuard-only —
    // genuine spec-gap additions, Section 4 defines neither route
    // literally), GET/PATCH /admin/moderation/reports*
    // (AdminJwtAuthGuard + the first role-gated admin route in this
    // codebase — moderator/superadmin only, not editor). Report gained
    // reviewer/action/appeal-trail columns (migration
    // 20260915003318_add_report_moderation_fields), a genuine schema
    // addition beyond Section 3's original six-field list — see
    // modules/moderation/README.md.
    ModerationModule,
    // sprint-5/admin-articles-categories-backend — Section 4.8 (Admin
    // Service), the Article/Category management half. GET/POST
    // /admin/articles, PATCH /admin/articles/:id, GET/POST
    // /admin/categories, PATCH /admin/categories/:id — all
    // AdminJwtAuthGuard + AdminRolesGuard('editor', 'superadmin') on the
    // whole controller (see admin-articles.controller.ts's own comment
    // for why GET is role-gated too, not left open to every admin role).
    // Category gained `status`/`createdAt`, Article gained `createdAt` —
    // genuine schema additions beyond Section 3's original field lists,
    // see modules/admin-content/README.md.
    AdminContentModule,
    // sprint-5/admin-users-dashboard-backend — Section 4.8 (Admin
    // Service), the platform-user management half. GET/PATCH
    // /admin/users — AdminJwtAuthGuard + AdminRolesGuard('moderator',
    // 'superadmin'), mirroring ModerationModule's own role split (this
    // is moderation-adjacent, not an editor's job). PATCH covers
    // active<->suspended transitions and an immediate admin-triggered
    // delete (reusing AccountDeletionSweepService.anonymizeUser
    // directly, skipping the self-service 30-day grace period). New
    // User.accountStatus value "suspended" — deliberately NOT
    // user-reversible, unlike "deactivated" (a real gap this PR also
    // closed in AuthService.reactivateAccount — see that file's own
    // comment). See modules/admin-users/README.md.
    AdminUsersModule,
    // sprint-5/admin-users-dashboard-backend (same PR) — Section 4.8's
    // Dashboard line, GET /admin/dashboard/stats. A separate module from
    // AdminUsersModule on purpose (a cross-model aggregate-reporting
    // concern, not user management), same "one module per Section 4.8
    // sub-resource" precedent as Moderation/AdminContent/AdminUsers.
    // Real aggregates for New Users (this calendar month), Total
    // Articles Published, and Community Users (total User count). Total
    // Visits and the visitor-statistics chart are DELIBERATELY OMITTED
    // from the response, not faked as zero/null-rendered-as-real — no
    // page-view/visit-tracking model or middleware exists anywhere in
    // this codebase; see modules/admin-dashboard/README.md's Decision
    // Log candidate.
    AdminDashboardModule,
    // sprint-5/admin-media-storage-backend — Section 4.8 (Admin Service),
    // the Media library half: GET /admin/media, POST
    // /admin/media/upload — AdminJwtAuthGuard + AdminRolesGuard('editor',
    // 'superadmin'), mirroring AdminContentModule's role split (media is
    // an authoring tool). Real multipart upload (multer via
    // FileInterceptor, 50MB cap) against a new, provider-agnostic
    // StorageService abstraction (src/storage/) — S3-compatible,
    // configured entirely through env vars (S3_ENDPOINT/S3_REGION/
    // S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY) so it runs unmodified
    // against AWS S3, Cloudflare R2, Backblaze B2, or DigitalOcean
    // Spaces — no vendor chosen yet, a Decision Log candidate, mirroring
    // Decision Log #26's own hosting reasoning. MediaAsset gained `key`
    // (migration 20260915162308_add_media_asset_key), a genuine schema
    // addition beyond Section 3's original field list — see
    // modules/media/README.md. Live-bucket upload is UNVERIFIED pending
    // real provider credentials — tests inject a fake StorageService.
    MediaModule,
    // sprint-2/contest-data-model-backend — Decision Log #218/#219. The
    // Contest weekly-cycle data model + scoring ledger + the
    // active-contest query (Decision Log #61/#70/#71/#130/#188). New
    // architecture the founder authorised ahead of the Sprint 6
    // Leaderboard build; the Leaderboard aggregation / GET /leaderboard
    // itself is still Sprint 6. See modules/contest/README.md.
    ContestModule,
    // sprint-5/grassroots-records-service — Section 4.5 (Grassroots
    // Records Service), full: POST /teams, GET /teams, GET /teams/:id,
    // GET /teams/:id/fixtures, POST /fixtures, GET /fixtures/:id,
    // POST /fixtures/:id/result, plus PATCH /fixtures/:id/status
    // (Decision Log #254). Permission model + "first write is final"
    // result race resolve Decision Log #255. Zero schema diff / no
    // migration. See modules/grassroots/README.md.
    GrassrootsModule,
    // sprint-3/banter-rooms-backend — Section 4.4 (Club & Banter
    // Service), the /banter-rooms half: create/list/search/get rooms,
    // join/leave, GET /banter-rooms/mine ("My Bants"), and POST/GET
    // /banter-rooms/:id/posts (delegating to FeedService). One new model,
    // BanterRoomMember (migration 20260909003336). POST
    // /banter-rooms/:id/topics is deliberately NOT built (no Topic
    // entity) — see modules/banter/README.md and the Decision Log.
    BanterModule,
    // sprint-3/messaging-direct-messaging — Build Plan Section 4.7
    // (Messaging slice): GET/POST /conversations, GET/POST
    // /conversations/:id/messages, plus PATCH /conversations/:id/read.
    // Two additive Conversation columns (participantKey @unique,
    // lastMessageAt — migration 20260909090000), Decision Log #277.
    // DMs are strictly 2-party; restricted-pending minors are blocked
    // from both sending and receiving (Decision Log #12). See
    // modules/messaging/README.md.
    MessagingModule,
    // sprint-3/notifications-read-api — Build Plan Section 4.7, the
    // Notifications READ-SIDE only: GET /notifications, GET
    // /notifications/unread-count, PATCH /notifications/:id/read, PATCH
    // /notifications/read-all. Resolves Decision Log #87/#278's
    // Notification rows into ready-to-render data server-side (batched,
    // no N+1) — see modules/notifications/README.md for the full design.
    NotificationsModule,
    // sprint-3/community-groups-backend — Build Plan Sprint 3, Decision
    // Log #281 (design by `sprint-3/community-groups-design`). Full
    // endpoint set: POST /community-groups, GET /community-groups, GET
    // /community-groups/:id, POST/DELETE /community-groups/:id/join, GET
    // /community-groups/:id/members. Two new models,
    // CommunityGroup + CommunityGroupMember, both shipped in this SAME
    // PR (not retroactively, unlike BanterRoom/BanterRoomMember). No
    // group-post-composer / group-feed endpoint — deliberately out of
    // scope, mirroring Club — Fan Page's own no-composer state. See
    // modules/community-groups/README.md.
    CommunityGroupsModule,
    // sprint-6/leaderboard-read-rollup — Build Plan Section 4.9. GET
    // /leaderboard?period= (JwtAuthGuard-only, Decision Log #129), reading
    // exclusively from the materialized LeaderboardEntry table, plus a
    // @Cron(EVERY_15_MINUTES) LeaderboardRollupService that recomputes
    // both the current and immediately-preceding ISO-week period from
    // PointsLedgerEntry via a raw RANK() OVER (...) aggregation. Applies
    // a 100-point-per-period cap to summed engagement contribution only
    // (never to Contest points) and excludes non-active accounts at both
    // rollup and read time (Decision Log #221). See
    // modules/leaderboard/README.md.
    LeaderboardModule,
    // sprint-4/public-blog-articles-feed — Build Plan Section 4, Sprint
    // 4's public-facing Blog/Articles feed (independent of the Sports
    // Hub work — no shared code, no shared schema tables). GET
    // /articles, GET /articles/:id, GET /categories — all genuinely
    // public, no guard at all, published Articles / active Categories
    // only. A real `excerpt` column and an Article-to-MediaAsset image
    // relation were both considered and deliberately DEFERRED (not
    // built) — both would require editing admin-content's own DTOs/
    // service to give an admin a way to set them, which conflicts with
    // this module's own explicit "don't touch admin-content" scope; see
    // modules/blog/README.md for the full reasoning and the Decision Log
    // candidates this flags. Zero schema.prisma diff.
    BlogModule,
    // sprint-4/sports-hub-highlightly-backend — Build Plan Section 4.6 (Sports Hub / Highlightly
    // integration), independent of the Blog module above (no shared code, no shared schema
    // tables). GET /sports/live-scores, GET /sports/fixtures?date=, GET /sports/matches/:id (+
    // /stats, /lineups, /h2h, /momentum, /events), GET /sports/standings?league=, GET
    // /sports/highlights/:matchId — all genuinely public, no guard. `momentum` and `events` are
    // genuine additions beyond Section 4.6's literal eight-endpoint list (flagged), matching what
    // the figma-screen-builder "Highlightly data redesign" pass designed (Match Momentum, Live
    // Commentary). MatchData gained ~20 new columns (leagueId/season/round/venue/homeTeamId/
    // homeScore/... + five whole-document JSON columns — statistics/lineups/events/h2h/highlights,
    // each with its own `*UpdatedAt` freshness timestamp) and a new Standing model — a genuine
    // schema REDESIGN, not just an extension (migration
    // 20260916083019_add_sports_hub_highlightly_data_redesign); Section 3's original seven bare
    // fields are all kept, still populated. Two real, disclosed Highlightly data gaps found during
    // this build (neither faked around): the vendor's own /statistics endpoint is TEAM-LEVEL ONLY
    // (no batched per-match player box scores — the Figma redesign assumed these existed; they
    // would need 20+ extra API calls per match to reconstruct, not viable under the confirmed
    // 100-requests/day free tier), and /standings has no recent-"form" field at all. See
    // modules/sports/README.md for the full design writeup — the normalized-Postgres/JSON-blob
    // schema split, the Redis refresh-lock caching strategy (one lock per resource doubles as both
    // the TTL cache marker and a cross-request stampede guard), and the daily request-budget guard
    // (SportsDataBudgetService, default 100/day matching the confirmed free tier — the real
    // paid-tier budget is a Decision Log candidate, not assumed unlimited).
    SportsModule,
    // sprint-4/search-module — Build Plan Section 4.7, resolving Decision
    // Log #139's parked people-search need. GET /search?q=&scope=&cursor=&limit= —
    // genuinely public, no guard at all (same precedent as BlogModule /
    // SportsModule above). `scope` is one of 'users' | 'clubs' | 'posts',
    // or omitted for all three grouped in the response. Matching is
    // Prisma `contains` + `mode: 'insensitive'` (Postgres ILIKE) on
    // User.displayName / ClubPage.name / Post.contentText — no full-text
    // index infrastructure exists in this codebase yet, and building one
    // is explicitly out of scope for this PR (disclosed in
    // search.service.ts's own header comment). User/Post results exclude
    // whatever other modules already treat as non-public: non-active
    // accountStatus (deactivated/pending_deletion/suspended/anonymized)
    // and restricted-pending minors, the same two filters
    // users.service.ts's ACTIVE_FOLLOW_ENTRY_FILTER and
    // clubs.service.ts's VISIBLE_CLUB_MEMBER_FILTER already apply. Zero
    // schema.prisma diff. See modules/search/README.md.
    SearchModule,
  ],
})
export class AppModule {}
