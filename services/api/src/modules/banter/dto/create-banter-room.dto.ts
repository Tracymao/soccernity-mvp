import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import {
  BANTER_ROOM_DESCRIPTION_MAX_LENGTH,
  BANTER_ROOM_SCOPE_TYPES,
  BanterRoomScopeType,
} from '../banter.constants';

// POST /banter-rooms (Build Plan Section 4.4). BanterRoom Section 3
// fields a caller supplies: `name`, `scopeType`, and (Decision Log #276
// item b, sprint-3/banter-room-scope-ref) an optional `scopeRef` naming
// the real entity the room is about. `createdBy` is taken from the
// verified access token (@CurrentUser()), never the body — same
// discipline as CreatePostDto's authorId / CreateTeamDto's createdById.
// `memberCount`, `scopeName` are managed by BanterService, never client
// inputs.
//
// `scopeType` is validated against the exact four-value allow-list in
// banter.constants.ts (matching the schema comment and the Figma scope
// filter bar), the same @IsIn precedent CreateTeamDto uses for
// GrassrootsTeam.leagueType and guardian-details.dto.ts uses for
// Guardian.relationship.
//
// `scopeRef` is only syntactically checked here (a UUID). Whether it may
// accompany this scopeType, whether the entity exists, and whether the
// caller is affiliated with it are all decided in
// BanterService.resolveScopeTarget — a DTO cannot see the scopeType/
// scopeRef pairing rule across fields without a custom validator, and
// this codebase enforces cross-field rules in the service layer
// (GrassrootsService.createFixture's teamBId/opponentName precedent).
//
// `name` length: 2-120, matching CreateTeamDto.name — a room name and a
// team name are the same kind of short public label, no reason to pick
// different bounds.
// `description` (founder decision 2026-11-14): optional, text-only. Trimmed BEFORE validation (the
// global ValidationPipe has transform: true, same approach as CreateContactEnquiryDto); a blank or
// whitespace-only value becomes `undefined`, i.e. the same as omitting it, and BanterService stores
// that as NULL. Max length is a DEFAULT, founder-veto-able (BANTER_ROOM_DESCRIPTION_MAX_LENGTH).
const trimToUndefinedWhenBlank = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

export class CreateBanterRoomDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsIn(BANTER_ROOM_SCOPE_TYPES)
  scopeType!: BanterRoomScopeType;

  @IsOptional()
  @IsUUID()
  scopeRef?: string;

  @Transform(trimToUndefinedWhenBlank)
  @IsOptional()
  @IsString()
  @MaxLength(BANTER_ROOM_DESCRIPTION_MAX_LENGTH)
  description?: string;
}
