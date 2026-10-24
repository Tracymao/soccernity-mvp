import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

// Explicit allowlist of self-editable fields for PATCH /users/:id
// (Build Plan Section 4.2 / Section 3's User entity). This is the
// request-shape half of the allowlist; UsersService's toUpdateData() is
// the other half, and is the actual point that decides what reaches
// Prisma — do not treat validation here as sufficient on its own.
//
// Deliberately absent, even though they exist on the User model and a
// client could try to send them: isMinor, role, verificationStatus,
// email, dateOfBirth, guardian-related fields. The global ValidationPipe
// (main.ts) has `whitelist: true, forbidNonWhitelisted: true`, so any
// request body containing a key that isn't a property of this class is
// rejected outright (400) before it ever reaches the controller —
// belt-and-braces alongside UsersService's own allowlist.
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9\s-]{7,20}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  // profile/username-column-and-display-convention. 3-30 chars, letters,
  // digits and underscore; any case is accepted and stored lowercase
  // (UsersService), so uniqueness is case-insensitive. The username RULES
  // (reserved words, impersonation, profanity, personal data, revoked
  // handles, change cooldown) are enforced by UsernamePolicyService, not here.
  // `null` is still ACCEPTED by this DTO (IsOptional skips null) but is refused
  // by UsersService with 400 username_required: since B-031 a user cannot clear
  // their own username; only an admin revoke (B-033) removes one.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,30}$/, {
    message: 'username must be 3-30 characters: letters, numbers and underscores only',
  })
  username?: string | null;

  // backend/w5-profile-block (B-038, Decision Log #371, #394 A3). Free-text
  // profile content. `null` (or a blank string) CLEARS the field, unlike the
  // username. Length limits are adopted defaults (the Decision Log fixes none):
  // bio 160, preferred club 80, mirrored by CHECK constraints on the columns.
  // Both go through the pre-publication sensitive-content screen in
  // UsersService.updateOwnProfile (a flagged value is refused with a 422
  // 'please rephrase' and nothing is saved).
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  preferredClub?: string | null;

  // The OPTIONAL profile country (#403 item 17): an ISO 3166-1 alpha-2 code from
  // the full list, any case, stored upper-case; null / blank clears it. Checked
  // against the real code list in UsersService (normaliseProfileCountry), not by
  // regex here. Distinct from the safeguarding country, which no endpoint edits.
  @IsOptional()
  @IsString()
  @MaxLength(2)
  profileCountry?: string | null;
}
