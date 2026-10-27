import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// POST /contest/final-entry -- a finalist uploads their NEW final video (docs/contest-spec.md
// section 10). Unlike the weekly flow (create a post, then POST /contest/entries), the final entry's
// post is created HERE, hidden from the first instant: if the composer made it with POST /posts it
// would be a public post until the second call flagged it, and "finalist videos are hidden from
// everyone except their owner until the reveal" would not hold.
//
// backend/w14-post-media-pipeline (Decision Log #419 item 7): the final's video is an UPLOAD, not a
// pasted link. `mediaId` is the id of a video the caller uploaded through POST /media/uploads (exactly
// one, owned by the caller, unattached, not rejected, kind 'video' -- checked in FeedService via
// post-media-attach.util.ts). A final entry whose video is not APPROVED by the reveal is not shown
// (post-media-visibility.util.ts), however the reveal clock stands.
export class SubmitFinalEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  contentText!: string;

  @IsUUID()
  mediaId!: string;
}
