import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminContentService } from './admin-content.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { ListArticlesQueryDto } from './dto/list-articles-query.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

// Build Plan Section 4.8 (Admin Service) — Article management.
//
// AdminJwtAuthGuard + AdminRolesGuard('editor', 'superadmin') on the
// WHOLE controller, including GET — see README.md's "who may view"
// section for the reasoning. Short version: the task brief that
// dispatched this module assumed GET should be open to any admin role,
// citing "the same view-vs-mutate role split AdminModerationController
// already uses" — that premise doesn't hold up against the real code.
// AdminModerationController (admin-moderation.controller.ts) applies
// AdminRolesGuard('moderator', 'superadmin') to its ENTIRE controller,
// GET included — there is no view-vs-mutate split there at all, only a
// per-JOB split (an editor gets zero access, not read-only access).
// Mirroring that exact shape here — rather than inventing a new,
// unprecedented mixed pattern (class-level auth-only guard plus
// per-route role overrides on just the mutating routes) — keeps this
// codebase's only role-gated admin surface family consistent, and
// matches AdminUser's own schema comment framing Articles and Reports as
// two distinct jobs with no stated overlap: a moderator has no more
// reason to browse the Articles admin list than an editor has to browse
// the moderation queue.
@Controller('admin/articles')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('editor', 'superadmin')
export class AdminArticlesController {
  constructor(private readonly adminContentService: AdminContentService) {}

  @Get()
  async list(@Query() query: ListArticlesQueryDto) {
    return this.adminContentService.listArticles(query);
  }

  @Post()
  async create(@CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: CreateArticleDto) {
    return this.adminContentService.createArticle(admin.sub, dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateArticleDto) {
    return this.adminContentService.updateArticle(id, dto);
  }
}
