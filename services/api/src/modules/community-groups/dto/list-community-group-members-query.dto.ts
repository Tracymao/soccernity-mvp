import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// GET /community-groups/:id/members (Build Plan Sprint 3, Decision Log
// #281). Mirrors ListClubMembersQueryDto exactly — a deliberately small
// local DTO (same { cursor, limit } shape, same default 20 / max 50 page
// size) rather than importing across the module boundary, per this
// task's own "mirror GET /clubs/:id/members exactly" instruction and the
// same "small deliberate duplicate over a forced cross-module fit"
// precedent ListClubMembersQueryDto's own comment already sets.
export class ListCommunityGroupMembersQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
