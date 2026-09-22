import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';
import { TrendingController } from './trending.controller';
import { TrendingService } from './trending.service';

// sprint-4/search-module — Build Plan Section 4.7, resolving Decision
// Log #139's parked people-search need (apps/web's
// NewConversationPage.tsx currently fakes person-search via a
// client-side filter over the caller's own follow list — see that
// file's own header comment; wiring it to this module is a separate,
// later frontend PR).
//
// A dedicated, brand-new top-level module, mirroring BlogModule's own
// shape exactly: genuinely public (no JwtAuthGuard, no
// AdminJwtAuthGuard on GET /search or GET /trending), so there's no
// auth-foundation module to import. Zero schema.prisma diff for
// GET /search — User / ClubPage / Post already carry everything it
// reads (see search.service.ts for the exact fields and the exclusion
// filters applied to each).
//
// sprint-4/trending-topics-backend — GET /trending is added to this
// SAME module (not a separate top-level TrendingModule): it is the
// other half of Section 4.7's "Search & Discovery" surface, and its
// notes deliberately live in this module's own README per that task's
// brief. Unlike GET /search, this one DOES carry a genuine schema
// addition — see schema.prisma's own Hashtag/PostHashtag models and
// search/README.md's "Trending topics" section. The actual write side
// (hashtag extraction) lives in search/hashtag.util.ts, a plain function
// called from FeedService.createPost's own transaction (feed.service.ts)
// — the same "shared util, no cross-module service import" precedent
// points/points.util.ts's awardPoints() already set, so FeedModule needs
// no import of this module at all.
@Module({
  controllers: [SearchController, TrendingController],
  providers: [SearchService, TrendingService, PrismaService],
})
export class SearchModule {}
