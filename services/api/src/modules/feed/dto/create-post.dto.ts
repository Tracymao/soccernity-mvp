import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// Build Plan Section 4.3 (POST /posts) and Section 3 (Post entity fields
// this maps onto: contentText, mediaUrls, clubPageId, banterRoomId).
//
// contentText max length: Section 4.3 doesn't specify one. 3000 is a
// deliberate, documented choice (not a guess left unstated) — long
// enough for a genuine matchday recap/write-up, short enough to keep a
// single feed row (and a page of GET /posts/feed results) predictable in
// size per Section 5.5's low-bandwidth discipline. Revisit if product
// feedback wants longer posts.
//
// mediaIds (backend/w14-post-media-pipeline, Decision Log #419): the ids of files the caller uploaded
// through POST /media/uploads (at most 10, the same cap the free-URL field had). A post no longer takes
// free URLs from a user: `mediaUrls` is not a field of this DTO, so the global ValidationPipe
// (forbidNonWhitelisted) answers a request carrying it with a 400. Ownership, "not already attached" and
// "not rejected" are checked in FeedService (post-media-attach.util.ts).
//
// authorId is deliberately NOT a field here — it comes from the verified
// JWT (@CurrentUser()) in the controller, never from the request body.
// See feed.controller.ts.
//
// clubPageId / banterRoomId: mutual exclusivity ("a post belongs to at
// most one of a club page or a Banter Room") is a cross-field rule, not
// a single-field shape check — enforced in FeedService, not here, same
// precedent as RegistrationService enforcing "guardian required when
// isMinor" instead of a static DTO decorator (see register.dto.ts).
export class CreatePostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  contentText!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  mediaIds?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  clubPageId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  banterRoomId?: string;
}
