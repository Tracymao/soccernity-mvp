import { IsOptional, IsString, MaxLength } from 'class-validator';

// POST /media/:id/report (backend/media-privacy-vetting-followups, B-259; Decision Log #430 item 4). The body
// is optional. A reason is free text from the reporter, trimmed by the service, at most 500 characters. It is
// shown to moderators only. `forbidNonWhitelisted` is on globally, so any other field is a 400.
export const MEDIA_REPORT_REASON_MAX_LENGTH = 500;

export class ReportMediaDto {
  @IsOptional()
  @IsString()
  @MaxLength(MEDIA_REPORT_REASON_MAX_LENGTH)
  reason?: string;
}
