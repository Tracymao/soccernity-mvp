import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { HOLD_REASON_MAX_LENGTH, HOLD_REASON_MIN_LENGTH } from '../account-hold/hold.service';
import { assertAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';
import { ENQUIRY_REPORT_TARGET_TYPE } from '../moderation/moderation.constants';
import {
  CONTACT_CATEGORY_LABELS,
  CONTACT_ENQUIRY_ADMIN_DEFAULT_PAGE_SIZE,
  CONTACT_ENQUIRY_ADMIN_MAX_PAGE_SIZE,
  CONTACT_ENQUIRY_ESCALATED_CODE,
  CONTACT_ENQUIRY_ESCALATION_REASON_INVALID_CODE,
  CONTACT_ENQUIRY_REPORT_REASON_MAX_LENGTH,
  ContactCategory,
} from './contact.constants';
import { decodeContactEnquiryCursor, encodeContactEnquiryCursor } from './cursor.util';
import { EscalateContactEnquiryDto } from './dto/escalate-contact-enquiry.dto';
import { ListContactEnquiriesQueryDto } from './dto/list-contact-enquiries-query.dto';

export interface ContactEnquiryListItem {
  id: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  status: string;
  createdAt: Date;
  lastMessageAt: Date;
  handledAt: Date | null;
  handledByAdminId: string | null;
  /** 'signed_in' when the sender was signed in at submission (userId set), else 'guest'. */
  submitter: 'signed_in' | 'guest';
  hasEscalation: boolean;
}

export interface ContactEnquiryDetail extends ContactEnquiryListItem {
  message: string;
  userId: string | null;
  escalatedReportId: string | null;
}

export interface ContactEnquiryListPage {
  items: ContactEnquiryListItem[];
  nextCursor: string | null;
}

export interface EscalationResult {
  enquiry: ContactEnquiryDetail;
  report: { id: string; status: string; severity: string; concernsMinor: boolean };
}

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  category: true,
  subject: true,
  status: true,
  createdAt: true,
  lastMessageAt: true,
  handledAt: true,
  handledByAdminId: true,
  userId: true,
  escalatedReportId: true,
} as const;

const DETAIL_SELECT = { ...LIST_SELECT, message: true } as const;

type ListRow = Prisma.ContactEnquiryGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.ContactEnquiryGetPayload<{ select: typeof DETAIL_SELECT }>;

function toListItem(row: ListRow): ContactEnquiryListItem {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    category: row.category,
    subject: row.subject,
    status: row.status,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
    handledAt: row.handledAt,
    handledByAdminId: row.handledByAdminId,
    submitter: row.userId ? 'signed_in' : 'guest',
    hasEscalation: row.escalatedReportId !== null,
  };
}

function toDetail(row: DetailRow): ContactEnquiryDetail {
  return { ...toListItem(row), message: row.message, userId: row.userId, escalatedReportId: row.escalatedReportId };
}

// One bounded text for the Report: category, subject and message together, capped at the report-reason bound.
// The full message stays on the linked enquiry.
export function buildEnquiryReportReason(category: string, subject: string, message: string): string {
  const label = CONTACT_CATEGORY_LABELS[category as ContactCategory] ?? category;
  const text = `Contact enquiry (${label}) - ${subject}: ${message}`;
  return text.length <= CONTACT_ENQUIRY_REPORT_REASON_MAX_LENGTH
    ? text
    : `${text.slice(0, CONTACT_ENQUIRY_REPORT_REASON_MAX_LENGTH - 1)}…`;
}

// backend/w7-contact-enquiry-admin-escalate (B-046 part B; Decision Log #444, #445, founder decisions
// 2026-10-30). The admin side of Contact Us enquiries: list, open, mark handled / reopen, and escalate into a
// Report. The role gate (moderator, superadmin) is on the controller.
//
// Escalation is NOT Report.escalatedAt and its siblings (those mean "escalated to a child-safety lead or an
// authority", a different act): it creates a Report with targetType 'enquiry' and links it through
// ContactEnquiry.escalatedReportId, which also exempts the enquiry from the 12-month deletion (#444).
@Injectable()
export class ContactEnquiryAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListContactEnquiriesQueryDto): Promise<ContactEnquiryListPage> {
    const limit = Math.min(query.limit ?? CONTACT_ENQUIRY_ADMIN_DEFAULT_PAGE_SIZE, CONTACT_ENQUIRY_ADMIN_MAX_PAGE_SIZE);

    const conditions: Prisma.ContactEnquiryWhereInput[] = [];
    if (query.status) conditions.push({ status: query.status });
    if (query.category) conditions.push({ category: query.category });
    if (query.cursor) {
      const cursor = decodeContactEnquiryCursor(query.cursor);
      conditions.push({
        OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
      });
    }

    const rows = await this.prisma.contactEnquiry.findMany({
      where: conditions.length > 0 ? { AND: conditions } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: LIST_SELECT,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(toListItem),
      nextCursor: hasMore && last ? encodeContactEnquiryCursor({ createdAt: last.createdAt, id: last.id }) : null,
    };
  }

  async getById(id: string): Promise<ContactEnquiryDetail> {
    const row = await this.prisma.contactEnquiry.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!row) throw new NotFoundException('Contact enquiry not found');
    return toDetail(row);
  }

  /** PATCH :id/handled. Idempotent: setting the state it is already in changes nothing and logs nothing. */
  async setHandled(id: string, adminId: string, handled: boolean): Promise<ContactEnquiryDetail> {
    const existing = await this.prisma.contactEnquiry.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!existing) throw new NotFoundException('Contact enquiry not found');

    const fromStatus = handled ? 'new' : 'handled';
    if (existing.status !== fromStatus) {
      return this.getById(id);
    }

    await this.prisma.$transaction(async (tx) => {
      // Conditional on the current status so two admins racing write one change and one audit row.
      const { count } = await tx.contactEnquiry.updateMany({
        where: { id, status: fromStatus },
        data: handled
          ? { status: 'handled', handledAt: new Date(), handledByAdminId: adminId }
          : { status: 'new', handledAt: null, handledByAdminId: null },
      });
      if (count === 0) return;
      await tx.adminActionLog.create({
        data: {
          adminId,
          action: handled ? ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_HANDLED : ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_REOPENED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.CONTACT_ENQUIRY,
          targetId: id,
          notes: null,
        },
      });
    });

    return this.getById(id);
  }

  /**
   * POST :id/escalate. One transaction: create the Report, link the enquiry, write the audit row.
   * Order of refusals follows the moderation module: 404, then the child-safety-vetting gate (only when the admin
   * says the enquiry concerns a minor), then the 409 for an enquiry already escalated.
   */
  async escalate(id: string, adminId: string, dto: EscalateContactEnquiryDto): Promise<EscalationResult> {
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (reason.length < HOLD_REASON_MIN_LENGTH || reason.length > HOLD_REASON_MAX_LENGTH) {
      throw new BadRequestException({
        statusCode: 400,
        code: CONTACT_ENQUIRY_ESCALATION_REASON_INVALID_CODE,
        message: `A reason of ${HOLD_REASON_MIN_LENGTH} to ${HOLD_REASON_MAX_LENGTH} characters is required.`,
      });
    }

    const enquiry = await this.prisma.contactEnquiry.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!enquiry) throw new NotFoundException('Contact enquiry not found');

    if (dto.concernsMinor) {
      await assertAdminChildSafetyVetted(this.prisma, adminId);
    }

    if (enquiry.escalatedReportId) {
      throw this.alreadyEscalated();
    }

    const report = await this.prisma.$transaction(async (tx) => {
      const created = await tx.report.create({
        data: {
          reporterId: null,
          reporterContactName: enquiry.name,
          reporterContactEmail: enquiry.email,
          targetType: ENQUIRY_REPORT_TARGET_TYPE,
          targetId: enquiry.id,
          reason: buildEnquiryReportReason(enquiry.category, enquiry.subject, enquiry.message),
          severity: dto.severity,
          concernsMinor: dto.concernsMinor,
          status: 'open',
        },
        select: { id: true, status: true, severity: true, concernsMinor: true },
      });

      // Guarded on "not escalated yet": a concurrent escalation loses here and the throw rolls back its Report.
      const { count } = await tx.contactEnquiry.updateMany({
        where: { id, escalatedReportId: null },
        data: { escalatedReportId: created.id },
      });
      if (count === 0) throw this.alreadyEscalated();

      await tx.adminActionLog.create({
        data: {
          adminId,
          action: ADMIN_ACTION_LOG_ACTIONS.CONTACT_ENQUIRY_ESCALATED,
          targetType: ADMIN_ACTION_LOG_TARGET_TYPES.CONTACT_ENQUIRY,
          targetId: id,
          notes: `report=${created.id}; severity=${dto.severity}; concernsMinor=${dto.concernsMinor}; reason=${reason}`,
        },
      });
      return created;
    });

    return { enquiry: await this.getById(id), report };
  }

  private alreadyEscalated(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: CONTACT_ENQUIRY_ESCALATED_CODE,
      message: 'This enquiry has already been escalated to a report.',
    });
  }
}
