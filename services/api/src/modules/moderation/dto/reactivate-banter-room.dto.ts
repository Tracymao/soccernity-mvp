import { IsOptional, IsString, MaxLength } from 'class-validator';

// Body of POST /admin/banter-rooms/:id/reactivate (backend/room-staff-reactivation, Decision Log #515). The note is
// OPTIONAL and, like the other admin notes, at most 500 characters (HOLD_REASON_MAX_LENGTH is the same bound). It is
// trimmed in the service; a blank note counts as none. It goes to the audit log only, never to the room's creator.
export const REACTIVATE_BANTER_ROOM_NOTE_MAX_LENGTH = 500;

export class ReactivateBanterRoomDto {
  @IsOptional()
  @IsString()
  @MaxLength(REACTIVATE_BANTER_ROOM_NOTE_MAX_LENGTH)
  note?: string;
}
