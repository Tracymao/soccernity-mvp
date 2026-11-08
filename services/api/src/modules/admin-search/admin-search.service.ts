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
import { PostMediaReviewSource } from '../post-media/post-media-review.constants';
import { PUBLIC_NAME_SELECT, toPublicUser } from '../users/public-name.util';
import { AdminModerationController } from '../moderation/admin-moderation.controller';
import { ENQUIRY_REPORT_TARGET_TYPE, REPORT_SOURCE_CONTACT_ENQUIRY } from '../moderation/moderation.constants';
import {
  ADMIN_SEARCH_GROUP_CAP,
  ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
  AdminSearchGroup,
} from './admin-search.constants';
import { escapeLike, matchReasonCategories, parseAdminSearchQuery, ParsedAdminSearchQuery } from './admin-search.query';

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

// What field of the record the typed text matched (backend/b114-search-fields-report-search, Decision Log #464).
// A stable KEY, never English: the admin app owns the labels ("Username (starts with)", "Report ID", ...). One value
// per hit; when several fields would match, the first in the order each type lists below wins.
export type UserMatchedOn = 'user_id' | 'email' | 'username';
export type ReportMatchedOn =
  | 'report_id'
  | 'report_reference'
  | 'reporter_user_id'
  | 'target_user_id'
  | 'target_username'
  | 'reason_category';
export type ContactEnquiryMatchedOn = 'email' | 'subject';
export type ArticleMatchedOn = 'title';
export type StaffMatchedOn = 'email' | 'name';
export type MediaMatchedOn = 'item_id';

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
  // Read only to work out `matchedOn`; stripped before the hit is returned.
  reporterId: true,
  targetType: true,
  targetId: true,
  status: true,
  severity: true,
  concernsMinor: true,
  // B-284: the reason CATEGORY (a fixed key, null when not categorised). Never the free-text reason.
  reasonCategory: true,
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

// totpEnabledAt is read only to derive `twoFactorEnabled` (the secret and the backup codes are never selected).
const STAFF_HIT_SELECT = { id: true, email: true, fullName: true, role: true, accountStatus: true, totpEnabledAt: true } as const;

const MEDIA_HIT_SELECT = {
  id: true,
  kind: true,
  status: true,
  reportCount: true,
  createdAt: true,
  reviewEntrySource: true,
  _count: { select: { reports: true } },
  uploader: { select: { id: true, ...PUBLIC_NAME_SELECT } },
} as const;

export type UserHit = Prisma.UserGetPayload<{ select: typeof USER_HIT_SELECT }> & { matchedOn: UserMatchedOn };
export type ReportHit = Omit<Prisma.ReportGetPayload<{ select: typeof REPORT_HIT_SELECT }>, 'reporterId'> & {
  source: string | null;
  matchedOn: ReportMatchedOn;
};
export type ContactEnquiryHit = Omit<Prisma.ContactEnquiryGetPayload<{ select: typeof ENQUIRY_HIT_SELECT }>, 'userId' | 'escalatedReportId'> & {
  submitter: 'signed_in' | 'guest';
  hasEscalation: boolean;
  matchedOn: ContactEnquiryMatchedOn;
};
export type ArticleHit = Prisma.ArticleGetPayload<{ select: typeof ARTICLE_HIT_SELECT }> & { matchedOn: ArticleMatchedOn };
export type StaffHit = Omit<Prisma.AdminUserGetPayload<{ select: typeof STAFF_HIT_SELECT }>, 'totpEnabledAt'> & {
  twoFactorEnabled: boolean;
  matchedOn: StaffMatchedOn;
};
export type MediaHit = Omit<Prisma.PostMediaGetPayload<{ select: typeof MEDIA_HIT_SELECT }>, 'reviewEntrySource' | '_count' | 'uploader'> & {
  /** Why the item is in the queue, as GET /admin/media-review shows it: the automatic check and/or user reports. */
  sources: PostMediaReviewSource[];
  /** The uploader's PUBLIC name and id (as the review list shows them), never an email or a real name. */
  uploader: { id: string; publicName: string };
  matchedOn: MediaMatchedOn;
};

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
    return capped(
      rows.map((r) => ({
        ...r,
        matchedOn: (r.id === q.lower ? 'user_id' : r.email === q.lower ? 'email' : 'username') as UserMatchedOn,
      })),
    );
  }

  // ---- reports: report id, report reference, or (a user id / a username prefix) the reports by or about that user. ----
  // ... or a reason CATEGORY whose label starts with the typed text (B-284, Decision Log #465).
  // NEVER the free-text reason: Report.reason is the reporter's own description. It is not selected, searched or
  // returned; only the category (a fixed key) is.

  private async searchReports(q: ParsedAdminSearchQuery, vetted: boolean): Promise<SearchGroup<ReportHit>> {
    const or: Prisma.ReportWhereInput[] = [];
    // Users whose content the reports may be ABOUT, with how each was found.
    const subjects = new Map<string, 'target_user_id' | 'target_username'>();
    if (q.isUuid) {
      or.push({ id: q.lower }, { reporterId: q.lower });
      subjects.set(q.lower, 'target_user_id');
    }
    // The short reference an admin sees on screen (first 8 characters of the id). Exactly 8 hex characters, so it
    // cannot be used as a loose id prefix search.
    if (q.isReportReference) or.push({ id: { startsWith: q.lower } });
    if (q.isUsernameShaped) {
      // Same rule as the Users group: username prefix (usernames are stored lowercase). The real name is not searched.
      const users = await this.prisma.user.findMany({
        where: { username: { startsWith: escapeLike(q.lower) }, accountStatus: { not: 'deleted' } },
        select: { id: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
      });
      for (const u of users) if (!subjects.has(u.id)) subjects.set(u.id, 'target_username');
    }
    // B-284: reports whose reason category's label starts with the typed text. Independent of the id / username
    // shapes above, so "hate or" (not username-shaped) still finds hate_or_abusive_language.
    const categories = matchReasonCategories(q.text);
    if (categories.length > 0) or.push({ reasonCategory: { in: categories } });
    if (or.length === 0 && subjects.size === 0) return EMPTY;

    // Report.targetId is a bare string, so "about a user" is: the user, a post they wrote, a comment they wrote, a
    // message they sent (the sender is the reported person). A message is matched by id only: its text and its
    // conversation are never selected.
    // The id lists are bounded; the reports list below is capped anyway.
    const postAuthor = new Map<string, string>();
    const commentAuthor = new Map<string, string>();
    const messageSender = new Map<string, string>();
    if (subjects.size > 0) {
      const authorIds = [...subjects.keys()];
      const [posts, comments, messages] = await Promise.all([
        this.prisma.post.findMany({
          where: { authorId: { in: authorIds } },
          select: { id: true, authorId: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
        }),
        this.prisma.comment.findMany({
          where: { authorId: { in: authorIds } },
          select: { id: true, authorId: true },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
        }),
        // Batched like the comment branch (one query for all matched senders). Deleted-for-everyone messages are
        // still matched: the report about them stays findable. Only the id and the sender are selected.
        this.prisma.message.findMany({
          where: { senderId: { in: authorIds } },
          select: { id: true, senderId: true },
          orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
          take: ADMIN_SEARCH_OWNED_CONTENT_ID_CAP,
        }),
      ]);
      for (const p of posts) postAuthor.set(p.id, p.authorId);
      for (const c of comments) commentAuthor.set(c.id, c.authorId);
      for (const m of messages) messageSender.set(m.id, m.senderId);
      or.push({ targetType: 'user', targetId: { in: authorIds } });
      if (postAuthor.size > 0) or.push({ targetType: 'post', targetId: { in: [...postAuthor.keys()] } });
      if (commentAuthor.size > 0) or.push({ targetType: 'comment', targetId: { in: [...commentAuthor.keys()] } });
      if (messageSender.size > 0) or.push({ targetType: 'message', targetId: { in: [...messageSender.keys()] } });
    }

    // The same gate GET /admin/moderation/reports applies: a report that concerns a minor is for vetted admins only.
    const where: Prisma.ReportWhereInput = vetted ? { OR: or } : { AND: [{ OR: or }, { concernsMinor: false }] };
    const rows = await this.prisma.report.findMany({
      where,
      select: REPORT_HIT_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ADMIN_SEARCH_GROUP_CAP + 1,
    });
    return capped(
      rows.map(({ reporterId, ...r }) => {
        let matchedOn: ReportMatchedOn;
        const aboutUser =
          r.targetType === 'user'
            ? r.targetId
            : r.targetType === 'post'
              ? postAuthor.get(r.targetId)
              : r.targetType === 'comment'
                ? commentAuthor.get(r.targetId)
                : r.targetType === 'message'
                  ? messageSender.get(r.targetId)
                  : undefined;
        if (r.id === q.lower) matchedOn = 'report_id';
        else if (q.isReportReference && r.id.startsWith(q.lower)) matchedOn = 'report_reference';
        else if (reporterId !== null && reporterId === q.lower) matchedOn = 'reporter_user_id';
        else if (aboutUser !== undefined && subjects.get(aboutUser)) matchedOn = subjects.get(aboutUser)!;
        else if (r.reasonCategory !== null && (categories as string[]).includes(r.reasonCategory)) matchedOn = 'reason_category';
        else matchedOn = 'target_user_id';
        return { ...r, source: r.targetType === ENQUIRY_REPORT_TARGET_TYPE ? REPORT_SOURCE_CONTACT_ENQUIRY : null, matchedOn };
      }),
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
        matchedOn: (q.isEmail && rest.email.toLowerCase() === q.lower ? 'email' : 'subject') as ContactEnquiryMatchedOn,
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
    return capped(rows.map((r) => ({ ...r, matchedOn: 'title' as const })));
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
    return capped(
      rows.map(({ totpEnabledAt, ...r }) => ({
        ...r,
        twoFactorEnabled: Boolean(totpEnabledAt),
        matchedOn: (q.isEmail && r.email.toLowerCase() === q.lower ? 'email' : 'name') as StaffMatchedOn,
      })),
    );
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
    return capped(
      rows.map(({ reviewEntrySource, _count, uploader, ...r }) => {
        // Same derivation as GET /admin/media-review (toItem): why the item is in the queue.
        const sources: PostMediaReviewSource[] = [];
        if (reviewEntrySource === 'auto_check') sources.push('auto_check');
        if (reviewEntrySource === 'user_report' || _count.reports > 0) sources.push('user_report');
        return { ...r, sources, uploader: toPublicUser(uploader), matchedOn: 'item_id' as const };
      }),
    );
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
