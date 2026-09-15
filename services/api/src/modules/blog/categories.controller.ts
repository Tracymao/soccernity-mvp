import { Controller, Get, Query } from '@nestjs/common';
import { BlogService } from './blog.service';
import { ListPublicCategoriesQueryDto } from './dto/list-categories-query.dto';

// Build Plan Section 4 — the public-facing Blog/Articles feed (Sprint
// 4). NO GUARD — genuinely public, active categories only (see
// BlogService.listCategories).
@Controller('categories')
export class CategoriesController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  async list(@Query() query: ListPublicCategoriesQueryDto) {
    return this.blogService.listCategories(query);
  }
}
