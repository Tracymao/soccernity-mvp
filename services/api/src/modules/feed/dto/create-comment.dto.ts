import { IsString, MaxLength, MinLength } from 'class-validator';

// Build Plan Section 4.3 (POST /posts/:id/comments) and Section 3
// (Comment entity: contentText). Section 4.3 doesn't specify a max
// length for a comment any more than it did for a post's contentText —
// this DTO deliberately reuses CreatePostDto's own choice of 3000
// rather than inventing a second, unexplained number. A comment is
// realistically shorter than a matchday recap in practice, but nothing
// in the spec justifies a *different* ceiling, and picking one without
// a reason would just be a second guess sitting next to the first. If
// product feedback ever wants comments capped tighter than posts, that
// should be a deliberate, documented change here — not an accidental
// inconsistency.
//
// authorId is deliberately NOT a field here, same precedent as
// CreatePostDto — it comes from the verified JWT (@CurrentUser()) in
// the controller, never from the request body.
export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(3000)
  contentText!: string;
}
