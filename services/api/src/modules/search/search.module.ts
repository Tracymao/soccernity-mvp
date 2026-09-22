import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// sprint-4/search-module — Build Plan Section 4.7, resolving Decision
// Log #139's parked people-search need (apps/web's
// NewConversationPage.tsx currently fakes person-search via a
// client-side filter over the caller's own follow list — see that
// file's own header comment; wiring it to this module is a separate,
// later frontend PR).
//
// A dedicated, brand-new top-level module, mirroring BlogModule's own
// shape exactly: genuinely public (no JwtAuthGuard, no
// AdminJwtAuthGuard on GET /search), so there's no auth-foundation
// module to import. Zero schema.prisma diff — User / ClubPage / Post
// already carry everything this module reads (see search.service.ts for
// the exact fields and the exclusion filters applied to each).
@Module({
  controllers: [SearchController],
  providers: [SearchService, PrismaService],
})
export class SearchModule {}
