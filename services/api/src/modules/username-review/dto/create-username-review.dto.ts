import { IsOptional, IsString } from 'class-validator';

// POST /users/me/username-review. The only field is the optional message. Its length is checked in the service
// (trimmed first, so a message of spaces is "no message" and 501 spaces plus text is judged after trimming) and
// answered with a coded 400, not by the generic validation pipe.
export class CreateUsernameReviewDto {
  @IsOptional()
  @IsString()
  message?: string;
}
