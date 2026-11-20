import { IsUUID } from 'class-validator';

// POST /conversations (Build Plan Section 4.7). The caller supplies the
// ONE other person they want to message — `recipientId`. The caller
// themselves is taken from the verified access token (@CurrentUser()),
// never the body, the same discipline every other write DTO in this
// codebase uses (CreatePostDto.authorId, CreateBanterRoomDto.createdBy,
// CreateTeamDto.createdById).
//
// Exactly one recipient, not a `participantIds[]` array: DMs are strictly
// 2-party for MVP (Build Plan Section 6 Sprint 3 says "send and receive a
// DM"; the Message pillar Figma + recipient picker are 1:1; Message.readAt
// is a single timestamp, which only has coherent semantics between two
// people). Conversation.participantIds is array-shaped in Section 3 for
// forward-compatibility and to make "the conversation between these two"
// a set-equality lookup — not a mandate for group chat, which is
// explicitly out of scope (see messaging/README.md).
//
// @IsUUID(): User.id is `@default(uuid())` (schema.prisma). A well-formed
// but non-existent id, or a restricted-pending / deactivated recipient,
// is handled in the service as a 404 — see
// MessagingService.assertRecipientMessageable.
export class StartConversationDto {
  @IsUUID()
  recipientId!: string;
}
