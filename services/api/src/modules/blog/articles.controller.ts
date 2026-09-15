import { Controller, Get, Param, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ListPublicArticlesQueryDto } from './dto/list-articles-query.dto';

// Build Plan Section 4 — the public-facing Blog/Articles feed (Sprint
// 4). NO GUARD on this controller at all — these two routes are
// genuinely public (Section 4's own "no auth required" line), matching
// this codebase's existing no-guard-at-all precedent for public routes
// (e.g. POST /auth/register, POST /auth/reactivate-account) rather than
// a guard that always lets the request through.
@Controller('articles')
export class ArticlesController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  async list(@Query() query: ListPublicArticlesQueryDto) {
    return this.blogService.listArticles(query);
  }

  // Deliberately AFTER the bare @Get() above but that's irrelevant here —
  // NestJS resolves a static path segment ('articles') vs. a param route
  // (':id') by declaration order only when both could match the same
  // request, which never happens between GET /articles and
  // GET /articles/:id (different segment counts). No route-ordering
  // hazard the way a static 'mine'/'search' segment would create next to
  // ':id' in the same position (see e.g. banter.controller.ts's own
  // comment on that).
  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.blogService.getArticleById(id);
  }
}
