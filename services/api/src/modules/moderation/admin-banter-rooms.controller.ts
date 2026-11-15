import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRoles } from '../admin/guards/admin-roles.decorator';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CurrentAdmin } from '../admin/guards/current-admin.decorator';
import { AdminAccessTokenPayload } from '../admin/token/admin-token.types';
import { BanterRoomReactivationService } from './banter-room-reactivation.service';
import { ReactivateBanterRoomDto } from './dto/reactivate-banter-room.dto';

// backend/room-staff-reactivation (Decision Log #515). Staff undo their own room_deactivated: the same roles that
// may record room_deactivated (moderator, superadmin; an editor is refused). 200, not 201: it changes a status,
// it creates nothing. See BanterRoomReactivationService for the rules, their order and the limits.
@Controller('admin/banter-rooms')
@UseGuards(AdminJwtAuthGuard, AdminRolesGuard)
@AdminRoles('moderator', 'superadmin')
export class AdminBanterRoomsController {
  constructor(private readonly reactivation: BanterRoomReactivationService) {}

  @Post(':id/reactivate')
  @HttpCode(200)
  async reactivate(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminAccessTokenPayload,
    @Body() dto: ReactivateBanterRoomDto,
  ) {
    return this.reactivation.reactivate(id, admin.sub, dto);
  }
}
