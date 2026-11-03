import { Reflector } from '@nestjs/core';
import { ADMIN_ROLES_KEY } from '../admin/guards/admin-roles.decorator';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../admin-action-log/admin-action-log.constants';
import { ADMIN_USERS_DEFAULT_PAGE_SIZE } from '../admin-users/admin-users.constants';
import { AdminUsersController } from '../admin-users/admin-users.controller';
import { AdminArticlesController } from '../admin-content/admin-articles.controller';
import { AdminMediaReviewController } from '../admin-media-review/admin-media-review.controller';
import { AdminStaffRolesController } from '../admin-staff-roles/admin-staff-roles.controller';
import { ContactEnquiryAdminController } from '../contact/contact-enquiry-admin.controller';
import { AdminModerationController } from '../moderation/admin-moderation.controller';
import { ADMIN_SEARCH_GROUP_CAP, ADMIN_SEARCH_GROUPS } from './admin-search.constants';
import { AdminSearchService } from './admin-search.service';

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

// A fake Prisma that knows ONLY the models the search is allowed to read. Touching any other model (for example
// guardianNoticeWithhold or guardian) throws, so "this module never reads the withhold flag" is a failing test
// rather than a code comment.
function buildPrisma(opts: { vetted?: boolean; rows?: Partial<Record<string, unknown[]>> } = {}) {
  const rows = opts.rows ?? {};
  const model = (name: string) => ({ findMany: jest.fn().mockResolvedValue(rows[name] ?? []) });
  const models: Record<string, unknown> = {
    user: model('user'),
    report: model('report'),
    contactEnquiry: model('contactEnquiry'),
    article: model('article'),
    adminUser: { ...model('adminUser'), findUnique: jest.fn().mockResolvedValue({ childSafetyVetted: opts.vetted ?? false }) },
    postMedia: model('postMedia'),
    post: model('post'),
    comment: model('comment'),
  };
  const prisma = new Proxy(models, {
    get(target, prop: string) {
      if (!(prop in target)) throw new Error(`admin search touched an unexpected model: ${String(prop)}`);
      return target[prop];
    },
  });
  return { prisma: prisma as never, models: models as Record<string, { findMany: jest.Mock; findUnique?: jest.Mock }> };
}

function build(opts: Parameters<typeof buildPrisma>[0] = {}) {
  const { prisma, models } = buildPrisma(opts);
  const actionLog = { record: jest.fn().mockResolvedValue({}) };
  const service = new AdminSearchService(prisma, new Reflector(), actionLog as never);
  return { service, models, actionLog };
}

const admin = (role: string) => ({ sub: 'admin-1', role });

describe('AdminSearchService: which groups a role gets', () => {
  const SOURCES = {
    users: AdminUsersController,
    reports: AdminModerationController,
    contactEnquiries: ContactEnquiryAdminController,
    articles: AdminArticlesController,
    staff: AdminStaffRolesController,
    media: AdminMediaReviewController,
  } as const;

  it('reads each group role rule from the section own controller, not from a copy', () => {
    const { service } = build();
    for (const group of ADMIN_SEARCH_GROUPS) {
      expect(service.rolesForGroup(group)).toEqual(Reflect.getMetadata(ADMIN_ROLES_KEY, SOURCES[group]));
    }
  });

  const expected: Record<string, string[]> = {
    editor: ['articles'],
    moderator: ['users', 'reports', 'contactEnquiries', 'media'],
    superadmin: ['users', 'reports', 'contactEnquiries', 'articles', 'staff', 'media'],
  };

  it.each(Object.entries(expected))('a %s gets exactly its groups, and the other groups are ABSENT (not empty)', async (role, groups) => {
    const { service } = build();
    const res = await service.search(UUID, admin(role));
    expect(Object.keys(res.groups).sort()).toEqual([...groups].sort());
    for (const g of ADMIN_SEARCH_GROUPS) {
      if (!groups.includes(g)) expect(g in res.groups).toBe(false);
    }
  });

  it('an unknown role gets no group at all', async () => {
    const { service } = build();
    expect((await service.search(UUID, admin('visitor'))).groups).toEqual({});
  });

  it('does not query a model for a group the role cannot open', async () => {
    const { service, models } = build();
    await service.search(UUID, admin('editor'));
    for (const m of ['user', 'report', 'contactEnquiry', 'adminUser', 'postMedia', 'post', 'comment']) {
      expect(models[m].findMany).not.toHaveBeenCalled();
    }
    expect(models.adminUser.findUnique).not.toHaveBeenCalled(); // no vetting read either
  });
});

describe('AdminSearchService: vetting and reads', () => {
  it('reads the vetting flag once, fresh, and only when reports or media are searched', async () => {
    const { service, models } = build({ vetted: true });
    await service.search(UUID, admin('moderator'));
    expect(models.adminUser.findUnique).toHaveBeenCalledTimes(1);
    expect(models.adminUser.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { childSafetyVetted: true } });
  });

  it('hides a concernsMinor report and a minor uploader item from an admin who is not vetted', async () => {
    const { service, models } = build({ vetted: false });
    await service.search(UUID, admin('moderator'));
    expect(models.report.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ OR: expect.any(Array) }, { concernsMinor: false }],
    });
    const mediaWhere = models.postMedia.findMany.mock.calls[0][0].where.AND;
    expect(mediaWhere).toContainEqual({ uploader: { is: { isMinor: false } } });
  });

  it('does not add those conditions for a vetted admin', async () => {
    const { service, models } = build({ vetted: true });
    await service.search(UUID, admin('superadmin'));
    expect(models.report.findMany.mock.calls[0][0].where).toEqual({ OR: expect.any(Array) });
    const mediaWhere = models.postMedia.findMany.mock.calls[0][0].where.AND;
    expect(mediaWhere).not.toContainEqual({ uploader: { is: { isMinor: false } } });
  });

  it('never touches a withhold or guardian model (the fake throws if it does), for a vetted or unvetted admin', async () => {
    for (const vetted of [true, false]) {
      const { service } = build({ vetted });
      await expect(service.search('someone@example.com', admin('superadmin'))).resolves.toBeDefined();
      await expect(service.search(UUID, admin('superadmin'))).resolves.toBeDefined();
    }
  });

  it('a withheld minor looks the same to a vetted and an unvetted admin: identical user group, identical request', async () => {
    const minor = { id: UUID, displayName: 'Young Player', username: 'young_p', email: 'young@example.com', accountStatus: 'active', createdAt: new Date('2026-01-01') };
    const vettedRun = build({ vetted: true, rows: { user: [minor] } });
    const unvettedRun = build({ vetted: false, rows: { user: [minor] } });
    const a = await vettedRun.service.search(UUID, admin('moderator'));
    const b = await unvettedRun.service.search(UUID, admin('moderator'));
    expect(JSON.stringify(a.groups.users)).toBe(JSON.stringify(b.groups.users));
    expect(vettedRun.models.user.findMany.mock.calls[0][0]).toEqual(unvettedRun.models.user.findMany.mock.calls[0][0]);
  });
});

describe('AdminSearchService: what is asked of the database', () => {
  it('users: id, exact lowercased email and a username PREFIX, never a substring; an anonymised account only by id', async () => {
    const { service, models } = build();
    await service.search('Temi_X@Example.com', admin('moderator'));
    const where = models.user.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ email: 'temi_x@example.com', accountStatus: { not: 'deleted' } });
    // not username-shaped (it has an @), so no username matcher and no id matcher
    expect(where.OR).toHaveLength(1);

    const second = build();
    await second.service.search('Nelson_Ih', admin('moderator'));
    expect(second.models.user.findMany.mock.calls[0][0].where.OR).toEqual([
      { username: { startsWith: 'nelson\\_ih' }, accountStatus: { not: 'deleted' } },
    ]);

    const third = build();
    await third.service.search(UUID.toUpperCase(), admin('moderator'));
    expect(third.models.user.findMany.mock.calls[0][0].where.OR).toEqual([{ id: UUID }]);
  });

  it('users: a query that fits no matcher makes no database call', async () => {
    const { service, models } = build();
    await service.search('two words', admin('moderator'));
    expect(models.user.findMany).not.toHaveBeenCalled();
  });

  it('contact enquiries: subject contains (escaped, case-insensitive) and the sender email EXACT; never a prefix', async () => {
    const { service, models } = build();
    await service.search('50%_off@x.io', admin('moderator'));
    const or = models.contactEnquiry.findMany.mock.calls[0][0].where.OR;
    expect(or).toContainEqual({ subject: { contains: '50\\%\\_off@x.io', mode: 'insensitive' } });
    expect(or).toContainEqual({ email: { equals: '50%_off@x.io', mode: 'insensitive' } });
  });

  it('articles and staff: title / name contains is escaped', async () => {
    const { service, models } = build();
    await service.search('100%_club', admin('superadmin'));
    expect(models.article.findMany.mock.calls[0][0].where).toEqual({ title: { contains: '100\\%\\_club', mode: 'insensitive' } });
    expect(models.adminUser.findMany.mock.calls[0][0].where.OR).toEqual([{ fullName: { contains: '100\\%\\_club', mode: 'insensitive' } }]);
  });

  it('reports: a user id also finds the reports by or about that user, through bounded id lists', async () => {
    const { service, models } = build({ vetted: true, rows: { post: [{ id: 'p1', authorId: UUID }], comment: [{ id: 'c1', authorId: UUID }] } });
    await service.search(UUID, admin('moderator'));
    const or = models.report.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual([
      { id: UUID },
      { reporterId: UUID },
      { targetType: 'user', targetId: { in: [UUID] } },
      { targetType: 'post', targetId: { in: ['p1'] } },
      { targetType: 'comment', targetId: { in: ['c1'] } },
    ]);
    expect(models.post.findMany.mock.calls[0][0].take).toBe(200);
    expect(models.post.findMany.mock.calls[0][0].where).toEqual({ authorId: { in: [UUID] } });
  });

  it('reports and media: a query that is not an id makes no report or media call', async () => {
    const { service, models } = build();
    const res = await service.search('not an id', admin('moderator'));
    expect(models.report.findMany).not.toHaveBeenCalled();
    expect(models.postMedia.findMany).not.toHaveBeenCalled();
    expect(res.groups.reports).toEqual({ items: [], truncated: false });
    expect(res.groups.media).toEqual({ items: [], truncated: false });
  });

  it('every group selects only its pinned keys (no date of birth, message, guardian or flag field can be selected)', async () => {
    const { service, models } = build({ vetted: true });
    await service.search(UUID, admin('superadmin'));
    const keys = (m: string) => Object.keys(models[m].findMany.mock.calls[0][0].select).sort();
    expect(keys('user')).toEqual(['accountStatus', 'createdAt', 'displayName', 'email', 'id', 'username']);
    // reporterId is selected only to work out matchedOn; the returned-keys test below proves it is stripped.
    // There is NO `reason` here: the free-text report description is never selected.
    expect(keys('report')).toEqual(['concernsMinor', 'createdAt', 'id', 'reasonCategory', 'reporterId', 'severity', 'status', 'targetId', 'targetType']);
    expect(keys('report')).not.toContain('reason');
    expect(keys('postMedia')).toEqual(['_count', 'createdAt', 'id', 'kind', 'reportCount', 'reviewEntrySource', 'status', 'uploader']);
    expect(Object.keys(models.postMedia.findMany.mock.calls[0][0].select.uploader.select).sort()).toEqual(['displayName', 'id', 'username']);
    const e = build();
    await e.service.search('hello world', admin('superadmin'));
    expect(Object.keys(e.models.contactEnquiry.findMany.mock.calls[0][0].select)).not.toContain('message');
    expect(Object.keys(e.models.article.findMany.mock.calls[0][0].select)).not.toContain('body');
    // totpEnabledAt only to derive the boolean; never the secret or backup codes.
    expect(Object.keys(e.models.adminUser.findMany.mock.calls[0][0].select).sort()).toEqual(['accountStatus', 'email', 'fullName', 'id', 'role', 'totpEnabledAt']);
  });
});

describe('AdminSearchService: caps', () => {
  it('the per-group cap is tied to the existing default page size', () => {
    expect(ADMIN_SEARCH_GROUP_CAP).toBe(ADMIN_USERS_DEFAULT_PAGE_SIZE);
  });

  it('reads one row more than the cap, returns the cap and says truncated; never returns the extra row', async () => {
    const many = Array.from({ length: ADMIN_SEARCH_GROUP_CAP + 1 }, (_, i) => ({ id: `u${i}`, displayName: 'x', username: null, email: `u${i}@x.io`, accountStatus: 'active', createdAt: new Date() }));
    const { service, models } = build({ rows: { user: many } });
    const res = await service.search(UUID, admin('moderator'));
    expect(models.user.findMany.mock.calls[0][0].take).toBe(ADMIN_SEARCH_GROUP_CAP + 1);
    expect(res.groups.users?.items).toHaveLength(ADMIN_SEARCH_GROUP_CAP);
    expect(res.groups.users?.truncated).toBe(true);
  });

  it('exactly the cap is not truncated', async () => {
    const exact = Array.from({ length: ADMIN_SEARCH_GROUP_CAP }, (_, i) => ({ id: `u${i}` }));
    const { service } = build({ rows: { user: exact } });
    expect((await service.search(UUID, admin('moderator'))).groups.users?.truncated).toBe(false);
  });
});

describe('AdminSearchService: the audit row', () => {
  it('writes no row for a search with no @', async () => {
    const { service, actionLog } = build();
    await service.search('nelson', admin('superadmin'));
    expect(actionLog.record).not.toHaveBeenCalled();
  });

  it('writes exactly one row for an email-shaped search: the kind and the count, never the text', async () => {
    const typed = 'secret.person@example.com';
    const enq = (id: string) => ({ id, name: 'N', email: 'secret.person@example.com', subject: 's', userId: null, escalatedReportId: null });
    const { service, actionLog } = build({ rows: { user: [{ id: 'u1' }], contactEnquiry: [enq('e1'), enq('e2')] } });
    await service.search(typed, admin('moderator'));
    expect(actionLog.record).toHaveBeenCalledTimes(1);
    const args = actionLog.record.mock.calls[0] as unknown[];
    expect(args).toEqual(['admin-1', ADMIN_ACTION_LOG_ACTIONS.ADMIN_SEARCH_PERFORMED, ADMIN_ACTION_LOG_TARGET_TYPES.SEARCH, 'email', 'kind=email results=3']);
    for (const a of args) expect(String(a)).not.toContain('secret');
  });

  it('a half-typed address is audited too', async () => {
    const { service, actionLog } = build();
    await service.search('temi@', admin('editor'));
    expect(actionLog.record).toHaveBeenCalledTimes(1);
  });

  it('propagates an audit failure rather than returning results unaudited', async () => {
    const { service, actionLog } = build();
    actionLog.record.mockRejectedValueOnce(new Error('audit down'));
    await expect(service.search('a@b.io', admin('superadmin'))).rejects.toThrow('audit down');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// backend/b114-search-fields-report-search (Decision Log #464): matchedOn, the new columns, the new report matchers.
// ---------------------------------------------------------------------------------------------------------------------

const USER_ROW = {
  id: UUID,
  displayName: 'Nelson I',
  username: 'nelson_iheagwam',
  email: 'nelson@example.com',
  accountStatus: 'active',
  createdAt: new Date('2026-01-01'),
};
const REPORT_ID = '9a1b2c3d-1111-4222-8333-444455556666';
const reportRow = (over: Record<string, unknown> = {}) => ({
  id: REPORT_ID,
  reporterId: null,
  targetType: 'post',
  targetId: 'p1',
  status: 'open',
  severity: 'medium',
  concernsMinor: false,
  reasonCategory: null,
  createdAt: new Date('2026-02-01'),
  ...over,
});
const mediaRow = (over: Record<string, unknown> = {}) => ({
  id: UUID,
  kind: 'image',
  status: 'pending',
  reportCount: 0,
  createdAt: new Date('2026-03-01'),
  reviewEntrySource: 'auto_check',
  _count: { reports: 0 },
  uploader: { id: 'u9', username: 'amaka_fc', displayName: 'Amaka Real Name' },
  ...over,
});

describe('AdminSearchService: matchedOn (a key per hit, which field matched)', () => {
  it('users: user_id, email or username, in that order', async () => {
    const byId = build({ rows: { user: [USER_ROW] } });
    expect((await byId.service.search(UUID, admin('moderator'))).groups.users?.items[0].matchedOn).toBe('user_id');
    const byEmail = build({ rows: { user: [USER_ROW] } });
    expect((await byEmail.service.search('Nelson@Example.com', admin('moderator'))).groups.users?.items[0].matchedOn).toBe('email');
    const byName = build({ rows: { user: [USER_ROW] } });
    expect((await byName.service.search('nelson_ih', admin('moderator'))).groups.users?.items[0].matchedOn).toBe('username');
  });

  it('contact enquiries: email when the whole address equals the sender, otherwise subject (case-insensitive)', async () => {
    const row = {
      id: 'e1',
      name: 'Tunde',
      email: 'Tunde@Example.com',
      category: 'data',
      subject: 'Wrong fixture time',
      status: 'new',
      createdAt: new Date(),
      lastMessageAt: new Date(),
      handledAt: null,
      handledByAdminId: null,
      userId: null,
      escalatedReportId: null,
    };
    const byEmail = build({ rows: { contactEnquiry: [row] } });
    expect((await byEmail.service.search('tunde@example.com', admin('moderator'))).groups.contactEnquiries?.items[0].matchedOn).toBe('email');
    const bySubject = build({ rows: { contactEnquiry: [row] } });
    expect((await bySubject.service.search('fixture time', admin('moderator'))).groups.contactEnquiries?.items[0].matchedOn).toBe('subject');
  });

  it('articles: title. staff: email when the whole address equals, otherwise name. media: item_id', async () => {
    const art = build({
      rows: { article: [{ id: 'a1', title: 'Zaha double', status: 'published', category: null, publishedAt: null, createdAt: new Date() }] },
    });
    expect((await art.service.search('zaha', admin('editor'))).groups.articles?.items[0].matchedOn).toBe('title');
    const staff = { id: 's1', email: 'Amara@Soccernity.com', fullName: 'Amara Okafor', role: 'moderator', accountStatus: 'active', totpEnabledAt: null };
    const byEmail = build({ rows: { adminUser: [staff] } });
    expect((await byEmail.service.search('amara@soccernity.com', admin('superadmin'))).groups.staff?.items[0].matchedOn).toBe('email');
    const byName = build({ rows: { adminUser: [staff] } });
    expect((await byName.service.search('amara', admin('superadmin'))).groups.staff?.items[0].matchedOn).toBe('name');
    const media = build({ vetted: true, rows: { postMedia: [mediaRow()] } });
    expect((await media.service.search(UUID, admin('moderator'))).groups.media?.items[0].matchedOn).toBe('item_id');
  });
});

describe('AdminSearchService: reports (matchers and fields)', () => {
  it('matches a report reference: exactly 8 hex characters as an id prefix; 7 or 9 characters do not', async () => {
    const { service, models } = build({ vetted: true, rows: { report: [reportRow()] } });
    const res = await service.search('9A1B2C3D', admin('moderator'));
    expect(models.report.findMany.mock.calls[0][0].where.OR).toContainEqual({ id: { startsWith: '9a1b2c3d' } });
    expect(res.groups.reports?.items[0].matchedOn).toBe('report_reference');
    const seven = build({ vetted: true });
    await seven.service.search('9a1b2c3', admin('moderator'));
    const sevenOr = (seven.models.report.findMany.mock.calls[0]?.[0].where.OR ?? []) as unknown[];
    expect(sevenOr).not.toContainEqual({ id: { startsWith: '9a1b2c3' } });
    const nine = build({ vetted: true });
    await nine.service.search('9a1b2c3de', admin('moderator'));
    const nineOr = (nine.models.report.findMany.mock.calls[0]?.[0].where.OR ?? []) as unknown[];
    expect(nineOr).not.toContainEqual({ id: { startsWith: '9a1b2c3de' } });
  });

  it('matches a report whose target is a user with that username prefix (escaped), and one on that user post', async () => {
    const { service, models } = build({
      vetted: true,
      rows: {
        user: [{ id: 'user-k' }],
        post: [{ id: 'p1', authorId: 'user-k' }],
        report: [
          reportRow({ targetType: 'user', targetId: 'user-k', id: 'r-user' }),
          reportRow({ targetType: 'post', targetId: 'p1', id: 'r-post' }),
        ],
      },
    });
    const res = await service.search('nelson_k', admin('moderator'));
    // call 0 is the Users group; call 1 is the report group's target-username lookup
    expect(models.user.findMany.mock.calls[1][0].where).toEqual({ username: { startsWith: 'nelson\\_k' }, accountStatus: { not: 'deleted' } });
    expect(models.report.findMany.mock.calls[0][0].where.OR).toEqual([
      { targetType: 'user', targetId: { in: ['user-k'] } },
      { targetType: 'post', targetId: { in: ['p1'] } },
    ]);
    expect(res.groups.reports?.items.map((r) => r.matchedOn)).toEqual(['target_username', 'target_username']);
  });

  it('a typed underscore is literal in the target-username lookup; a typed percent makes the query non-username-shaped (no lookup)', async () => {
    const a = build({ vetted: true });
    await a.service.search('a_b_c', admin('moderator'));
    expect(a.models.user.findMany.mock.calls[1][0].where.username).toEqual({ startsWith: 'a\\_b\\_c' });
    const b = build({ vetted: true });
    await b.service.search('abc%', admin('moderator'));
    expect(b.models.report.findMany).not.toHaveBeenCalled();
    expect(b.models.user.findMany).not.toHaveBeenCalled();
  });

  it('matchedOn for a user id: report_id, reporter_user_id or target_user_id', async () => {
    const { service } = build({
      vetted: true,
      rows: {
        post: [{ id: 'p1', authorId: UUID }],
        report: [
          reportRow({ id: UUID, targetType: 'user', targetId: 'x' }),
          reportRow({ id: 'r2', reporterId: UUID, targetType: 'user', targetId: 'x' }),
          reportRow({ id: 'r3', targetType: 'post', targetId: 'p1' }),
        ],
      },
    });
    const res = await service.search(UUID, admin('moderator'));
    expect(res.groups.reports?.items.map((r) => r.matchedOn)).toEqual(['report_id', 'reporter_user_id', 'target_user_id']);
  });

  it('never selects, matches or returns the free-text reason, and does not return reporterId', async () => {
    const { service, models } = build({ vetted: true, rows: { report: [reportRow({ reporterId: 'secret-reporter' })] } });
    const res = await service.search('9a1b2c3d', admin('moderator'));
    const call = models.report.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).not.toContain('reason');
    expect(Object.keys(call.select)).not.toContain('reason');
    expect(Object.keys(res.groups.reports!.items[0]).sort()).toEqual([
      'concernsMinor',
      'createdAt',
      'id',
      'matchedOn',
      'reasonCategory',
      'severity',
      'source',
      'status',
      'targetId',
      'targetType',
    ]);
    expect(JSON.stringify(res)).not.toContain('secret-reporter');
  });

  it('B-284: a typed prefix of a category label finds the reports with that category (hit, miss, case, prefix)', async () => {
    const hit = build({ vetted: true, rows: { report: [reportRow({ reasonCategory: 'harassment_or_bullying' })] } });
    const res = await hit.service.search('Harass', admin('moderator'));
    expect(hit.models.report.findMany.mock.calls[0][0].where.OR).toContainEqual({ reasonCategory: { in: ['harassment_or_bullying'] } });
    expect(res.groups.reports?.items[0]).toMatchObject({ reasonCategory: 'harassment_or_bullying', matchedOn: 'reason_category' });

    // A phrase with spaces is not username-shaped and still finds the category.
    const phrase = build({ vetted: true, rows: { report: [reportRow({ reasonCategory: 'hate_or_abusive_language' })] } });
    const phraseRes = await phrase.service.search('hate or abus', admin('moderator'));
    expect(phrase.models.report.findMany.mock.calls[0][0].where.OR).toEqual([{ reasonCategory: { in: ['hate_or_abusive_language'] } }]);
    expect(phraseRes.groups.reports?.items[0].matchedOn).toBe('reason_category');

    // A miss: text that is not a label prefix makes no report call at all.
    const miss = build({ vetted: true });
    await miss.service.search('bullying', admin('moderator'));
    expect(miss.models.report.findMany).not.toHaveBeenCalled();
  });

  it('B-284: the category matcher sits behind the same vetting gate and is audited like any other report query', async () => {
    const { service, models } = build({ vetted: false });
    await service.search('harass', admin('moderator'));
    expect(models.report.findMany.mock.calls[0][0].where).toEqual({
      AND: [{ OR: [{ reasonCategory: { in: ['harassment_or_bullying'] } }] }, { concernsMinor: false }],
    });
  });

  it('B-284: matchedOn prefers an id / user match over the category; a report with no category returns null', async () => {
    const { service } = build({
      vetted: true,
      rows: {
        report: [
          reportRow({ id: UUID, reasonCategory: 'spam_or_scam' }),
          reportRow({ id: 'r2', reasonCategory: null }),
        ],
      },
    });
    const items = (await service.search(UUID, admin('moderator'))).groups.reports!.items;
    expect(items[0]).toMatchObject({ matchedOn: 'report_id', reasonCategory: 'spam_or_scam' });
    expect(items[1].reasonCategory).toBeNull();
  });

  it('B-284: the category search still never selects, matches or returns the free-text reason', async () => {
    const { service, models } = build({ vetted: true, rows: { report: [reportRow({ reasonCategory: 'spam_or_scam' })] } });
    const res = await service.search('spam', admin('moderator'));
    const call = models.report.findMany.mock.calls[0][0];
    expect(JSON.stringify(call.where)).not.toContain('"reason"');
    expect(Object.keys(call.select)).not.toContain('reason');
    expect(Object.keys(res.groups.reports!.items[0])).not.toContain('reason');
  });

  it('adds source (contact_enquiry) for an enquiry report and null otherwise', async () => {
    const { service } = build({ vetted: true, rows: { report: [reportRow({ targetType: 'enquiry' }), reportRow({ id: 'r2' })] } });
    const items = (await service.search('9a1b2c3d', admin('moderator'))).groups.reports!.items;
    expect(items.map((r) => r.source)).toEqual(['contact_enquiry', null]);
  });

  it('the vetting gate still wraps every new report matcher', async () => {
    const { service, models } = build({ vetted: false });
    await service.search('9a1b2c3d', admin('moderator'));
    expect(models.report.findMany.mock.calls[0][0].where).toEqual({ AND: [{ OR: expect.any(Array) }, { concernsMinor: false }] });
    const named = build({ vetted: false, rows: { user: [{ id: 'user-k' }] } });
    await named.service.search('nelson_k', admin('moderator'));
    expect(named.models.report.findMany.mock.calls[0][0].where).toEqual({ AND: [{ OR: expect.any(Array) }, { concernsMinor: false }] });
  });
});

describe('AdminSearchService: media and staff fields', () => {
  it('media: sources and uploader like the review list; the uploader is the PUBLIC name, never the real name', async () => {
    const { service } = build({ vetted: true, rows: { postMedia: [mediaRow({ reviewEntrySource: 'auto_check', _count: { reports: 0 } })] } });
    const hit = (await service.search(UUID, admin('moderator'))).groups.media!.items[0];
    expect(hit.sources).toEqual(['auto_check']);
    expect(hit.uploader).toEqual({ id: 'u9', publicName: 'amaka_fc' });
    expect(JSON.stringify(hit)).not.toContain('Amaka Real Name');
    expect(Object.keys(hit).sort()).toEqual(['createdAt', 'id', 'kind', 'matchedOn', 'reportCount', 'sources', 'status', 'uploader']);
  });

  it('media: a reported item lists user_report, with or without the auto check', async () => {
    const both = build({ vetted: true, rows: { postMedia: [mediaRow({ reviewEntrySource: 'auto_check', _count: { reports: 2 } })] } });
    expect((await both.service.search(UUID, admin('moderator'))).groups.media!.items[0].sources).toEqual(['auto_check', 'user_report']);
    const reportedOnly = build({ vetted: true, rows: { postMedia: [mediaRow({ reviewEntrySource: null, _count: { reports: 1 } })] } });
    expect((await reportedOnly.service.search(UUID, admin('moderator'))).groups.media!.items[0].sources).toEqual(['user_report']);
  });

  it('media: an uploader with no username shows the shared placeholder, not the real name', async () => {
    const { service } = build({
      vetted: true,
      rows: { postMedia: [mediaRow({ uploader: { id: 'u9', username: null, displayName: 'Real Person' } })] },
    });
    const hit = (await service.search(UUID, admin('moderator'))).groups.media!.items[0];
    expect(hit.uploader.publicName).toBe('Soccernity member');
    expect(JSON.stringify(hit)).not.toContain('Real Person');
  });

  it('staff: twoFactorEnabled is a boolean from totpEnabledAt; the timestamp is not returned', async () => {
    const rows = [
      { id: 's1', email: 'a@x.io', fullName: 'Amara', role: 'moderator', accountStatus: 'active', totpEnabledAt: new Date() },
      { id: 's2', email: 'b@x.io', fullName: 'Amaka', role: 'editor', accountStatus: 'active', totpEnabledAt: null },
    ];
    const { service } = build({ rows: { adminUser: rows } });
    const items = (await service.search('ama', admin('superadmin'))).groups.staff!.items;
    expect(items.map((s) => s.twoFactorEnabled)).toEqual([true, false]);
    expect(Object.keys(items[0]).sort()).toEqual(['accountStatus', 'email', 'fullName', 'id', 'matchedOn', 'role', 'twoFactorEnabled']);
  });
});

describe('AdminSearchService: new fields obey the role matrix and are the same for a vetted and an unvetted admin', () => {
  it('a moderator gets no staff group (so no twoFactor field); an editor gets no media or report group', async () => {
    const mod = build({ vetted: true });
    expect('staff' in (await mod.service.search(UUID, admin('moderator'))).groups).toBe(false);
    const ed = build({ vetted: true });
    const groups = (await ed.service.search(UUID, admin('editor'))).groups;
    expect('media' in groups).toBe(false);
    expect('reports' in groups).toBe(false);
  });

  it('for a row both admins can see, the whole response is byte-identical (no vetting-dependent field)', async () => {
    const rows = { report: [reportRow()], postMedia: [mediaRow()] };
    const a = await build({ vetted: true, rows }).service.search(UUID, admin('moderator'));
    const b = await build({ vetted: false, rows }).service.search(UUID, admin('moderator'));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('the audit row still holds no query text even when the new matchers run (a username-shaped half address)', async () => {
    const { service, actionLog } = build({ vetted: true });
    await service.search('nelson_k@', admin('superadmin'));
    const args = actionLog.record.mock.calls[0] as unknown[];
    for (const a of args) expect(String(a)).not.toContain('nelson');
  });
});
