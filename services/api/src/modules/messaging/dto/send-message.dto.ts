import { IsString, MaxLength, MinLength } from 'class-validator';
import { MESSAGE_TEXT_MAX_LENGTH, MESSAGE_TEXT_MIN_LENGTH } from '../messaging.constants';

// POST /conversations/:id/messages (Build Plan Section 4.7). The Message
// Section 3 fields a caller supplies: `contentText` only.
// `senderId` comes from the access token, `conversationId` from the URL
// param, `sentAt`/`readAt` are managed by the service — none are client
// input.
//
// backend/media-privacy-vetting-followups (B-259; Decision Log #430 item 4): a message can NO LONGER carry a
// free media URL. `mediaUrl` used to be accepted as any URL with no provenance check, which bypasses the
// media review gate; until direct-message upload exists (it goes through the same pipeline as post media),
// a message is text only. `forbidNonWhitelisted` is on globally, so a request that still sends `mediaUrl` is
// a 400. The Message.mediaUrl DATABASE COLUMN is deliberately left in place (no schema change).
export class SendMessageDto {
  @IsString()
  @MinLength(MESSAGE_TEXT_MIN_LENGTH)
  @MaxLength(MESSAGE_TEXT_MAX_LENGTH)
  contentText!: string;
}
