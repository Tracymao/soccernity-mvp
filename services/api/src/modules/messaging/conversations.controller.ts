import {
  Body,
  Controller,
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
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AccessTokenPayload } from '../auth/token/token.types';
import { MessagingQueryDto } from './dto/messaging-query.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { StartConversationDto } from './dto/start-conversation.dto';
import { MessagingService } from './messaging.service';

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
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
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

  // POST /conversations/:id/messages { contentText, mediaUrl? } —
  // JwtAuthGuard + GuardianConsentGuard + participant check. Nest's
  // default 201 (this really does create a Message).
  @Post(':id/messages')
  @UseGuards(JwtAuthGuard, GuardianConsentGuard)
  async send(
    @Param('id') id: string,
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: SendMessageDto,
  ) {
    return this.messaging.sendMessage(id, user.sub, dto);
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
