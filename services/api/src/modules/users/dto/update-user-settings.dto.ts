import { IsBoolean, IsIn, ValidateIf } from 'class-validator';
import { DM_PERMISSIONS, DmPermission } from '../user-settings.constants';

// PATCH /users/me/settings. Partial: any of the three fields, several, or none. Unknown keys are rejected by
// the global ValidationPipe (whitelist + forbidNonWhitelisted). ValidateIf on `undefined` only (not IsOptional) so an explicit null is validated and
// refused rather than silently skipped.
export class UpdateUserSettingsDto {
  @ValidateIf((o: UpdateUserSettingsDto) => o.dmPermission !== undefined)
  @IsIn(DM_PERMISSIONS as unknown as string[])
  dmPermission?: DmPermission;

  @ValidateIf((o: UpdateUserSettingsDto) => o.mediaSensitive !== undefined)
  @IsBoolean()
  mediaSensitive?: boolean;

  // Stores an explicit true or false (read receipts, Decision Log #472, founder decision 2026-11-08). There is
  // no way to set it back to "use the age default" from the API (an explicit null is refused like the others).
  @ValidateIf((o: UpdateUserSettingsDto) => o.readReceipts !== undefined)
  @IsBoolean()
  readReceipts?: boolean;

  // The "Public profile" toggle (B-060, founder decision 2026-11-08). An under-18 account is refused with a
  // 403 (profile_visibility_not_available) by UsersService, whatever the value.
  @ValidateIf((o: UpdateUserSettingsDto) => o.isProfilePublic !== undefined)
  @IsBoolean()
  isProfilePublic?: boolean;
}
