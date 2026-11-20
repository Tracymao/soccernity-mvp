import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminContentService } from './admin-content.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesQueryDto } from './dto/list-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

// Build Plan Section 4.8 (Admin Service) — Category management.
//
// AdminJwtAuthGuard + AdminRolesGuard('editor', 'superadmin') on the
// WHOLE controller, including GET — see
// AdminArticlesController's own header comment (and README.md's "who
// may view" section) for the full reasoning; identical here.
@Controller('admin/categories')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('editor', 'superadmin')
export class AdminCategoriesController {
  constructor(private readonly adminContentService: AdminContentService) {}

  @Get()
  async list(@Query() query: ListCategoriesQueryDto) {
    return this.adminContentService.listCategories(query);
  }

  @Post()
  async create(@Body() dto: CreateCategoryDto) {
    return this.adminContentService.createCategory(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.adminContentService.updateCategory(id, dto);
  }
}
