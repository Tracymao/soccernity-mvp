import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
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

  // B-039: still public (OptionalJwtAuthGuard never rejects). A valid token only
  // tells the service WHO is searching so their blocks (both directions) can be
  // applied; an absent or invalid token searches as an anonymous caller.
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async search(@Query() query: SearchQueryDto, @CurrentUser() user?: AccessTokenPayload) {
    return this.searchService.search(query, user?.sub);
  }
}
