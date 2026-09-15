import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAuthFoundationModule } from '../admin/admin-auth-foundation.module';
import { AdminArticlesController } from './admin-articles.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminContentService } from './admin-content.service';

// sprint-5/admin-articles-categories-backend — Build Plan Section 4.8
// (Admin Service), the Article/Category management half. A dedicated
// top-level module, deliberately NOT folded into AdminModule (which
// stays scoped to Admin Console account/auth/profile — see
// admin/admin.module.ts's own comment) and deliberately a SEPARATE
// module from ModerationModule, even though both are Section 4.8 admin
// surfaces — this module has NO user-facing routes at all (unlike
// ModerationModule, which needs AuthFoundationModule for its two
// JwtAuthGuard-gated user routes), so it only imports
// AdminAuthFoundationModule. One AdminContentService, two controllers
// (Articles, Categories) — mirrors GrassrootsModule's own "one service,
// two resource-scoped controllers" shape (see grassroots.module.ts).
@Module({
  imports: [AdminAuthFoundationModule],
  controllers: [AdminArticlesController, AdminCategoriesController],
  providers: [AdminContentService, PrismaService],
})
export class AdminContentModule {}
