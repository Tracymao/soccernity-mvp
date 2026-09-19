import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class HeldInvestigationsQueryDto {
  // Days a hold must have lasted to be listed. Defaults to
  // HELD_INVESTIGATION_ALERT_DAYS (90) when omitted; tunable per request.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  olderThanDays?: number;
}
