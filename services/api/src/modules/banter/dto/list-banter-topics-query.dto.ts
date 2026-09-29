import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /banter-rooms/topics — the topics catalog. sprint-3/banter-room-topics,
// resolving Decision Log #276. Beyond Section 4.4's literal endpoint list
// (which names only `POST /banter-rooms/:id/topics`), built anyway and
// flagged in banter/README.md: without SOME way to discover which Topic
// ids exist, `?topicId=` on `GET /banter-rooms`/`GET /banter-rooms/search`
// (list-banter-rooms-query.dto.ts) would be effectively unusable from a
// client with no other rooms already fetched to derive ids from — the
// same "a filterable dynamic resource needs an enumeration endpoint"
// convention `GET /categories` already establishes for Article.categoryId.
//
// Section 5.5: every list endpoint is keyset-paginated, opaque base64
// cursor, default 20 / max 50 — same bounds as every other list endpoint
// in this codebase. No filters (no `q`/`scopeType` — this is a small,
// browsable catalog, not a search surface); ordered alphabetically by
// `name`, `id` tiebreak — reuses BanterRoomCursor/encodeBanterRoomCursor/
// decodeBanterRoomCursor directly (the identical `{name, id}` shape,
// within the same module — see cursor.util.ts), not a duplicated type.
export class ListBanterTopicsQueryDto {
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
