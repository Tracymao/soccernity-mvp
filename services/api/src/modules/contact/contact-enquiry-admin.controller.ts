import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { ContactEnquiryAdminService } from './contact-enquiry-admin.service';
import { EscalateContactEnquiryDto } from './dto/escalate-contact-enquiry.dto';
import { ListContactEnquiriesQueryDto } from './dto/list-contact-enquiries-query.dto';
import { SetContactEnquiryHandledDto } from './dto/set-handled.dto';

// Admin inbox for Contact Us enquiries (B-046 part B). AdminJwtAuthGuard + AdminRolesGuard('moderator',
// 'superadmin') on every route, the same gate as the moderation queue (an enquiry that turns out to be a
// safeguarding concern or a complaint is handed to that queue). Routes: GET list, GET :id, PATCH :id/handled,
// POST :id/escalate.
@Controller('admin/contact-enquiries')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class ContactEnquiryAdminController {
  constructor(private readonly service: ContactEnquiryAdminService) {}

  @Get()
  list(@Query() query: ListContactEnquiriesQueryDto) {
    return this.service.list(query);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id/handled')
  setHandled(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: SetContactEnquiryHandledDto) {
    return this.service.setHandled(id, admin.sub, dto.handled);
  }

  @Post(':id/escalate')
  @HttpCode(201)
  escalate(@Param('id') id: string, @CurrentAdmin() admin: AdminAccessTokenPayload, @Body() dto: EscalateContactEnquiryDto) {
    return this.service.escalate(id, admin.sub, dto);
  }
}
