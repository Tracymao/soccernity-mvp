import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/guards/current-user.decorator';
import { RestrictUnder16, Under16RestrictionGuard } from '../auth/guards/under-16-restriction.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { DeleteMessageQueryDto } from './dto/delete-message-query.dto';
import { EditMessageDto } from './dto/edit-message.dto';
import { MessagingQueryDto } from './dto/messaging-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { MessagingService } from './messaging.service';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';

// Build Plan Section 4.7 (Content, Messaging, Notification & Search
// Services) — the Messaging slice. Section 4.7's literal list:
//   GET /conversations              POST /conversations
//   GET /conversations/:id/messages  POST /conversations/:id/messages
// This controller builds all four, plus PATCH /conversations/:id/read
// (mark-read) — NOT in Section 4.7's literal list, added the same way
// BanterController added POST/DELETE /banter-rooms/:id/join, and modelled
// on the PATCH /notifications/read-all pattern from the same Section 4.7.
//
// Restricted-pending enforcement (Decision Log #12): GuardianConsentGuard
// on the two write routes blocks a pending-consent minor from SENDING;
// MessagingService.assertRecipientMessageable blocks them from being a
// RECIPIENT. Both directions, per #12's explicit resolution. See
// messaging/README.md.
// sprint-1/under-16-restrictions: whole controller off for isUnder16 accounts
// (reads included). Class-level guards run BEFORE route-level ones, so
// JwtAuthGuard is repeated here to attach request.user first.
@UseGuards(JwtAuthGuard, Under16RestrictionGuard)
@RestrictUnder16('messaging')
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly messaging: MessagingService) {}

  // POST /conversations { recipientId } — find-or-create the DM thread
  // between the caller and one other user. JwtAuthGuard +
  // GuardianConsentGuard ("messaging" is safety-sensitive, Section 5.7).
  //
  // 201 when a new conversation is created, 200 when an existing one is
  // returned — a clean signal the frontend can use ("did I just start
  // this thread, or resume it"). @Res({ passthrough: true }) is Nest's
  // documented way to set the status conditionally while still returning
  // a serialized body.
  @Post()
  @UseGuards(JwtAuthGuard, GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async start(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: StartConversationDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { view, created } = await this.messaging.startConversation(user.sub, dto.recipientId);
    res.status(created ? 201 : 200);
    return view;
  }

  // GET /conversations — the caller's inbox, keyset-paginated,
  // most-recent-activity first. JwtAuthGuard only (reading your own
  // inbox). Declared before any /:id route.
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@CurrentUser() user: AccessTokenPayload, @Query() query: MessagingQueryDto) {
    return this.messaging.listConversations(user.sub, query);
  }

  // GET /conversations/:id/messages — one thread's messages,
  // keyset-paginated newest-first (matching GET /clubs/:id/feed).
  // JwtAuthGuard + participant check (404 for a non-participant).
  @Get(':id/messages')
  @UseGuards(JwtAuthGuard)
  async messages(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: MessagingQueryDto,
  ) {
    return this.messaging.getMessages(id, user.sub, query);
  }

  // POST /conversations/:id/messages { contentText } —
  // JwtAuthGuard + GuardianConsentGuard + participant check. Nest's
  // default 201 (this really does create a Message).
  @Post(':id/messages')
  @UseGuards(JwtAuthGuard, GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async send(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(id, user.sub, dto);
  }

  // PATCH /conversations/:id/messages/:messageId { contentText } (B-067, Decision Log #472 (b)) -- the sender
  // edits their own text message within 15 minutes. It publishes text under the user's identity just as a send
  // does, so it carries exactly the guard set of POST /conversations/:id/messages (consent, verified email,
  // profile complete); the service passes the same participant and Block checks. 200 with the message.
  @Patch(':id/messages/:messageId')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard, EmailVerifiedGuard, ProfileCompleteGuard)
  async editMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: EditMessageDto,
  ) {
    return this.messaging.editMessage(id, messageId, user.sub, dto);
  }

  // DELETE /conversations/:id/messages/:messageId?scope=me|everyone (B-067) -- 204. Removing your own view, or
  // your own message, creates nothing under your identity, so it carries the consent guard only (the "undo form"
  // rule of the uniform write block: delete own post, delete own comment). Allowed even when a Block exists.
  @Delete(':id/messages/:messageId')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async deleteMessage(
    @Param('id') id: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AccessTokenPayload,
    @Query() query: DeleteMessageQueryDto,
  ): Promise<void> {
    await this.messaging.deleteMessage(id, messageId, user.sub, query.scope);
  }

  // DELETE /conversations/:id (B-067) -- "delete chat" for the caller only; 204. Same guard as the message delete.
  @Delete(':id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async deleteConversation(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload): Promise<void> {
    await this.messaging.deleteConversation(id, user.sub);
  }

  // PATCH /conversations/:id/read — mark the thread read for the caller.
  // JwtAuthGuard + participant check. HttpCode(200): it mutates existing
  // rows, doesn't create a resource. Idempotent.
  @Patch(':id/read')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async markRead(@Param('id') id: string, @CurrentUser() user: AccessTokenPayload) {
    return this.messaging.markConversationRead(id, user.sub);
  }
}
