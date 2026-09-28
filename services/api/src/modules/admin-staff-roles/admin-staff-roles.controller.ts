import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { AdminStaffRolesService } from './admin-staff-roles.service';
import { CreateAdminStaffDto } from './dto/create-admin-staff.dto';
import { ListStaffQueryDto } from './dto/list-staff-query.dto';
import { UpdateAdminRoleDto } from './dto/update-admin-role.dto';
import { UpdateAdminStatusDto } from './dto/update-admin-status.dto';

// GET /admin/staff, PATCH /admin/staff/:id/role — the AdminUser
// role-management endpoints Settings/Roles' apps/admin screens were
// built as a disclosed stub for (Decision Log #191/#250/#302). See
// README.md for the full endpoint table and role-gating reasoning.
//
// AdminRolesGuard('superadmin') on the WHOLE controller, GET included —
// mirrors AdminStaffVettingController's own shape, not
// AdminUsersController/ModerationController's moderator+superadmin
// split. See README.md's "who may view" section.
//
// Deliberately its own, dedicated `admin/staff` URL prefix — NOT
// `admin/users` (that prefix already denotes TWO different resources —
// platform User accounts via AdminUsersController, and AdminUser
// child-safety-vetting via AdminStaffVettingController — see that
// controller's own disclosed-overlap comment). Adding a THIRD meaning
// to an already-overlapping prefix would compound exactly the confusion
// that comment warns a future reader against; `admin/staff` names the
// resource (AdminUser staff accounts) plainly instead.
@Controller('admin/staff')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('superadmin')
export class AdminStaffRolesController {
  constructor(private readonly adminStaffRolesService: AdminStaffRolesService) {}

  @Get()
  async list(@Query() query: ListStaffQueryDto) {
    return this.adminStaffRolesService.listStaff(query);
  }

  // POST /admin/staff � provision a new AdminUser (Decision Log #191).
  @Post()
  async create(@CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: CreateAdminStaffDto) {
    return this.adminStaffRolesService.createStaff(admin.sub, dto);
  }

  @Patch(':id/role')
  async updateRole(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: UpdateAdminRoleDto,
  ) {
    return this.adminStaffRolesService.updateAdminRole(id, admin.sub, dto);
  }

  // PATCH /admin/staff/:id/status — set the TARGET AdminUser's
  // accountStatus (Decision Log #193). See
  // AdminStaffRolesService.updateAdminStatus's own comment for the full
  // guard/revocation reasoning.
  @Patch(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: UpdateAdminStatusDto,
  ) {
    return this.adminStaffRolesService.updateAdminStatus(id, admin.sub, dto);
  }
}
