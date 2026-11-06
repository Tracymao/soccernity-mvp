import { IsBoolean, IsIn, ValidateIf } from 'class-validator';
import { DM_PERMISSIONS, DmPermission } from '../user-settings.constants';

// PATCH /users/me/settings. Partial: either field, both, or neither. Unknown keys are rejected by the global
// ValidationPipe (whitelist + forbidNonWhitelisted), and read receipts are deliberately absent (nothing was
// decided for them). ValidateIf on `undefined` only (not IsOptional) so an explicit null is validated and
// refused rather than silently skipped.
export class UpdateUserSettingsDto {
  @ValidateIf((o: UpdateUserSettingsDto) => o.dmPermission !== undefined)
  @IsIn(DM_PERMISSIONS as unknown as string[])
  dmPermission?: DmPermission;

  @ValidateIf((o: UpdateUserSettingsDto) => o.mediaSensitive !== undefined)
  @IsBoolean()
  mediaSensitive?: boolean;
}
