import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { ListSuspectedIllegalQueryDto } from './dto/list-suspected-illegal-query.dto';
import { RecordFiledDto } from './dto/record-filed.dto';
import { RecordNotFiledDto } from './dto/record-not-filed.dto';
import { SetAsideSuspectedIllegalDto } from './dto/set-aside-suspected-illegal.dto';
import { SuspectedIllegalMediaService } from './suspected-illegal-media.service';

// backend/suspected-illegal-imagery-path (B-206; founder decision 2026-11-15).
//
// AdminJwtAuthGuard + AdminRolesGuard('moderator', 'superadmin') on every route (the media review queue's shape), and
// on top of that a child-safety-vetted admin for every action: the service reads the vetting flag fresh each time.
// The set-aside route hangs off the media review path (it acts on a queue item); the filing records have their own
// path. Nothing here calls an authority or any network service.
@Controller('admin')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class SuspectedIllegalMediaController {
  constructor(private readonly records: SuspectedIllegalMediaService) {}

  @Post('media-review/:id/suspected-illegal')
  @HttpCode(201)
  async setAside(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: SetAsideSuspectedIllegalDto,
  ) {
    return this.records.setAside(id, admin.sub, dto);
  }

  @Get('suspected-illegal-media')
  async list(@Query() query: ListSuspectedIllegalQueryDto, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.records.list(query, admin.sub);
  }

  @Get('suspected-illegal-media/:id')
  async get(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload) {
    return this.records.get(id, admin.sub);
  }

  @Post('suspected-illegal-media/:id/filed')
  @HttpCode(200)
  async filed(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: RecordFiledDto) {
    return this.records.recordFiled(id, admin.sub, dto);
  }

  @Post('suspected-illegal-media/:id/not-filed')
  @HttpCode(200)
  async notFiled(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: RecordNotFiledDto,
  ) {
    return this.records.recordNotFiled(id, admin.sub, dto);
  }
}
