import { IsUUID } from 'class-validator';

// POST /contest/entries — the "Create a Post — For Contest" flow's second
// call: the composer creates the Post via the normal POST /posts, then
// submits that post's id here to enter it into the currently-open weekly
// round. Deliberately references an existing Post rather than creating
// one, so POST /posts stays the single post-creation path (and its own
// GuardianConsentGuard / validation / notification wiring is not
// duplicated). See contest/README.md.
export class SubmitEntryDto {
  @IsUUID()
  postId!: string;
}
