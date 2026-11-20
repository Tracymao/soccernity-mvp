import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /banter-rooms/mine ("My Bants" — Build Plan Section 6, Sprint 3).
// A separate DTO from ListBanterRoomsQueryDto because this surface has
// no `scopeType`/`q` filters (it's just "the rooms I'm in") and its
// cursor is a different shape ({ joinedAt, id }, not { name, id }) since
// it orders most-recently-joined first — see cursor.util.ts. Same
// Section 5.5 pagination bounds as everywhere else.
export class MyBantsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
