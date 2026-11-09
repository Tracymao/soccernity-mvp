import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { readMessagingConfig } from './messaging.config';
import { MESSAGE_RETENTION_MAX_PER_RUN } from './messaging.constants';

export interface PurgeMessagesResult {
  deletedMessageCount: number;
  deletedConversationCount: number;
  /** More due messages existed than MESSAGE_RETENTION_MAX_PER_RUN; the rest wait for the next run. */
  capped: boolean;
}

// backend/b287-message-retention (B-287; Decision Log #478). Deletes direct messages MESSAGE_RETENTION_MONTHS
// (default 12) after they were sent. Applies to minors and adults alike, to the edited original
// (Message.originalContentText goes with the row) and to messages deleted for everyone.
//
// NEVER deletes a message that is evidence:
//   - a Report with targetType 'message' points at it (Report.targetId is a bare string, no foreign key), or
//   - a ReportContextMessage row attached it to a report as surrounding context (a RESTRICT foreign key: the
//     database itself would refuse that delete).
// The test is in the SELECT and repeated, in full, in the DELETE statement, so a report filed between the two
// protects the message. The message stays for as long as the report does (a report is only removed by its own
// retention, which is not built here).
//
// What goes with a message: MessageHide rows (ON DELETE CASCADE). What does not exist: a stored media object.
// A DM carries no media since B-259 (the send DTO refuses mediaUrl) and the messaging module has no storage, so
// there is nothing in object storage to delete; the old Message.mediaUrl column is not written by any route.
//
// A conversation that LOST messages in this run and now has none is deleted too (its ConversationHide rows go
// by cascade): the inbox would otherwise list it as an empty thread. A conversation that never had a message
// (a thread just started, nothing sent) is never a candidate, because only conversations touched by this run's
// delete are examined. The empty-check sits in the DELETE, so a message sent in between keeps the conversation.
//
// Cron discipline copied from ContactEnquiryRetentionService (B-046): daily, 6-field cron, a per-run cap, the
// oldest first, counts only in the log (never an id, name or text), `now` injectable for tests.
// 04:00 -- after the 03:45 Contact Us retention job.
@Injectable()
export class MessageRetentionService {
  private readonly logger = new Logger(MessageRetentionService.name);
  private readonly retentionMonths: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService,
  ) {
    this.retentionMonths = readMessagingConfig({ get: (k) => config.get<string>(k) }).retentionMonths;
  }

  @Cron('0 0 4 * * *')
  async runDailyPurge(): Promise<void> {
    try {
      const r = await this.purgeExpired();
      this.logger.log(
        `Message retention complete: messages=${r.deletedMessageCount} conversations=${r.deletedConversationCount} capped=${r.capped}`,
      );
    } catch (err) {
      this.logger.error(
        `Message retention failed (${err instanceof Error ? err.message : String(err)}); it will run again tomorrow.`,
      );
    }
  }

  // Strictly OLDER than the cutoff: a message sent exactly at the cutoff instant is kept. Calendar months
  // through setUTCMonth (not a fixed day count, not setMonth, which is DST-sensitive), the same convention as
  // ContactEnquiryRetentionService and AccountDeletionSweepService.purgeExpiredConsentAuditRecords.
  async purgeExpired(now: Date = new Date()): Promise<PurgeMessagesResult> {
    const cutoff = new Date(now);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - this.retentionMonths);

    return this.prisma.$transaction(async (tx) => {
      const due = await tx.$queryRaw<{ id: string }[]>`
        SELECT m."id" FROM "Message" m
        WHERE m."sentAt" < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM "Report" r WHERE r."targetType" = 'message' AND r."targetId" = m."id")
          AND NOT EXISTS (SELECT 1 FROM "ReportContextMessage" c WHERE c."messageId" = m."id")
        ORDER BY m."sentAt" ASC, m."id" ASC
        LIMIT ${MESSAGE_RETENTION_MAX_PER_RUN + 1}`;
      const capped = due.length > MESSAGE_RETENTION_MAX_PER_RUN;
      if (capped) {
        this.logger.log(
          `Message retention: more than ${MESSAGE_RETENTION_MAX_PER_RUN} messages are due; processing the oldest ${MESSAGE_RETENTION_MAX_PER_RUN}, the rest wait for the next run.`,
        );
      }
      const ids = due.slice(0, MESSAGE_RETENTION_MAX_PER_RUN).map((d) => d.id);
      if (ids.length === 0) return { deletedMessageCount: 0, deletedConversationCount: 0, capped };

      const deleted = await tx.$queryRaw<{ conversationId: string }[]>`
        DELETE FROM "Message" m
        WHERE m."id" = ANY(${ids}::text[])
          AND m."sentAt" < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM "Report" r WHERE r."targetType" = 'message' AND r."targetId" = m."id")
          AND NOT EXISTS (SELECT 1 FROM "ReportContextMessage" c WHERE c."messageId" = m."id")
        RETURNING m."conversationId"`;
      const touched = [...new Set(deleted.map((d) => d.conversationId))];

      let deletedConversationCount = 0;
      if (touched.length > 0) {
        const res = await tx.conversation.deleteMany({
          where: { id: { in: touched }, messages: { none: {} } },
        });
        deletedConversationCount = res.count;
      }
      return { deletedMessageCount: deleted.length, deletedConversationCount, capped };
    });
  }
}
