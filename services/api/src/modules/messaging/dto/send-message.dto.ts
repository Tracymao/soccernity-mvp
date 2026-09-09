import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { MESSAGE_TEXT_MAX_LENGTH, MESSAGE_TEXT_MIN_LENGTH } from '../messaging.constants';

// POST /conversations/:id/messages (Build Plan Section 4.7). The Message
// Section 3 fields a caller supplies: `contentText`, optional `mediaUrl`.
// `senderId` comes from the access token, `conversationId` from the URL
// param, `sentAt`/`readAt` are managed by the service — none are client
// input.
//
// `mediaUrl` (singular, unlike CreatePostDto's `mediaUrls[]` — Section 3's
// Message has one nullable `media_url`) is accepted as a URL string with
// no server-side provenance check: there is no media-upload endpoint
// anywhere in this codebase yet (same flag as CreatePostDto.mediaUrls),
// so a client passes a URL it already has. Kept to a plain @IsUrl for now.
export class SendMessageDto {
  @IsString()
  @MinLength(MESSAGE_TEXT_MIN_LENGTH)
  @MaxLength(MESSAGE_TEXT_MAX_LENGTH)
  contentText!: string;

  @IsOptional()
  @IsUrl()
  mediaUrl?: string;
}
