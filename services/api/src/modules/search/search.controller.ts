import { Controller, Get, Query } from '@nestjs/common';
import { SearchQueryDto } from './dto/search-query.dto';
import { SearchService } from './search.service';

// Build Plan Section 4.7 — GET /search. Genuinely public, NO guard at
// all (same no-guard-at-all precedent as ArticlesController /
// CategoriesController in blog.module.ts, and Section 4.6's public
// Sports Hub routes) — Section 4.7's own "no login gate for a basic
// query" line, mirroring GET /sports/fixtures's own precedent (see
// search.service.ts's own header comment). Resolves Decision Log #139's
// parked people-search need — see search/README.md.
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}
