import { IsBoolean, ValidateIf } from 'class-validator';

// PATCH /notification-settings (B-062). Partial: any of the four booleans, several, or none. Unknown keys are
// rejected by the global ValidationPipe (whitelist + forbidNonWhitelisted). ValidateIf on `undefined` only (not
// IsOptional) so an explicit null is validated and refused rather than silently skipped.
export class UpdateNotificationSettingsDto {
  @ValidateIf((o: UpdateNotificationSettingsDto) => o.qualityFilter !== undefined)
  @IsBoolean()
  qualityFilter?: boolean;

  @ValidateIf((o: UpdateNotificationSettingsDto) => o.muteNonFollowing !== undefined)
  @IsBoolean()
  muteNonFollowing?: boolean;

  @ValidateIf((o: UpdateNotificationSettingsDto) => o.muteNonFollowers !== undefined)
  @IsBoolean()
  muteNonFollowers?: boolean;

  @ValidateIf((o: UpdateNotificationSettingsDto) => o.muteNewAccounts !== undefined)
  @IsBoolean()
  muteNewAccounts?: boolean;
}
