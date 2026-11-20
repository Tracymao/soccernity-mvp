import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { IsAtLeastOneDimensionPresent } from './at-least-one-dimension.validator';

// POST /community-groups (Build Plan Sprint 3, Decision Log #281).
// CommunityGroup fields a caller supplies: name, and at least one of
// city/positionPlayed/careerTrack. `createdById` is taken from the
// verified access token (@CurrentUser()), never the body — same
// discipline as CreateTeamDto.createdById / CreateBanterRoomDto.createdBy.
// `memberCount` starts at its schema @default(1) (the creator is
// auto-joined — CommunityGroupsService.createGroup) and is never a client
// input. `nameNormalized` is derived server-side from `name`, never
// supplied directly.
//
// `name` length 2-120, matching CreateTeamDto.name / CreateBanterRoomDto.name
// — the same kind of short public label. `city`/`positionPlayed`/
// `careerTrack` are plain free-text strings (like GrassrootsTeam.city),
// not validated against a fixed allow-list — the Figma design's own
// worked examples ("Lagos" / "Striker" / "Coaching") give no fixed
// enumerated set to validate against, unlike BanterRoom.scopeType or
// GrassrootsTeam.leagueType, which DO have a schema-comment-backed
// allow-list to enforce.
//
// IsAtLeastOneDimensionPresent (a real DTO-level custom validator, see
// that file's own comment on why this diverges from this codebase's
// usual service-layer-cross-field-rule convention) is attached to `name`
// as the anchor property — it reads the whole DTO instance, not `name`'s
// own value.
export class CreateCommunityGroupDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  @IsAtLeastOneDimensionPresent()
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  positionPlayed?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  careerTrack?: string;
}
