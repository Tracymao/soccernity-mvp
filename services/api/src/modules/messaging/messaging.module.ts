import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthFoundationModule } from '../auth/auth-foundation.module';
import { ConversationsController } from './conversations.controller';
import { MessagingService } from './messaging.service';

// Sprint 3 — Build Plan Section 4.7 (Content, Messaging, Notification &
// Search Services), the Messaging slice: GET/POST /conversations,
// GET/POST /conversations/:id/messages, plus PATCH /conversations/:id/read.
//
// Imports AuthFoundationModule so JwtAuthGuard + GuardianConsentGuard
// resolve via DI (same pattern FeedModule / ClubsModule / BanterModule /
// GrassrootsModule use). No FeedModule import — messaging touches no
// posts.
//
// Schema: two additive columns on Conversation this sprint —
// participantKey (@unique, backs POST /conversations's race-safe
// find-or-create) and lastMessageAt (backs the inbox ordering)
// (migration 20260909090000_add_conversation_participant_key_and_last_message_at).
// Both founder-approved, flagged as Decision Log #277. See
// modules/messaging/README.md for the endpoint list, the conversation-
// shape decisions, and the restricted-pending enforcement (Decision Log
// #12).
@Module({
  imports: [AuthFoundationModule],
  controllers: [ConversationsController],
  providers: [MessagingService, PrismaService],
})
export class MessagingModule {}
