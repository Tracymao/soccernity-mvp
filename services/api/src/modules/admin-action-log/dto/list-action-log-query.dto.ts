import { IsOptional, IsString } from 'class-validator';

// Every field is an optional plain string ON PURPOSE: a malformed value must get the coded 400 from
// parseActionLogQuery (stable `code`), not the global ValidationPipe's code-less message. The pipe still rejects any
// query parameter this class does not declare (forbidNonWhitelisted).
export class ListActionLogQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @IsString() limit?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() adminId?: string;
}
