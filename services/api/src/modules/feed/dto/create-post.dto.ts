import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

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
// mediaUrls max size: 10 items is a conservative cap against a single
// post being used to smuggle an unbounded payload into a feed row —
// Section 5.5 applies to list *endpoints*, but an unbounded array on a
// single post has the same "someone can make this arbitrarily large"
// shape. Each entry is validated as a URL: no media-upload endpoint
// exists yet in this slice (that's Admin/media, Section 4.8, later
// sprint), so the caller is expected to already hold a real, hosted
// media URL by the time this DTO is hit.
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
  @IsUrl({}, { each: true })
  mediaUrls?: string[];

  @IsOptional()
  @IsString()
  @MinLength(1)
  clubPageId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  banterRoomId?: string;
}
