import { IsString, MaxLength, MinLength } from 'class-validator';
import { MESSAGE_TEXT_MAX_LENGTH, MESSAGE_TEXT_MIN_LENGTH } from '../messaging.constants';

// PATCH /conversations/:id/messages/:messageId (B-067). The same bounds as SendMessageDto: an edited message is
// held to exactly what a new one is. Text only -- there is no media field to edit.
export class EditMessageDto {
  @IsString()
  @MinLength(MESSAGE_TEXT_MIN_LENGTH)
  @MaxLength(MESSAGE_TEXT_MAX_LENGTH)
  contentText!: string;
}
