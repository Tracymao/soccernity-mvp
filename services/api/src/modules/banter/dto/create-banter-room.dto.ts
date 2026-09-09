import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { BANTER_ROOM_SCOPE_TYPES, BanterRoomScopeType } from '../banter.constants';

// POST /banter-rooms (Build Plan Section 4.4). BanterRoom Section 3
// fields a caller supplies: `name`, `scopeType`. `createdBy` is taken
// from the verified access token (@CurrentUser()), never the body —
// same discipline as CreatePostDto's authorId / CreateTeamDto's
// createdById. `memberCount` starts at its schema @default(0) and is
// managed by BanterService, never a client input.
//
// `scopeType` is validated against the exact four-value allow-list in
// banter.constants.ts (matching the schema comment and the Figma scope
// filter bar), the same @IsIn precedent CreateTeamDto uses for
// GrassrootsTeam.leagueType and guardian-details.dto.ts uses for
// Guardian.relationship.
//
// `name` length: 2-120, matching CreateTeamDto.name — a room name and a
// team name are the same kind of short public label, no reason to pick
// different bounds.
export class CreateBanterRoomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(BANTER_ROOM_SCOPE_TYPES)
  scopeType!: BanterRoomScopeType;
}
