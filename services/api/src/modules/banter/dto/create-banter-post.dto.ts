import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';

// POST /banter-rooms/:id/posts. The room-scoped post-creation body.
// Deliberately the fields of CreatePostDto MINUS clubPageId/banterRoomId
// (feed/dto/create-post.dto.ts): `banterRoomId` comes from the URL param,
// never the body, and a post can't be club-scoped and room-scoped at
// once. Same contentText 1-3000 / mediaUrls max-10-URLs bounds and
// reasoning as CreatePostDto — this is the same kind of content, just
// scoped to a room. authorId comes from the access token in the
// controller.
//
// BanterService.postToRoom maps this onto FeedService.createPost's own
// CreatePostDto shape ({ ...this, banterRoomId: <url param> }) rather
// than reimplementing post creation — see banter/README.md.
export class CreateBanterPostDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  contentText!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUrl({}, { each: true })
  mediaUrls?: string[];
}
