import { Controller, Get, Query } from '@nestjs/common';
import { TrendingQueryDto } from './dto/trending-query.dto';
import { TRENDING_DEFAULT_LIMIT, TRENDING_MAX_LIMIT } from './trending.constants';
import { TrendingService } from './trending.service';

// Build Plan Section 4.7 — GET /trending. Genuinely public, NO guard at
// all — same "no login gate for a basic query" precedent as
// SearchController / ArticlesController / Section 4.6's Sports Hub
// routes (see search.module.ts's own header comment). See
// search/README.md's "Trending topics" section for the full design.
@Controller('trending')
export class TrendingController {
  constructor(private readonly trendingService: TrendingService) {}

  @Get()
  async getTrending(@Query() query: TrendingQueryDto) {
    const limit = Math.min(query.limit ?? TRENDING_DEFAULT_LIMIT, TRENDING_MAX_LIMIT);
    return this.trendingService.getTrending(limit);
  }
}
