import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

// POST /banter-rooms/:id/topics (Build Plan Section 4.4's literal,
// previously-unbuilt route — sprint-3/banter-room-topics resolves
// Decision Log #276). BanterRoom now has a genuine Topic entity +
// BanterRoomTopic join, deliberately SEPARATE from `scopeType` (a bare
// room CATEGORY, `club | league | country | topic` — see
// banter.constants.ts and BanterRoom.scopeType's own schema comment).
//
// `names` — plural, matching the endpoint's own plural path segment
// (`:id/topics`, a collection sub-resource, not `PATCH :id { topicId }`)
// — each is find-or-created (via `upsert`) against Topic by a normalized
// (trim + lowercase) name, mirroring CreateCommunityGroupDto/
// CommunityGroupsService's own nameNormalized dedup convention, then
// attached to the room. Attaching an already-attached topic is a genuine
// no-op, not an error — see BanterService.attachOneTopic's own comment
// for the full mechanism (and a real transaction-poisoning bug this
// design specifically avoids).
//
// Max 5 per call — this is a curation action (a room's creator tagging
// it with a handful of descriptive topics), not a bulk-import endpoint;
// an arbitrary large batch in one request is not a real use case here.
export class AttachBanterRoomTopicsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsString({ each: true })
  @MinLength(2, { each: true })
  @MaxLength(60, { each: true })
  names!: string[];
}
