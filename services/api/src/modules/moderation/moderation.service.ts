import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, Report } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { isAdminChildSafetyVetted } from './child-safety-vetting.util';
import { appealWindowLapsed } from '../account-hold/account-hold.rules';
import { resolveReportAppealWindowDays } from '../account-hold/account-hold.config';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { BanterService } from '../banter/banter.service';
import { RegistrationEmailService } from '../auth/registration/email/registration-email.service';
import { GuardianSecurityEventKey } from '../guardian-security-notice/guardian-security-notice.constants';
import { PostMediaObjectsService } from '../post-media/post-media-objects.service';
import {
  AccountSuspensionService,
  ReinstatementApplied,
  SuspensionApplied,
} from '../account-suspension/account-suspension.service';
import { GuardianSecurityNoticeService } from '../guardian-security-notice/guardian-security-notice.service';
import { resolveConcernsMinor } from './report-concerns-minor.util';
import { PUBLIC_NAME_SELECT, resolvePublicName } from '../users/public-name.util';
import { resolveReportedUserId } from './report-target.util';
import {
  CONTENT_REMOVAL_NOT_APPLICABLE_CODE,
  ContentRemovalOutcome,
  applyContentRemoval,
  isContentRemovalTarget,
  restoreContentRemoval,
} from './content-removal.util';
import { decodeModerationCursor, encodeModerationCursor } from './cursor.util';
import { ActionReportDto } from './dto/action-report.dto';
import { AppealDecisionDto } from './dto/appeal-decision.dto';
import { AppealReportDto } from './dto/appeal-report.dto';
import { CreatePublicReportDto } from './dto/create-public-report.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { EscalateReportDto } from './dto/escalate-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import {
  APPEAL_WINDOW_CLOSED_CODE,
  CHILD_SAFETY_VETTING_REQUIRED_CODE,
  DEFAULT_REPORT_SEVERITY,
  ENQUIRY_REPORT_TARGET_TYPE,
  MODERATION_DEFAULT_PAGE_SIZE,
  MODERATION_MAX_PAGE_SIZE,
  MESSAGE_REPORT_CONTEXT_MAX,
  MESSAGE_REPORT_CONTEXT_WINDOW,
  MESSAGE_REPORT_TARGET_TYPE,
  REASON_REQUIRED_CATEGORY,
  REPORT_CONTEXT_NOT_ALLOWED_CODE,
  REPORT_REASON_REQUIRED_CODE,
  REPORT_SOURCE_CONTACT_ENQUIRY,
  ROOM_DEACTIVATED_ACTION,
  ReportAction,
  USER_SUSPENSION_NOT_APPLICABLE_CODE,
  isUserSuspensionTarget,
} from './moderation.constants';

// B-046 part B: a report made from a Contact Us enquiry carries `source: 'contact_enquiry'` (the key is ABSENT on
// every other report, so existing response shapes are unchanged).
export type ReportWithSource = Report & { source?: typeof REPORT_SOURCE_CONTACT_ENQUIRY };

// B-289 (Decision Log #483): what actionReport returns. `contentRemoval` is present ONLY when the action was
// content_removed, and says what happened to the one reported item: 'removed', 'already_removed' (another report
// removed it first and keeps the claim) or 'target_not_found' (the row is gone; nothing to remove, the action is
// still recorded).
export type ActionedReport = Report & { contentRemoval?: ContentRemovalOutcome };

export interface ReportListPage {
  items: ReportWithSource[];
  nextCursor: string | null;
}

// The enquiry behind an 'enquiry' report, for the report detail. Name and email are what the sender typed.
export interface ReportContactEnquiryView {
  id: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  createdAt: Date;
  userId: string | null;
}

// backend/b067-message-report: the ONE message behind a 'message' report, for the report detail. Exactly this
// message and nothing else of the conversation: no other message, no conversation id, no recipient, no media. The
// text comes back even if the sender has since edited it (originalContentText is the text as first sent, null
// unless it was edited) or deleted it for everyone (deletedForEveryone true): the row and its text are kept, and
// the moderator must be able to see what was reported.
export interface ReportedMessageView {
  id: string;
  sentAt: Date;
  sender: { publicName: string };
  contentText: string;
  originalContentText: string | null;
  editedAt: Date | null;
  deletedForEveryone: boolean;
  // B-289: when a moderator removed it (null = not removed). The text above is still returned in full.
  removedByModerationAt: Date | null;
}

// backend/b286-message-report-context (Decision Log #477): one message the reporter attached as context to a
// 'message' report. Same text rules as ReportedMessageView (text kept after an edit or a delete-for-everyone).
// sentByReporter says which side wrote it. No conversation id, no recipient, no sender id.
export interface ReportContextMessageView {
  id: string;
  sentAt: Date;
  sender: { publicName: string };
  sentByReporter: boolean;
  contentText: string;
  originalContentText: string | null;
  editedAt: Date | null;
  deletedForEveryone: boolean;
  removedByModerationAt: Date | null;
}

export type ReportDetail = ReportWithSource & {
  contactEnquiry?: ReportContactEnquiryView | null;
  // Set (to the message, or null if the row is gone, which nothing does today) only on a 'message' report.
  reportedMessage?: ReportedMessageView | null;
  // Set only on a 'message' report: the attached context, oldest first, an empty array when none.
  contextMessages?: ReportContextMessageView[];
};

// What assertMessageReportable learned about the reported message, for the context check.
interface ReportableMessage {
  id: string;
  conversationId: string;
  sentAt: Date;
  // The reporter's "delete chat" cutoff for this conversation, or null.
  chatHiddenAt: Date | null;
}

// B-279 (Decision Log #456 A and C): the guardian of a MINOR who is the reported user is told the OUTCOME of an
// actioned report, as the kind of action that was taken and nothing else. 'dismissed' took no action, so it has
// no entry: a guardian is never told that a report exists. The reporter is never notified this way (B).
//
// user_suspended is DELIBERATELY NOT in this map (B-291, Decision Log #485): recording it now really suspends the
// account, and the account_suspended notice is sent exactly once by AccountSuspensionService.completeSuspension
// (and not at all when the account was already suspended or deleted). Listing it here too would tell the guardian twice.
const GUARDIAN_NOTICE_FOR_REPORT_ACTION: Partial<Record<ReportAction, GuardianSecurityEventKey>> = {
  content_removed: 'content_removed',
  warning_issued: 'warning_issued',
  room_deactivated: 'room_deactivated',
};

function withSourceHint(report: Report): ReportWithSource {
  return report.targetType === ENQUIRY_REPORT_TARGET_TYPE
    ? { ...report, source: REPORT_SOURCE_CONTACT_ENQUIRY }
    : report;
}

// Build Plan Section 4.8 (Admin Service) + Section 8.4 (Moderation &
// appeals workflow). See README.md for the full guard/permission
// reasoning and the two Decision Log candidates this module's own two
// user-facing endpoints (POST /reports, POST /reports/:id/appeal)
// surface — Section 4 never defines either route.
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: RegistrationEmailService,
    // feat/admin-action-log — see AdminActionLogService's own header
    // comment for why this is a separate audit trail from Report's own
    // reviewed/action/appeal fields, and why record() is called after
    // (not inside) each method's own $transaction/update.
    private readonly adminActionLogService: AdminActionLogService,
    // Decision Log #357 — room_deactivated writes BanterRoom.status through
    // BanterService.setRoomStatus, inside actionReport's own transaction.
    private readonly banterService: BanterService,
    // B-279: the guardian of a minor who is the REPORTED user hears the outcome (never that a report exists).
    private readonly guardianNotices: GuardianSecurityNoticeService,
    // B-290 (Decision Log #484): Remove Content on a post withdraws the public copy of its media (after the commit,
    // best effort); an overturned appeal republishes it. Optional so a unit test needs no object store.
    // B-291 (Decision Log #485): user_suspended suspends the account behind the target, in the same step; an
    // overturned appeal of that report reinstates it. The one path the admin user page also uses.
    private readonly accountSuspension: AccountSuspensionService,
    @Optional() private readonly postMediaObjects?: PostMediaObjectsService,
  ) {}

  // -------------------------------------------------------------------
  // POST /reports (user-facing, JwtAuthGuard only — see README.md for why
  // this is deliberately NOT GuardianConsentGuard-gated).
  // -------------------------------------------------------------------
  async createReport(reporterId: string, dto: CreateReportDto): Promise<Report> {
    const reason = this.resolveReportReason(dto.reasonCategory, dto.reason);
    // Decision Log #477: contextMessageIds belongs to a 'message' report only. A plain 400, before any database read.
    if (dto.contextMessageIds != null && dto.targetType !== MESSAGE_REPORT_TARGET_TYPE) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: REPORT_CONTEXT_NOT_ALLOWED_CODE,
        message: 'Context messages can only be attached to a report about a message.',
      });
    }
    if (dto.targetType === MESSAGE_REPORT_TARGET_TYPE) {
      return this.createMessageReport(reporterId, dto, reason);
    }
    await this.assertReportTargetExists(dto.targetType, dto.targetId);

    return this.prisma.report.create({
      data: {
        reporterId,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason,
        reasonCategory: dto.reasonCategory,
        // Decision Log #466: POST /reports has no concernsMinor field, so the flag can only come from the
        // 'child_safety_concern' category here.
        concernsMinor: resolveConcernsMinor(dto.reasonCategory, false),
        // Defaults to 'medium' when omitted — matched explicitly here
        // rather than left to Report.severity's own DB-level default, so
        // the API's documented behaviour doesn't depend on a Prisma
        // undefined-vs-omitted nuance.
        severity: dto.severity ?? DEFAULT_REPORT_SEVERITY,
      },
    });
  }

  // -------------------------------------------------------------------
  // POST /reports/public (no guard at all — see PublicReportsController's
  // own header comment). For a non-authenticated party (a parent, a
  // school, a member of the public) to flag content that depicts them or
  // their child without first having to register. reporterId is left
  // null on the created row — see Report's own schema comment on why
  // reporterId/reporter became optional, and README.md for this route's
  // Decision Log candidate.
  // -------------------------------------------------------------------
  async createPublicReport(dto: CreatePublicReportDto): Promise<Report> {
    const reason = this.resolveReportReason(dto.reasonCategory, dto.reason);
    await this.assertReportTargetExists(dto.targetType, dto.targetId);

    const report = await this.prisma.report.create({
      data: {
        reporterId: null,
        reporterContactEmail: dto.reporterContactEmail,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason,
        reasonCategory: dto.reasonCategory,
        // Decision Log #466: the reporter's own value, raised to true by the 'child_safety_concern' category.
        concernsMinor: resolveConcernsMinor(dto.reasonCategory, dto.concernsMinor),
        // Defaults to 'medium' when omitted — see createReport's own
        // comment on why this is matched explicitly rather than left to
        // Report.severity's DB-level default.
        severity: dto.severity ?? DEFAULT_REPORT_SEVERITY,
      },
    });

    // Same "must never block on / fail because of email delivery"
    // discipline as RegistrationService's own fire-and-forget sends — a
    // failed acknowledgment must not fail the report submission itself,
    // and the caller here has no session to retry against anyway.
    void this.emailService.sendPublicReportAcknowledgementEmail(dto.reporterContactEmail).catch((err: Error) => {
      this.logger.warn(
        `Failed to queue public-report acknowledgement email for report ${report.id}: ${err.message}`,
      );
    });

    return report;
  }

  // B-284 (Decision Log #465). The text stored in Report.reason: the description as given, or the empty string
  // when the reporter gave none, so every reader of Report.reason keeps getting a string. Category 'other'
  // requires a description that is not blank (coded 400); every other category does not. Checked before the
  // target-exists 404 (bad input first, no database read).
  private resolveReportReason(category: string, reason: string | undefined): string {
    const text = reason ?? '';
    if (category === REASON_REQUIRED_CATEGORY && text.trim().length === 0) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: REPORT_REASON_REQUIRED_CODE,
        message: 'Please describe the problem in a few words.',
      });
    }
    return text;
  }

  // backend/b067-message-report (founder decision 2026-11-08). Reporting a message in a chat.
  //
  // Who may report: ONLY the other participant of the conversation (the recipient). Not the sender (their own
  // message), not a stranger. The message must be one the reporter can currently SEE: not hidden by them
  // (MessageHide), not sent at or before the moment they deleted the chat (ConversationHide), not deleted for
  // everyone. Everything else is the SAME 404 'Message not found' a missing id gives: a private conversation's
  // messages are never confirmed to exist to a non-participant (the assertParticipant convention in
  // MessagingService). Block is NOT checked: a person who blocked the sender must still be able to report what the
  // sender wrote (the thread still shows it, getMessages has no block filter).
  private async assertMessageReportable(reporterId: string, messageId: string): Promise<ReportableMessage> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        senderId: true,
        sentAt: true,
        conversationId: true,
        deletedForEveryoneAt: true,
        conversation: { select: { participantIds: true } },
        hides: { where: { userId: reporterId }, select: { userId: true }, take: 1 },
      },
    });
    if (
      !message ||
      message.senderId === reporterId ||
      !message.conversation.participantIds.includes(reporterId) ||
      message.deletedForEveryoneAt ||
      message.hides.length > 0
    ) {
      throw new NotFoundException('Message not found');
    }
    const chatHide = await this.prisma.conversationHide.findUnique({
      where: { userId_conversationId: { userId: reporterId, conversationId: message.conversationId } },
      select: { hiddenAt: true },
    });
    // GET .../messages shows sentAt > hiddenAt only, so anything at or before the cutoff is gone for this person.
    if (chatHide && message.sentAt <= chatHide.hiddenAt) {
      throw new NotFoundException('Message not found');
    }
    return {
      id: message.id,
      conversationId: message.conversationId,
      sentAt: message.sentAt,
      chatHiddenAt: chatHide?.hiddenAt ?? null,
    };
  }

  // backend/b286-message-report-context (Decision Log #477). The ONE place the context ids are checked. Every id must
  // be a message of the SAME conversation as the reported one, among the MESSAGE_REPORT_CONTEXT_WINDOW messages
  // immediately before and the same number immediately after it in (sentAt, id) order (positions are counted over ALL
  // the conversation's messages, hidden or deleted ones included, so the window reveals nothing), and visible to the
  // reporter exactly as the reported message must be (not hidden by them, after any "delete chat" cutoff, not
  // deleted for everyone). The reporter's own messages are allowed. The reported message itself is NOT a valid
  // context id (it is already the target). ANY failure is the same 404 'Message not found' the other refusals give,
  // so nothing about a message the reporter may not see is confirmed. Duplicates are dropped first.
  private async resolveContextMessageIds(
    reporterId: string,
    reported: ReportableMessage,
    ids: string[] | undefined,
  ): Promise<string[]> {
    const unique = [...new Set(ids ?? [])];
    if (unique.length === 0) return [];
    const notFound = () => new NotFoundException('Message not found');
    if (unique.includes(reported.id)) throw notFound();

    const [before, after] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          conversationId: reported.conversationId,
          OR: [{ sentAt: { lt: reported.sentAt } }, { sentAt: reported.sentAt, id: { lt: reported.id } }],
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: MESSAGE_REPORT_CONTEXT_WINDOW,
        select: { id: true },
      }),
      this.prisma.message.findMany({
        where: {
          conversationId: reported.conversationId,
          OR: [{ sentAt: { gt: reported.sentAt } }, { sentAt: reported.sentAt, id: { gt: reported.id } }],
        },
        orderBy: [{ sentAt: 'asc' }, { id: 'asc' }],
        take: MESSAGE_REPORT_CONTEXT_WINDOW,
        select: { id: true },
      }),
    ]);
    const inWindow = new Set([...before, ...after].map((m) => m.id));
    if (unique.some((id) => !inWindow.has(id))) throw notFound();

    const rows = await this.prisma.message.findMany({
      where: { id: { in: unique }, conversationId: reported.conversationId },
      select: {
        id: true,
        sentAt: true,
        deletedForEveryoneAt: true,
        removedByModerationAt: true,
        hides: { where: { userId: reporterId }, select: { userId: true }, take: 1 },
      },
    });
    const visible = rows.filter(
      (r) =>
        !r.deletedForEveryoneAt &&
        // B-289: a message a moderator removed is a stub to the reporter, so it cannot be attached as context.
        !r.removedByModerationAt &&
        r.hides.length === 0 &&
        !(reported.chatHiddenAt && r.sentAt <= reported.chatHiddenAt),
    );
    if (visible.length !== unique.length) throw notFound();
    return unique;
  }

  // Attaches context ids to a report, inside the caller's transaction. At most MESSAGE_REPORT_CONTEXT_MAX in TOTAL:
  // ids already attached are skipped, and when the report is nearly full only the first ones that fit (in the order
  // the reporter sent them) are added; the rest are ignored without an error (DEFAULT, founder-veto-able).
  private async attachContextMessages(
    tx: Prisma.TransactionClient,
    reportId: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;
    const current = await tx.reportContextMessage.findMany({ where: { reportId }, select: { messageId: true } });
    const have = new Set(current.map((c) => c.messageId));
    const fresh = ids.filter((id) => !have.has(id)).slice(0, Math.max(0, MESSAGE_REPORT_CONTEXT_MAX - have.size));
    if (fresh.length === 0) return;
    await tx.reportContextMessage.createMany({
      data: fresh.map((messageId) => ({ reportId, messageId })),
      skipDuplicates: true,
    });
  }

  // One OPEN report per reporter per message. DEFAULT, founder-veto-able: a repeat while the reporter's earlier
  // report on the same message is still open returns that existing report (no second row, no error). The other
  // user-reportable target types have no duplicate check at all (nothing to copy); the nearest precedent is
  // PostMediaReportService, where a repeat is a success that changes nothing. Serialised per (reporter, message)
  // by a transaction-level advisory lock so two simultaneous submissions cannot both create a row.
  private async createMessageReport(reporterId: string, dto: CreateReportDto, reason: string): Promise<Report> {
    const reported = await this.assertMessageReportable(reporterId, dto.targetId);
    const contextIds = await this.resolveContextMessageIds(reporterId, reported, dto.contextMessageIds);

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`message-report:${reporterId}:${dto.targetId}`}))`;
      const existing = await tx.report.findFirst({
        where: { reporterId, targetType: MESSAGE_REPORT_TARGET_TYPE, targetId: dto.targetId, status: 'open' },
        orderBy: { createdAt: 'asc' },
      });
      if (existing) {
        // A repeat: the earlier report is returned, and any new valid context is added to it (up to the total cap).
        await this.attachContextMessages(tx, existing.id, contextIds);
        return existing;
      }
      const created = await tx.report.create({
        data: {
          reporterId,
          targetType: MESSAGE_REPORT_TARGET_TYPE,
          targetId: dto.targetId,
          reason,
          reasonCategory: dto.reasonCategory,
          // Decision Log #466: the 'child_safety_concern' category raises the minor flag, exactly as for any report.
          concernsMinor: resolveConcernsMinor(dto.reasonCategory, false),
          severity: dto.severity ?? DEFAULT_REPORT_SEVERITY,
        },
      });
      await this.attachContextMessages(tx, created.id, contextIds);
      return created;
    });
  }

  // A well-formed but non-existent target must 404, never a raw FK-less
  // silent accept — Report.targetId is a bare string, not an FK (by
  // design: it has to point at three different tables depending on
  // targetType, so Prisma relations can't express this), so nothing
  // at the database layer would otherwise catch a typo'd or already-deleted id.
  private async assertReportTargetExists(targetType: string, targetId: string): Promise<void> {
    switch (targetType) {
      case 'post': {
        const post = await this.prisma.post.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!post) throw new NotFoundException('Post not found');
        return;
      }
      case 'comment': {
        const comment = await this.prisma.comment.findUnique({
          where: { id: targetId },
          select: { id: true },
        });
        if (!comment) throw new NotFoundException('Comment not found');
        return;
      }
      case 'user': {
        const user = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!user) throw new NotFoundException('User not found');
        return;
      }
      case 'banter_room': {
        const room = await this.prisma.banterRoom.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!room) throw new NotFoundException('Banter Room not found');
        return;
      }
      case 'grassroots_team': {
        const team = await this.prisma.grassrootsTeam.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!team) throw new NotFoundException('Team not found');
        return;
      }
      case 'fixture': {
        const fixture = await this.prisma.fixture.findUnique({ where: { id: targetId }, select: { id: true } });
        if (!fixture) throw new NotFoundException('Fixture not found');
        return;
      }
    }
  }

  // Shared "who is the reported user" resolution (see report-target.util.ts for the per-targetType rules).
  // Used by appealReport's eligibility check and the notification steps below.
  private resolveReportedUserId(targetType: string, targetId: string): Promise<string | null> {
    return resolveReportedUserId(this.prisma, targetType, targetId);
  }

  private async assertReportExists(id: string): Promise<Report> {
    const report = await this.prisma.report.findUnique({ where: { id } });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return report;
  }

  // -------------------------------------------------------------------
  // feat/moderation-outcome-appeal-emails — outcome and appeal-decision
  // emails. Both are fire-and-forget after the state change has committed
  // (the same "email delivery must never block or fail the action" rule
  // createPublicReport already follows), and both catch everything inside
  // the helper, so a lookup or send failure can never surface as a 500 on
  // the admin action that triggered it.
  // -------------------------------------------------------------------

  // The address to send a moderation email to, or null if there is none
  // to send to. A deleted account (accountStatus 'deleted', Decision Log
  // #341) has an anonymised placeholder address that must never receive
  // mail, so it resolves to null the same way a missing user does.
  private async deliverableEmailForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, accountStatus: true },
    });
    if (!user || user.accountStatus === 'deleted' || !user.email) {
      return null;
    }
    return user.email;
  }

  // To the REPORTER, once their report has been actioned. A logged-in
  // reporter's address comes from their User row; a public reporter's
  // comes from Report.reporterContactEmail (reporterId is null for them).
  //
  // NEVER for a report made from a Contact Us enquiry (Decision Log #445, founder decision 2026-10-30): the
  // enquirer made no report, "your report has been actioned" is the wrong message, and the address is whatever
  // they typed and may not be theirs. Every action, not only dismiss.
  private async notifyReporterOfOutcome(report: Report, action: ReportAction): Promise<void> {
    if (report.targetType === ENQUIRY_REPORT_TARGET_TYPE) {
      return;
    }
    try {
      const to = report.reporterId
        ? await this.deliverableEmailForUser(report.reporterId)
        : report.reporterContactEmail;
      if (!to) {
        return;
      }
      await this.emailService.sendReportActionedEmail(to, action);
    } catch (err) {
      this.logger.warn(
        `Failed to queue report-outcome email for report ${report.id}: ${(err as Error).message}`,
      );
    }
  }

  // To the APPELLANT — the reported party whose appeal was just decided.
  // The appellant is always the reported user (appealReport enforces it),
  // so reportedUserId is the right address to resolve.
  private async notifyAppellantOfDecision(
    reportId: string,
    reportedUserId: string | null,
    decision: string,
  ): Promise<void> {
    try {
      if (!reportedUserId) {
        return;
      }
      const to = await this.deliverableEmailForUser(reportedUserId);
      if (!to) {
        return;
      }
      await this.emailService.sendAppealDecisionEmail(to, decision);
    } catch (err) {
      this.logger.warn(
        `Failed to queue appeal-decision email for report ${reportId}: ${(err as Error).message}`,
      );
    }
  }

  // -------------------------------------------------------------------
  // Child-safety-vetting gate. AdminAccessTokenPayload structurally
  // carries only { sub, role, aud } (admin-token.types.ts) — the same
  // "no safety-sensitive state in the token, always re-read Postgres"
  // discipline GuardianConsentGuard already applies for the User side
  // (Section 5.7). childSafetyVetted is exactly that kind of state, so
  // it is read fresh here on every call this gates, never trusted from a
  // cached/stale value. Applies REGARDLESS of AdminRolesGuard's own
  // moderator/superadmin role check — a superadmin who is not
  // child-safety-vetted is blocked exactly the same as a moderator who
  // isn't; vetting is an orthogonal axis to role.
  // -------------------------------------------------------------------
  private async isChildSafetyVetted(adminId: string): Promise<boolean> {
    // The rule lives in child-safety-vetting.util.ts so the media review queue applies the same one.
    return isAdminChildSafetyVetted(this.prisma, adminId);
  }

  private async assertChildSafetyVetted(adminId: string): Promise<void> {
    if (await this.isChildSafetyVetted(adminId)) {
      return;
    }
    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: CHILD_SAFETY_VETTING_REQUIRED_CODE,
      message: 'This action requires a child-safety-vetted admin.',
    });
  }

  // -------------------------------------------------------------------
  // POST /reports/:id/appeal (user-facing, JwtAuthGuard only). Only the
  // REPORTED user (never the reporter) may appeal, and only once a
  // report has actually been actioned — a dismissed report (status
  // 'reviewed') took no action against anyone, so there is nothing to
  // appeal.
  // -------------------------------------------------------------------
  async appealReport(reportId: string, callerId: string, dto: AppealReportDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    if (report.status !== 'actioned') {
      throw new ForbiddenException('Only an actioned report may be appealed');
    }

    if (report.appealStatus) {
      throw new ConflictException('This report has already been appealed');
    }

    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);
    if (!reportedUserId || reportedUserId !== callerId) {
      throw new ForbiddenException('You may only appeal a report made against you');
    }

    // backend/w6-hold-rule-extension (B-044, Decision Log #376): an appeal must be filed within the appeal
    // window, counted from the decision. The window length is configuration (REPORT_APPEAL_WINDOW_DAYS), not a
    // counsel-sourced figure, and is deliberately NOT stated in the message (a duration is a legal promise).
    // reviewedAt is always set on an actioned report (it is written together with the action), so the null case
    // is only a data-integrity guard and lets the appeal through.
    if (report.reviewedAt && appealWindowLapsed(report.reviewedAt, resolveReportAppealWindowDays(), new Date())) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: APPEAL_WINDOW_CLOSED_CODE,
        message: 'The time allowed for appealing this report has passed.',
      });
    }

    return this.prisma.report.update({
      where: { id: reportId },
      data: {
        appealStatus: 'pending',
        appealReason: dto.reason,
        appealedAt: new Date(),
      },
    });
  }

  // -------------------------------------------------------------------
  // GET /admin/moderation/reports (AdminJwtAuthGuard + AdminRolesGuard,
  // moderator/superadmin only). Keyset-paginated, newest-first, optional
  // exact-match `status` filter.
  //
  // `adminId` is the CALLER's id, freshly checked against
  // AdminUser.childSafetyVetted (see assertChildSafetyVetted's own
  // comment). A non-vetted admin — regardless of role — never sees a
  // Report where concernsMinor is true at all; it is filtered out of the
  // list rather than returned and then hidden, so no partial/redacted
  // row shape is needed.
  // -------------------------------------------------------------------
  async listReports(query: ListReportsQueryDto, adminId: string): Promise<ReportListPage> {
    const limit = Math.min(query.limit ?? MODERATION_DEFAULT_PAGE_SIZE, MODERATION_MAX_PAGE_SIZE);

    const conditions: Prisma.ReportWhereInput[] = [];
    if (query.status) {
      conditions.push({ status: query.status });
    }
    if (!(await this.isChildSafetyVetted(adminId))) {
      conditions.push({ concernsMinor: false });
    }
    if (query.cursor) {
      const cursor = decodeModerationCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const where: Prisma.ReportWhereInput = conditions.length > 0 ? { AND: conditions } : {};

    const rows = await this.prisma.report.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const items = page.map(withSourceHint);
    const nextCursor = hasMore && last ? encodeModerationCursor({ createdAt: last.createdAt, id: last.id }) : null;

    return { items, nextCursor };
  }

  // -------------------------------------------------------------------
  // GET /admin/moderation/reports/:id (AdminJwtAuthGuard +
  // AdminRolesGuard, moderator/superadmin only). The single-resource fetch
  // ReportDetailPage.tsx/AppealReviewPage.tsx previously had no backend
  // route for (see api/moderation.ts's own former Decision Log candidate
  // #4 comment, superseded by this route) — a direct visit or a page
  // refresh no longer needs to bounded-scan the list endpoint for a
  // matching id.
  //
  // Same guard shape as actionReport/decideAppeal: 404 (existence) is
  // settled first via assertReportExists, THEN — only if the report
  // concerns a minor — the child-safety-vetting gate is applied. A
  // non-vetted admin who somehow reaches a concernsMinor report directly
  // (a stale bookmark, a shared link, router `state` surviving in
  // history) gets the same 403 (CHILD_SAFETY_VETTING_REQUIRED_CODE) on
  // GET as they would on PATCH — this is a read of safety-sensitive
  // content, not a mutation, but the access restriction is the same
  // either way: listReports already keeps a non-vetted admin from ever
  // seeing this report's id in the queue at all, so this is purely the
  // "direct access" backstop, matching actionReport/decideAppeal's own
  // reasoning.
  // -------------------------------------------------------------------
  async getReportById(reportId: string, adminId: string): Promise<ReportDetail> {
    const report = await this.assertReportExists(reportId);

    if (report.concernsMinor) {
      await this.assertChildSafetyVetted(adminId);
    }

    // B-046 part B: an 'enquiry' report loads with a source hint and the enquiry it came from (null if that
    // enquiry has since been deleted, which RESTRICT should prevent). No reported user exists for it, so no
    // reported-user data is attached.
    if (report.targetType === ENQUIRY_REPORT_TARGET_TYPE) {
      const contactEnquiry = await this.prisma.contactEnquiry.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          name: true,
          email: true,
          category: true,
          subject: true,
          message: true,
          status: true,
          createdAt: true,
          userId: true,
        },
      });
      return { ...withSourceHint(report), contactEnquiry };
    }

    // backend/b067-message-report: a 'message' report loads with ONLY the reported message attached (the shape
    // 'enquiry' reports already use for their enquiry). Post and comment reports attach nothing: their detail is
    // the Report row alone (targetType + targetId), so this is the one place a reported target's content is read.
    // The vetting gate above has already applied when the report concerns a minor.
    if (report.targetType === MESSAGE_REPORT_TARGET_TYPE) {
      const row = await this.prisma.message.findUnique({
        where: { id: report.targetId },
        select: {
          id: true,
          sentAt: true,
          contentText: true,
          originalContentText: true,
          editedAt: true,
          deletedForEveryoneAt: true,
          removedByModerationAt: true,
          sender: { select: PUBLIC_NAME_SELECT },
        },
      });
      const reportedMessage: ReportedMessageView | null = row
        ? {
            id: row.id,
            sentAt: row.sentAt,
            sender: { publicName: resolvePublicName(row.sender) },
            contentText: row.contentText,
            originalContentText: row.originalContentText,
            editedAt: row.editedAt,
            deletedForEveryone: row.deletedForEveryoneAt !== null,
            removedByModerationAt: row.removedByModerationAt,
          }
        : null;
      // Decision Log #477: the context the reporter attached, oldest first. Only the fields below; no conversation
      // id, no recipient, no sender id, no other message of the thread.
      const contextRows = await this.prisma.reportContextMessage.findMany({
        where: { reportId: report.id },
        orderBy: [{ message: { sentAt: 'asc' } }, { message: { id: 'asc' } }],
        select: {
          message: {
            select: {
              id: true,
              sentAt: true,
              senderId: true,
              contentText: true,
              originalContentText: true,
              editedAt: true,
              deletedForEveryoneAt: true,
              removedByModerationAt: true,
              sender: { select: PUBLIC_NAME_SELECT },
            },
          },
        },
      });
      const contextMessages: ReportContextMessageView[] = contextRows.map(({ message: m }) => ({
        id: m.id,
        sentAt: m.sentAt,
        sender: { publicName: resolvePublicName(m.sender) },
        sentByReporter: report.reporterId !== null && m.senderId === report.reporterId,
        contentText: m.contentText,
        originalContentText: m.originalContentText,
        editedAt: m.editedAt,
        deletedForEveryone: m.deletedForEveryoneAt !== null,
        removedByModerationAt: m.removedByModerationAt,
      }));
      return { ...report, reportedMessage, contextMessages };
    }

    return report;
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id (AdminJwtAuthGuard +
  // AdminRolesGuard, moderator/superadmin only). Admin actions a report:
  // content removal, a warning, a suspension, or dismissed. Maps onto
  // Report.status's own pre-existing enum (dismissed -> 'reviewed',
  // anything else -> 'actioned'), never a fourth status value.
  // -------------------------------------------------------------------
  async actionReport(reportId: string, adminId: string, dto: ActionReportDto): Promise<ActionedReport> {
    const report = await this.assertReportExists(reportId);

    // 404 (existence) is already settled above; this is the "403 on
    // direct access" half of the concernsMinor gate (listReports is the
    // filtering half) — a non-vetted admin may not act on a report
    // concerning a minor, regardless of role.
    if (report.concernsMinor) {
      await this.assertChildSafetyVetted(adminId);
    }

    if (report.status !== 'open') {
      throw new ConflictException('This report has already been reviewed');
    }

    if (dto.action === ROOM_DEACTIVATED_ACTION && report.targetType !== 'banter_room') {
      throw new BadRequestException('room_deactivated may only be recorded against a Banter Room report');
    }

    // B-289 (Decision Log #483): content_removed is enforced for a post, a comment or a message and offered for
    // nothing else (a user, a room, a team, a fixture or an enquiry has no content to remove).
    if (dto.action === 'content_removed' && !isContentRemovalTarget(report.targetType)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: CONTENT_REMOVAL_NOT_APPLICABLE_CODE,
        message: 'Content can only be removed from a post, a comment or a message.',
      });
    }

    // B-291 (Decision Log #485): user_suspended is offered for a user, or the author / sender of a post, a comment or
    // a message, and for nothing else (a room, a team, a fixture or an enquiry has no single account behind it).
    if (dto.action === 'user_suspended' && !isUserSuspensionTarget(report.targetType)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: USER_SUSPENSION_NOT_APPLICABLE_CODE,
        message: 'An account can only be suspended from a report about a user, a post, a comment or a message.',
      });
    }

    const newStatus = dto.action === 'dismissed' ? 'reviewed' : 'actioned';
    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);
    let contentRemoval: ContentRemovalOutcome | undefined;
    let suspension: SuspensionApplied | undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      // Decision Log #357 — the one action with a side effect beyond the
      // report row. Runs in this same transaction, so a failed status write
      // also rolls back the recorded outcome.
      if (dto.action === ROOM_DEACTIVATED_ACTION) {
        await this.banterService.setRoomStatus(tx, report.targetId, 'inactive');
      }
      // B-289: the removal itself, in the SAME transaction as recording the action. Only the reported target is
      // touched; a context message attached to a message report never is.
      if (dto.action === 'content_removed') {
        contentRemoval = await applyContentRemoval(tx, report, new Date());
      }
      // B-291: the suspension itself, in the SAME transaction as recording the action, so a failed report update
      // rolls the account status back too. Only the account behind the target is touched. The stored link to this
      // report is set only when the account was not already suspended. A deleted account, or one already suspended,
      // is left alone (the action is still recorded below). Sessions, points, the guardian notice and the email run
      // after the commit.
      if (dto.action === 'user_suspended' && reportedUserId) {
        suspension = await this.accountSuspension.applySuspensionInTx(tx, reportedUserId, { reportId });
      }

      const updatedReport = await tx.report.update({
        where: { id: reportId },
        data: {
          status: newStatus,
          actionTaken: dto.action,
          reviewedByAdminId: adminId,
          reviewedAt: new Date(),
          appealStatus: null,
          appealReason: null,
          appealedAt: null,
          appealReviewedByAdminId: null,
          appealReviewedAt: null,
        },
      });

      // A reporter may be an unauthenticated contact and therefore have no
      // User row. Do not attempt to create a notification with a null userId.
      if (report.reporterId) {
        await tx.notification.create({
          data: { userId: report.reporterId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }
      if (reportedUserId && reportedUserId !== report.reporterId) {
        await tx.notification.create({
          data: { userId: reportedUserId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }

      return updatedReport;
    });

    // See AdminActionLogService's own comment on why this runs after (not
    // inside) the transaction above.
    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.REPORT_ACTIONED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      reportId,
      dto.action,
    );

    // B-290: the post is already hidden by the read gate; now take its media out of the public prefix. The private
    // copy stays as evidence until this report closes (RejectedMediaSweepService.confirmModerationRemovals).
    if (contentRemoval === 'removed' && report.targetType === 'post') {
      void this.postMediaObjects?.withdrawForPost(report.targetId);
    }

    // B-291: everything that follows the committed suspension. A failure here (Redis down while ending sessions)
    // is logged loudly but does not fail the request: the report is already actioned and cannot be actioned again, so
    // a 500 would leave an admin unable to retry. completeSuspension throws before it notifies anyone, so a failed
    // step means no guardian notice or email went out either.
    if (suspension) {
      try {
        await this.accountSuspension.completeSuspension(suspension, { reasonCategory: report.reasonCategory });
      } catch (err) {
        this.logger.error(
          `Report ${reportId} suspended user ${suspension.userId} but the follow-up failed (${(err as Error).message}). ` +
            `Sessions and points for that account may need to be revoked by hand.`,
        );
      }
    }

    void this.notifyReporterOfOutcome(report, dto.action);

    // B-279: tell the REPORTED minor's guardian the outcome (never the reporter's, and never on 'dismissed').
    // For content_removed this is now literally true (B-289): the item really is removed.
    const guardianEvent = GUARDIAN_NOTICE_FOR_REPORT_ACTION[dto.action];
    if (guardianEvent && reportedUserId) {
      this.guardianNotices.notifyInBackground(reportedUserId, guardianEvent);
    }

    return contentRemoval ? { ...updated, contentRemoval } : updated;
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id/appeal (AdminJwtAuthGuard +
  // AdminRolesGuard, moderator/superadmin only). The second-reviewer
  // decision — Decision Log #138, hard-enforced: the reviewing admin
  // must NOT be the same admin who actioned the original report.
  // -------------------------------------------------------------------
  async decideAppeal(reportId: string, adminId: string, dto: AppealDecisionDto): Promise<Report> {
    const report = await this.assertReportExists(reportId);

    // Same "403 on direct access" gate actionReport applies — reviewing
    // an appeal on a report concerning a minor requires the SAME
    // child-safety vetting, on top of (not instead of) Decision Log
    // #138's separate same-admin-may-not-review-their-own-action rule
    // checked below.
    if (report.concernsMinor) {
      await this.assertChildSafetyVetted(adminId);
    }

    if (report.appealStatus !== 'pending') {
      throw new ConflictException('This report has no pending appeal to review');
    }

    if (report.reviewedByAdminId === adminId) {
      throw new ForbiddenException('The admin who actioned this report may not also review its appeal');
    }

    const reportedUserId = await this.resolveReportedUserId(report.targetType, report.targetId);

    let restoredPostId = null as string | null;
    let reinstatement: ReinstatementApplied | undefined;
    const updated = await this.prisma.$transaction(async (tx) => {
      const data: Prisma.ReportUpdateInput = {
        appealStatus: dto.decision,
        appealReviewedByAdmin: { connect: { id: adminId } },
        appealReviewedAt: new Date(),
      };

      if (dto.decision === 'overturned') {
        data.status = 'open';
        data.reviewedByAdmin = { disconnect: true };
        data.reviewedAt = null;
        data.actionTaken = null;
        // B-289 (Decision Log #483): overturning an appeal on a content_removed report brings the content back,
        // in the same transaction, but only if THIS report is the one that removed it.
        if (report.actionTaken === 'content_removed') {
          const restored = await restoreContentRemoval(tx, report);
          if (restored && report.targetType === 'post') restoredPostId = report.targetId;
        }
        // B-291 (Decision Log #485): overturning an appeal on a user_suspended report reinstates the account,
        // in the same transaction, but ONLY if this report is the one that suspended it (the stored link). If the
        // account is no longer suspended (deleted, or reinstated by hand) only the link is cleared.
        if (report.actionTaken === 'user_suspended' && reportedUserId) {
          reinstatement = await this.accountSuspension.applyReinstatementInTx(tx, reportedUserId, {
            onlyIfSuspendedByReportId: reportId,
          });
        }
      }

      const updatedReport = await tx.report.update({ where: { id: reportId }, data });

      if (reportedUserId) {
        await tx.notification.create({
          data: { userId: reportedUserId, type: 'moderation_decision', payloadRefId: reportId },
        });
      }

      return updatedReport;
    });

    // See AdminActionLogService's own comment on why this runs after (not
    // inside) the transaction above.
    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.REPORT_APPEAL_DECIDED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      reportId,
      dto.decision,
    );

    // B-290: the post is back, so its media goes back to the public prefix (from the private copy kept at removal).
    if (restoredPostId) void this.postMediaObjects?.republishForPost(restoredPostId);

    // B-291: the account is active again. The guardian of a minor hears account_reinstated once and the person gets
    // the reinstatement email (completeReinstatement sends nothing unless a suspension was really lifted). Both are
    // background; the appeal_overturned guardian notice below is a separate event and still goes.
    if (reinstatement) {
      try {
        await this.accountSuspension.completeReinstatement(reinstatement);
      } catch (err) {
        this.logger.error(`Appeal on report ${reportId} reinstated user ${reinstatement.userId} but the follow-up failed: ${(err as Error).message}`);
      }
    }

    void this.notifyAppellantOfDecision(reportId, reportedUserId, dto.decision);

    // B-279: the appeal OUTCOME only, to the appellant's (the reported user's) guardian if they are a minor.
    if (reportedUserId) {
      this.guardianNotices.notifyInBackground(
        reportedUserId,
        dto.decision === 'upheld' ? 'appeal_upheld' : 'appeal_overturned',
      );
    }

    return updated;
  }

  // -------------------------------------------------------------------
  // PATCH /admin/moderation/reports/:id/escalate (AdminJwtAuthGuard +
  // AdminRolesGuard('moderator', 'superadmin') from the controller, PLUS
  // the child-safety-vetting gate below) — restricted to vetted admins
  // regardless of the target report's own concernsMinor value (a report
  // may need escalating precisely because it wasn't flagged as
  // concerning a minor at submission time but turns out, on review, to
  // be one). Sets the escalation trail Report's own schema comment
  // describes: escalatedAt/escalatedByAdminId/escalationNotes/
  // escalatedToAuthority. This endpoint records that a human has done
  // something outside Soccernity (or is flagging it for someone who
  // will) — it does not itself contact anyone. Deliberately independent
  // of reviewedByAdminId/appealReviewedByAdminId/Report.status —
  // escalating is not the same act as actioning or appeal-reviewing, and
  // this may be called on a report in any status.
  // -------------------------------------------------------------------
  async escalateReport(reportId: string, adminId: string, dto: EscalateReportDto): Promise<Report> {
    await this.assertReportExists(reportId);
    await this.assertChildSafetyVetted(adminId);

    const updated = await this.prisma.report.update({
      where: { id: reportId },
      data: {
        escalatedAt: new Date(),
        escalatedByAdminId: adminId,
        escalationNotes: dto.escalationNotes,
        escalatedToAuthority: dto.escalatedToAuthority,
      },
    });

    await this.adminActionLogService.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.REPORT_ESCALATED,
      ADMIN_ACTION_LOG_TARGET_TYPES.REPORT,
      reportId,
      `escalatedToAuthority=${dto.escalatedToAuthority}: ${dto.escalationNotes}`,
    );

    return updated;
  }
}
