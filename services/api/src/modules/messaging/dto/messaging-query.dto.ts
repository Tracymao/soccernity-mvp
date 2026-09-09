import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MESSAGING_MAX_PAGE_SIZE } from '../messaging.constants';

// Shared query DTO for GET /conversations and GET
// /conversations/:id/messages (Build Plan Section 4.7). Both surfaces
// take the identical params — an opaque keyset `cursor` and a `limit` —
// and differ only in which cursor codec the service uses
// (cursor.util.ts: ConversationCursor vs MessageCursor), so unlike
// banter (which needed a second DTO for `scopeType`/`q`) one DTO serves
// both here. Section 5.5 pagination bounds, same as feed-query.dto.ts.
export class MessagingQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MESSAGING_MAX_PAGE_SIZE)
  limit?: number;
}
