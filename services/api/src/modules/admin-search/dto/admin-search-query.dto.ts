import { IsOptional, IsString } from 'class-validator';

// `q` is optional ONLY so a missing one gets the same coded 400 (admin_search_query_too_short) as an empty one;
// its length and content are judged in parseAdminSearchQuery, which gives stable error codes. Any other query
// parameter is rejected by the global ValidationPipe (forbidNonWhitelisted).
export class AdminSearchQueryDto {
  @IsOptional()
  @IsString()
  q?: string;
}
