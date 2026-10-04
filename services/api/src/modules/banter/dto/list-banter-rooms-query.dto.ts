import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from 'class-validator';
import { BANTER_ROOM_SCOPE_TYPES, BanterRoomScopeType } from '../banter.constants';

// GET /banter-rooms and GET /banter-rooms/search?q= (Build Plan Section
// 4.4). Section 5.5: every list endpoint is keyset-paginated, opaque
// base64 cursor, default 20 / max 50 — following feed-query.dto.ts /
// list-clubs-query.dto.ts / list-teams-query.dto.ts verbatim.
//
// Both list surfaces share this one DTO and one BanterService.listRooms()
// method — they differ only in intent (browse vs. name search), not in
// the filter mechanism:
//
//  - `scopeType` — OPTIONAL exact-match equality filter, validated
//    against the same allow-list POST /banter-rooms enforces. A plain
//    WHERE-clause condition ANDed alongside the (name, id) cursor
//    filter, not part of ordering/tiebreak — the same treatment
//    ListClubsQueryDto gives `league`/`country` and ListTeamsQueryDto
//    gives `city`. A bad scopeType is a 400.
//  - `q` — OPTIONAL case-insensitive substring match on `name`. Section
//    4.4's own `GET /banter-rooms/search?q=` route is what this is for;
//    it is also accepted on the plain `GET /banter-rooms` route so a
//    client can combine "browse by scope" and "filter by name" without
//    two round trips. BanterRoom.name has no full-text index in Section
//    3, so this is a plain `contains` (ILIKE), matching how
//    GrassrootsPage's own server-side filter works — the precedent this
//    task points at.
//  - `topicId` — OPTIONAL exact-match filter on BanterRoomTopic
//    (sprint-3/banter-room-topics, Decision Log #276). "Filter rooms by
//    topic" — the read-side half this task's own brief names. A plain
//    equality condition ANDed alongside the rest (same treatment as
//    `scopeType`), not part of ordering/tiebreak. A bad/unknown topicId
//    is not a 400 — it simply matches zero rooms, same as a `q` that
//    matches nothing.
export class ListBanterRoomsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @IsIn(BANTER_ROOM_SCOPE_TYPES)
  scopeType?: BanterRoomScopeType;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  topicId?: string;

  // Decision Log #358 — inclusive creation-date range on BanterRoom.createdAt.
  // A date-only value ("2026-10-04") is read as the whole UTC day; a full
  // timestamp is used as-is. dateFrom > dateTo is a 400 (BanterService).
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}
