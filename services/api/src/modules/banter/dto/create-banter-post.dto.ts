import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// POST /banter-rooms/:id/posts. The room-scoped post-creation body.
// Deliberately the fields of CreatePostDto MINUS clubPageId/banterRoomId
// (feed/dto/create-post.dto.ts): `banterRoomId` comes from the URL param,
// never the body, and a post can't be club-scoped and room-scoped at
// once. Same contentText 1-3000 / mediaIds max-10 bounds and
// reasoning as CreatePostDto (backend/w14-post-media-pipeline: uploaded files by id, no free URLs) — this is the same kind of content, just
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
  @IsUUID(undefined, { each: true })
  mediaIds?: string[];
}
