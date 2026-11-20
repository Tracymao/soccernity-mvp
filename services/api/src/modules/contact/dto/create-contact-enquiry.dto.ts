import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  CONTACT_CATEGORIES,
  CONTACT_EMAIL_MAX_LENGTH,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_SUBJECT_MAX_LENGTH,
  ContactCategory,
} from '../contact.constants';

// POST /contact (B-046). Every string is trimmed BEFORE validation (the global ValidationPipe has
// transform: true), so a whitespace-only value fails MinLength(1) and the stored value never carries stray
// spaces. Control characters are rejected: none at all in the single-line fields, and in the message every
// control character except tab, line feed and carriage return (a message may have line breaks).
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARACTERS = /^[^\u0000-\u001F\u007F]*$/;
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES = /^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/;
const SINGLE_LINE_MESSAGE = 'must not contain control characters';

export class CreateContactEnquiryDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_NAME_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARACTERS, { message: `name ${SINGLE_LINE_MESSAGE}` })
  name!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(CONTACT_EMAIL_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARACTERS, { message: `email ${SINGLE_LINE_MESSAGE}` })
  email!: string;

  @IsIn(CONTACT_CATEGORIES)
  category!: ContactCategory;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_SUBJECT_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARACTERS, { message: `subject ${SINGLE_LINE_MESSAGE}` })
  subject!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(CONTACT_MESSAGE_MAX_LENGTH)
  @Matches(NO_CONTROL_CHARACTERS_EXCEPT_NEWLINES, { message: `message ${SINGLE_LINE_MESSAGE} other than line breaks` })
  message!: string;
}
