import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ArticlesController } from './articles.controller';
import { BlogService } from './blog.service';
import { CategoriesController } from './categories.controller';

// sprint-4/public-blog-articles-feed — Build Plan Section 4, Sprint 4's
// second deliverable (the first being Sports Hub — independent, no
// shared code, no shared schema tables). A dedicated, brand-new
// top-level module — deliberately NOT folded into AdminContentModule
// (see README.md's "one service or two" section). Imports nothing
// beyond PrismaService: every route here is genuinely public (no
// JwtAuthGuard, no AdminJwtAuthGuard), so there's no auth-foundation
// module to pull in.
//
// Zero schema.prisma diff — Article/Category already carry everything
// this module reads (id/title/body/categoryId/authorAdminId/status/
// publishedAt/createdAt on Article; id/name/slug/status/createdAt on
// Category). No migration.
@Module({
  controllers: [ArticlesController, CategoriesController],
  providers: [BlogService, PrismaService],
})
export class BlogModule {}
