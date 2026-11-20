import { IsUUID, ValidateIf } from 'class-validator';

// PATCH /users/:id/represented-club (Decision Log #74). `clubId` must be
// present: null unrepresents the club, a UUID represents it (membership is
// checked in UsersService.setRepresentedClub). A missing key fails
// validation, since ValidateIf only skips the UUID check for an explicit null.
export class SetRepresentedClubDto {
  @ValidateIf((o: SetRepresentedClubDto) => o.clubId !== null)
  @IsUUID()
  clubId!: string | null;
}
