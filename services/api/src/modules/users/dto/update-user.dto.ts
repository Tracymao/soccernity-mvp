import { IsOptional, IsString, Length, Matches } from 'class-validator';

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
  // (UsersService), so uniqueness is case-insensitive. `null` clears it
  // (IsOptional skips validation for null as well as undefined), which
  // returns the user to showing their displayName.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_]{3,30}$/, {
    message: 'username must be 3-30 characters: letters, numbers and underscores only',
  })
  username?: string | null;
}
