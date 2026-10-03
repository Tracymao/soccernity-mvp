import { IsIn } from 'class-validator';
import { BANTER_ROOM_STATUSES, BanterRoomStatus } from '../banter.constants';

// PATCH /banter-rooms/:id/status — Decision Log #357.
export class UpdateBanterRoomStatusDto {
  @IsIn(BANTER_ROOM_STATUSES)
  status!: BanterRoomStatus;
}
