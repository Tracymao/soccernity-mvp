import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ADMIN_ROLES_KEY } from '../admin/guards/admin-roles.decorator';
import { AdminActionLogService } from '../admin-action-log/admin-action-log.service';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminArticlesController } from '../admin-content/admin-articles.controller';
import { AdminMediaReviewController } from '../admin-media-review/admin-media-review.controller';
import { AdminStaffRolesController } from '../admin-staff-roles/admin-staff-roles.controller';
import { ContactEnquiryAdminController } from '../contact/contact-enquiry-admin.controller';
import { isAdminChildSafetyVetted } from '../moderation/child-safety-vetting.util';
import { AdminModerationController } from '../moderation/admin-moderation.controller';
import { ENQUIRY_REPORT_TARGET_TYPE, REPORT_SOURCE_CONTACT_ENQUIRY } from '../moderation/moderation.constants';
import {
  ADMIN_SEARCH_GROUP_CAP,
  ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
  AdminSearchGroup,
} from './admin-search.constants';
import { escapeLike, parseAdminSearchQuery, ParsedAdminSearchQuery } from './admin-search.query';

// ---------------------------------------------------------------------------------------------------------------
// GET /admin/search (backend/b114-admin-search; B-114, founder decision of 2026-11-02, Decision Log #463).
//
// ONE read-only route. It adds NO new data access rule of its own: for each group it applies the rule the matching
// admin LIST route already applies, and returns no more than that list shows.
//
//   Role rule    READ from the section's own controller metadata (the same @AdminRoles value AdminRolesGuard reads,
//                list handler first, then the class), not copied. A group the caller's role cannot open is ABSENT
//                from the response (the key does not exist), which is different from a group with no matches (the
//                key exists, items []).
//   Vetting      reports (concernsMinor) and media (a minor's items) are left out for an admin who is not
//                child-safety vetted, exactly as GET /admin/moderation/reports and GET /admin/media-review leave
//                them out. One fresh read, taken only if one of those two groups is searched.
//   Never        date of birth, guardian emails, message or post text, and ANYTHING from GuardianNoticeWithhold:
//                this file does not read that table, so the response is byte-for-byte what it would be if the flag
//                did not exist.
//   Matching     Prisma only, no raw SQL. Emails are matched EXACTLY (never as a prefix or a substring), so the bar
//                cannot be used to enumerate addresses. LIKE wildcards in the typed text are escaped.
//   Audit        see recordEmailSearch: one row, the kind and the count, never the text.
// ---------------------------------------------------------------------------------------------------------------

export interface SearchGroup<T> {
  items: T[];
  /** More matches exist than ADMIN_SEARCH_GROUP_CAP. The extra row is read to know this and is never returned. */
  truncated: boolean;
}

// What the Users list shows (admin-users.service USER_LIST_SELECT), and nothing else.
const USER_HIT_SELECT = {
  id: true,
  displayName: true,
  username: true,
  email: true,
  accountStatus: true,
  createdAt: true,
} as const;

const REPORT_HIT_SELECT = {
  id: true,
  targetType: true,
  targetId: true,
  status: true,
  severity: true,
  concernsMinor: true,
  createdAt: true,
} as const;

// What the Contact enquiries inbox list shows; never the message.
const ENQUIRY_HIT_SELECT = {
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

const ARTICLE_HIT_SELECT = {
  id: true,
  title: true,
  status: true,
  category: { select: { id: true, name: true } },
  publishedAt: true,
  createdAt: true,
} as const;

const STAFF_HIT_SELECT = { id: true, email: true, fullName: true, role: true, accountStatus: true } as const;

const MEDIA_HIT_SELECT = { id: true, kind: true, status: true, reportCount: true, createdAt: true } as const;

export type UserHit = Prisma.UserGetPayload<{ select: typeof USER_HIT_SELECT }>;
export type ReportHit = Prisma.ReportGetPayload<{ select: typeof REPORT_HIT_SELECT }> & { source: string | null };
export type ContactEnquiryHit = Omit<Prisma.ContactEnquiryGetPayload<{ select: typeof ENQUIRY_HIT_SELECT }>, 'userId' | 'escalatedReportId'> & {
  submitter: 'signed_in' | 'guest';
  hasEscalation: boolean;
};
export type ArticleHit = Prisma.ArticleGetPayload<{ select: typeof ARTICLE_HIT_SELECT }>;
export type StaffHit = Prisma.AdminUserGetPayload<{ select: typeof STAFF_HIT_SELECT }>;
export type MediaHit = Prisma.PostMediaGetPayload<{ select: typeof MEDIA_HIT_SELECT }>;

export interface AdminSearchResult {
  groups: {
    users?: SearchGroup<UserHit>;
    reports?: SearchGroup<ReportHit>;
    contactEnquiries?: SearchGroup<ContactEnquiryHit>;
    articles?: SearchGroup<ArticleHit>;
    staff?: SearchGroup<StaffHit>;
    media?: SearchGroup<MediaHit>;
  };
}

type ControllerClass = abstract new (...args: never[]) => unknown;

// Group -> the controller class and LIST handler whose role rule applies. The role rule is read from them.
const GROUP_SOURCES: Record<AdminSearchGroup, { controller: ControllerClass; handler: string }> = {
  users: { controller: AdminUsersController, handler: 'list' },
  reports: { controller: AdminModerationController, handler: 'list' },
  contactEnquiries: { controller: ContactEnquiryAdminController, handler: 'list' },
  articles: { controller: AdminArticlesController, handler: 'list' },
  staff: { controller: AdminStaffRolesController, handler: 'list' },
  media: { controller: AdminMediaReviewController, handler: 'list' },
};

function capped<T>(rows: T[]): SearchGroup<T> {
  const truncated = rows.length > ADMIN_SEARCH_GROUP_CAP;
  return { items: truncated ? rows.slice(0, ADMIN_SEARCH_GROUP_CAP) : rows, truncated };
}

const EMPTY: SearchGroup<never> = { items: [], truncated: false };

@Injectable()
export class AdminSearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly actionLog: AdminActionLogService,
  ) {}

  /** The roles that may open a group, read from the section's own list route. Empty/absent = any admin (the guard's default). */
  rolesForGroup(group: AdminSearchGroup): string[] | undefined {
    const { controller, handler } = GROUP_SOURCES[group];
    return this.reflector.getAllAndOverride<string[] | undefined>(ADMIN_ROLES_KEY, [
      (controller.prototype as Record<string, unknown>)[handler] as never,
      controller as never,
    ]);
  }

  mayOpen(group: AdminSearchGroup, role: string | undefined): boolean {
    const required = this.rolesForGroup(group);
    if (!required || required.length === 0) return true;
    return Boolean(role) && required.includes(role as string);
  }

  async search(rawQuery: string | undefined, admin: { sub: string; role: string }): Promise<AdminSearchResult> {
    const q = parseAdminSearchQuery(rawQuery);
    const groups: AdminSearchResult['groups'] = {};

    // The vetting read is needed only by the two groups that hide a minor's items, and only once.
    let vetted: boolean | undefined;
    const isVetted = async (): Promise<boolean> => (vetted ??= await isAdminChildSafetyVetted(this.prisma, admin.sub));

    if (this.mayOpen('users', admin.role)) groups.users = await this.searchUsers(q);
    if (this.mayOpen('reports', admin.role)) groups.reports = await this.searchReports(q, await isVetted());
    if (this.mayOpen('contactEnquiries', admin.role)) groups.contactEnquiries = await this.searchEnquiries(q);
    if (this.mayOpen('articles', admin.role)) groups.articles = await this.searchArticles(q);
    if (this.mayOpen('staff', admin.role)) groups.staff = await this.searchStaff(q);
    if (this.mayOpen('media', admin.role)) groups.media = await this.searchMedia(q, await isVetted());

    await this.recordEmailSearch(q, admin.sub, groups);
    return { groups };
  }

  // ---- users: exact email, username PREFIX, user id. An anonymised account ('deleted') is found by id only. -------

  private async searchUsers(q: ParsedAdminSearchQuery): Promise<SearchGroup<UserHit>> {
    const or: Prisma.UserWhereInput[] = [];
    if (q.isUuid) or.push({ id: q.lower });
    // User.email is stored lowercase (Decision Log #16), so an exact match on the lowercased text uses the unique index.
    if (q.isEmail) or.push({ email: q.lower, accountStatus: { not: 'deleted' } });
    if (q.isUsernameShaped) or.push({ username: { startsWith: escapeLike(q.lower) }, accountStatus: { not: 'deleted' } });
    if (or.length === 0) return EMPTY;
    const rows = await this.prisma.user.findMany({
      where: { OR: or },
      select: USER_HIT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(rows);
  }

  // ---- reports: the report id, or (given a user id) the reports by or about that user. -----------------------------

  private async searchReports(q: ParsedAdminSearchQuery, vetted: boolean): Promise<SearchGroup<ReportHit>> {
    if (!q.isUuid) return EMPTY;
    // Report.targetId is a bare string, so "about a user" is: the user, a post they wrote, a comment they wrote.
    // The two id lists are bounded; the reports list below is capped anyway.
    const [posts, comments] = await Promise.all([
      this.prisma.post.findMany({
        where: { authorId: q.lower },
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
      }),
      this.prisma.comment.findMany({
        where: { authorId: q.lower },
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
      }),
    ]);
    const or: Prisma.ReportWhereInput[] = [{ id: q.lower }, { reporterId: q.lower }, { targetType: 'user', targetId: q.lower }];
    if (posts.length > 0) or.push({ targetType: 'post', targetId: { in: posts.map((p) => p.id) } });
    if (comments.length > 0) or.push({ targetType: 'comment', targetId: { in: comments.map((c) => c.id) } });

    // The same gate GET /admin/moderation/reports applies: a report that concerns a minor is for vetted admins only.
    const where: Prisma.ReportWhereInput = vetted ? { OR: or } : { AND: [{ OR: or }, { concernsMinor: false }] };
    const rows = await this.prisma.report.findMany({
      where,
      select: REPORT_HIT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(
      rows.map((r) => ({ ...r, source: r.targetType === ENQUIRY_REPORT_TARGET_TYPE ? REPORT_SOURCE_CONTACT_ENQUIRY : null })),
    );
  }

  // ---- contact enquiries: the sender's exact email, or the subject contains the text. Never the message. ------------

  private async searchEnquiries(q: ParsedAdminSearchQuery): Promise<SearchGroup<ContactEnquiryHit>> {
    const or: Prisma.ContactEnquiryWhereInput[] = [{ subject: { contains: escapeLike(q.text), mode: 'insensitive' } }];
    if (q.isEmail) or.push({ email: { equals: q.text, mode: 'insensitive' } });
    const rows = await this.prisma.contactEnquiry.findMany({
      where: { OR: or },
      select: ENQUIRY_HIT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(
      rows.map(({ userId, escalatedReportId, ...rest }) => ({
        ...rest,
        submitter: userId ? ('signed_in' as const) : ('guest' as const),
        hasEscalation: escalatedReportId !== null,
      })),
    );
  }

  // ---- articles: title contains. -------------------------------------------------------------------------------

  private async searchArticles(q: ParsedAdminSearchQuery): Promise<SearchGroup<ArticleHit>> {
    const rows = await this.prisma.article.findMany({
      where: { title: { contains: escapeLike(q.text), mode: 'insensitive' } },
      select: ARTICLE_HIT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(rows);
  }

  // ---- staff: name contains, or exact email. Superadmin only (the staff routes' own rule). -----------------------

  private async searchStaff(q: ParsedAdminSearchQuery): Promise<SearchGroup<StaffHit>> {
    const or: Prisma.AdminUserWhereInput[] = [{ fullName: { contains: escapeLike(q.text), mode: 'insensitive' } }];
    if (q.isEmail) or.push({ email: { equals: q.text, mode: 'insensitive' } });
    const rows = await this.prisma.adminUser.findMany({
      where: { OR: or },
      select: STAFF_HIT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(rows);
  }

  // ---- media review items: the item id. Same visibility as GET /admin/media-review/:id. -------------------------

  private async searchMedia(q: ParsedAdminSearchQuery, vetted: boolean): Promise<SearchGroup<MediaHit>> {
    if (!q.isUuid) return EMPTY;
    const conditions: Prisma.PostMediaWhereInput[] = [
      { id: q.lower, uploadState: 'ready' },
      // Only items that have been through the queue: this is not a general browser of everyone's uploads.
      { OR: [{ reviewEnteredAt: { not: null } }, { reportCount: { gt: 0 } }] },
    ];
    if (!vetted) conditions.push({ uploader: { is: { isMinor: false } } });
    const rows = await this.prisma.postMedia.findMany({
      where: { AND: conditions },
      select: MEDIA_HIT_SELECT,
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(rows);
  }

  // ---- audit ---------------------------------------------------------------------------------------------------

  /**
   * A search whose text contains an '@' (it may be an email address, or part of one: personal data either way)
   * writes ONE AdminActionLog row. It records THAT a search of this kind happened and how many results it
   * returned, summed over the groups the caller can open. It never records the text typed. A failed write
   * propagates (AdminActionLogService's own rule: an audit failure is not swallowed).
   */
  private async recordEmailSearch(q: ParsedAdminSearchQuery, adminId: string, groups: AdminSearchResult['groups']): Promise<void> {
    if (!q.containsAt) return;
    const results = Object.values(groups).reduce((n, g) => n + (g?.items.length ?? 0), 0);
    await this.actionLog.record(
      adminId,
      ADMIN_ACTION_LOG_ACTIONS.ADMIN_SEARCH_PERFORMED,
      ADMIN_ACTION_LOG_TARGET_TYPES.SEARCH,
      'email',
      `kind=email results=${results}`,
    );
  }
}
