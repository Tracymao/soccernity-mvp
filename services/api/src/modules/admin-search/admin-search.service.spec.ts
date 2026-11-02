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
    const { service, models } = build({ vetted: true, rows: { post: [{ id: 'p1' }], comment: [{ id: 'c1' }] } });
    await service.search(UUID, admin('moderator'));
    const or = models.report.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual([
      { id: UUID },
      { reporterId: UUID },
      { targetType: 'user', targetId: UUID },
      { targetType: 'post', targetId: { in: ['p1'] } },
      { targetType: 'comment', targetId: { in: ['c1'] } },
    ]);
    expect(models.post.findMany.mock.calls[0][0].take).toBe(200);
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
    expect(keys('report')).toEqual(['concernsMinor', 'createdAt', 'id', 'severity', 'status', 'targetId', 'targetType']);
    expect(keys('postMedia')).toEqual(['createdAt', 'id', 'kind', 'reportCount', 'status']);
    const e = build();
    await e.service.search('hello world', admin('superadmin'));
    expect(Object.keys(e.models.contactEnquiry.findMany.mock.calls[0][0].select)).not.toContain('message');
    expect(Object.keys(e.models.article.findMany.mock.calls[0][0].select)).not.toContain('body');
    expect(Object.keys(e.models.adminUser.findMany.mock.calls[0][0].select).sort()).toEqual(['accountStatus', 'email', 'fullName', 'id', 'role']);
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
    const { service, actionLog } = build({ rows: { user: [{ id: 'u1' }], contactEnquiry: [{ id: 'e1' }, { id: 'e2' }] } });
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
