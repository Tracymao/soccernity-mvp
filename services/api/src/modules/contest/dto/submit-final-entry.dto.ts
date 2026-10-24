import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

// POST /contest/final-entry -- a finalist uploads their NEW final video (docs/contest-spec.md
// section 10). Unlike the weekly flow (create a post, then POST /contest/entries), the final entry's
// post is created HERE, hidden from the first instant: if the composer made it with POST /posts it
// would be a public post until the second call flagged it, and "finalist videos are hidden from
// everyone except their owner until the reveal" would not hold.
//
// Same field limits as CreatePostDto (3000 characters of text, up to 10 URLs), but at least one media
// URL is required: the final is a video upload. The server cannot check the URL is a video (no
// media-upload endpoint exists for posts; the URL is whatever the client holds) -- OPEN in the report.
export class SubmitFinalEntryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  contentText!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  mediaUrls!: string[];
}
