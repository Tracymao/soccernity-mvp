import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ADMIN_ACTION_LOG_ACTIONS } from '../src/modules/admin-action-log/admin-action-log.constants';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { ADMIN_SEARCH_GROUP_CAP, ADMIN_SEARCH_RATE_LIMIT } from '../src/modules/admin-search/admin-search.constants';
import { TokenService } from '../src/modules/auth/token/token.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// B-114 (Decision Log #463): GET /admin/search against the REAL app, real Postgres and the real guards.
//
// PROVEN HERE THAT A MOCK CANNOT SHOW
//   - what Prisma actually sends to Postgres: LIKE wildcards in the typed text are escaped (a typed '_' or '%' is
//     literal), usernames match as a PREFIX, emails match exactly and never as a prefix, and an email match is
//     case-insensitive
//   - the role matrix over the real admin tokens, and that a group a role cannot open is ABSENT
//   - the child-safety-vetting rule, and that a withheld minor looks identical to a vetted and an unvetted admin
//     (and identical to the same search before the flag existed)
//   - that no date of birth, guardian field or withhold field can be in a response
//   - the audit row: written for an email-shaped search, never containing what was typed
//   - the per-IP rate limit (429 on the 31st request)
//
// Every request carries its own X-Forwarded-For so the per-IP, per-handler limit (30 a minute) is counted per test.

jest.setTimeout(240_000);

describe('GET /admin/search (real Postgres)', () => {
  let app: INestApplication;
  const prisma = () => getTestPrismaClient();
  const rand = () => Math.random().toString(36).slice(2, 10);
  let ipCounter = 0;
  const nextIp = () => `198.51.100.${(++ipCounter % 250) + 1}`;
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    (app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void }).set('trust proxy', true);
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // ---- seeding ----------------------------------------------------------------------------------------------
  async function admin(role: 'editor' | 'moderator' | 'superadmin', over: { vetted?: boolean; fullName?: string; email?: string } = {}) {
    const a = await prisma().adminUser.create({
      data: {
        email: over.email ?? `e2e-search-admin-${role}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: over.fullName ?? `Search Admin ${role}`,
        role,
        childSafetyVetted: over.vetted ?? false,
      },
    });
    const token = (await app.get(AdminTokenService).issueTokenPair(a.id, a.role)).accessToken.token;
    return { id: a.id, token };
  }

  async function user(over: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: `e2e-search-user-${rand()}@example.com`,
        passwordHash: 'unused-hash',
        displayName: 'Search User',
        dateOfBirth: seedDob('1998-07-04'),
        ...over,
      } as never,
    });
  }

  const search = (token: string, q: string, ip = nextIp()) =>
    request(app.getHttpServer()).get('/admin/search').query({ q }).set(bearer(token)).set('X-Forwarded-For', ip);
  const ids = (group: { items: Array<{ id: string }> } | undefined) => (group?.items ?? []).map((i) => i.id).sort();

  // =============================================================== access
  describe('access', () => {
    it('401 without a token and with a User token; 200 for every admin role', async () => {
      const u = await user();
      const userToken = (await app.get(TokenService).issueTokenPair(u.id, u.role)).accessToken.token;
      await request(app.getHttpServer()).get('/admin/search').query({ q: 'abcdef' }).set('X-Forwarded-For', nextIp()).expect(401);
      await search(userToken, 'abcdef').expect(401);
      for (const role of ['editor', 'moderator', 'superadmin'] as const) {
        const a = await admin(role);
        await search(a.token, 'abcdef').expect(200);
      }
    });

    it('which groups come back follows each section role rule; a group a role cannot open is ABSENT', async () => {
      const editor = await admin('editor');
      const moderator = await admin('moderator');
      const superadmin = await admin('superadmin');
      const keys = async (token: string) => Object.keys((await search(token, 'abcdef').expect(200)).body.groups).sort();
      expect(await keys(editor.token)).toEqual(['articles']);
      expect(await keys(moderator.token)).toEqual(['contactEnquiries', 'media', 'reports', 'users']);
      expect(await keys(superadmin.token)).toEqual(['articles', 'contactEnquiries', 'media', 'reports', 'staff', 'users']);
    });

    it('a role-allowed group with no match is present and empty; a role-forbidden group never holds data', async () => {
      const mod = await admin('moderator');
      await prisma().article.create({
        data: { title: 'Moderators must not see this title', body: 'b', status: 'draft', category: { create: { name: `c-${rand()}`, slug: `c-${rand()}` } }, authorAdmin: { connect: { id: mod.id } } },
      });
      const res = await search(mod.token, 'Moderators must not see').expect(200);
      expect(res.body.groups.users).toEqual({ items: [], truncated: false });
      expect('articles' in res.body.groups).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('Moderators must not see this title');
    });
  });

  // =============================================================== query validation
  describe('query validation', () => {
    it.each([
      ['missing', undefined, 'admin_search_query_too_short'],
      ['empty', '', 'admin_search_query_too_short'],
      ['spaces', '    ', 'admin_search_query_too_short'],
      ['two characters', 'ab', 'admin_search_query_too_short'],
      ['255 characters', 'a'.repeat(255), 'admin_search_query_too_long'],
      ['a control character', 'abc\u0001def', 'admin_search_query_invalid'],
    ])('rejects %s with a stable code', async (_label, q, code) => {
      const a = await admin('superadmin');
      const req = request(app.getHttpServer()).get('/admin/search').set(bearer(a.token)).set('X-Forwarded-For', nextIp());
      const res = await (q === undefined ? req : req.query({ q })).expect(400);
      expect(res.body.code).toBe(code);
    });

    it('accepts exactly 3 and exactly 254 characters', async () => {
      const a = await admin('superadmin');
      await search(a.token, 'abc').expect(200);
      await search(a.token, 'a'.repeat(254)).expect(200);
    });

    it('rejects an extra query parameter and a NUL byte sent as a percent escape (no 500)', async () => {
      const a = await admin('superadmin');
      await request(app.getHttpServer()).get('/admin/search?q=abcdef&limit=999').set(bearer(a.token)).set('X-Forwarded-For', nextIp()).expect(400);
      const res = await request(app.getHttpServer()).get('/admin/search?q=abc%00def').set(bearer(a.token)).set('X-Forwarded-For', nextIp()).expect(400);
      expect(res.body.code).toBe('admin_search_query_invalid');
    });
  });

  // =============================================================== users
  describe('users', () => {
    it('finds by user id (any case), by exact email (any case) and by username prefix (any case)', async () => {
      const mod = await admin('moderator');
      const target = await user({ email: 'exact.person@example.com', username: 'nelson_iheagwam' });
      await user({ username: 'nelson_other' });
      await user({ username: 'someone_else' });

      expect(ids((await search(mod.token, target.id.toUpperCase()).expect(200)).body.groups.users)).toEqual([target.id]);
      expect(ids((await search(mod.token, 'Exact.Person@Example.COM').expect(200)).body.groups.users)).toEqual([target.id]);
      const prefix = (await search(mod.token, 'Nelson_').expect(200)).body.groups.users;
      expect(prefix.items.map((i: { username: string }) => i.username).sort()).toEqual(['nelson_iheagwam', 'nelson_other']);
      expect(ids((await search(mod.token, 'nelson_ih').expect(200)).body.groups.users)).toEqual([target.id]);
    });

    it('a username is matched as a PREFIX, never as a substring', async () => {
      const mod = await admin('moderator');
      await user({ username: 'iheagwam_nelson' });
      expect((await search(mod.token, 'nelson').expect(200)).body.groups.users.items).toEqual([]);
    });

    it('an email is matched EXACTLY: a prefix, a domain or a partial address finds nothing', async () => {
      const mod = await admin('moderator');
      await user({ email: 'exact.person@example.com' });
      for (const q of ['exact.person@example.co', 'exact.person@', '@example.com', 'xact.person@example.com', 'exact.person@example.com.au']) {
        expect((await search(mod.token, q).expect(200)).body.groups.users.items).toEqual([]);
      }
    });

    it('LIKE wildcards in the typed text are literal: an underscore is not "any character"', async () => {
      const mod = await admin('moderator');
      await user({ username: 'abXcd_one' });
      const hit = await user({ username: 'ab_cd_two' });
      expect(ids((await search(mod.token, 'ab_cd').expect(200)).body.groups.users)).toEqual([hit.id]);
      // a lone '%' or '_' run is not username-shaped (%) or matches nothing as a prefix (___)
      expect((await search(mod.token, '%%%').expect(200)).body.groups.users.items).toEqual([]);
      expect((await search(mod.token, '___').expect(200)).body.groups.users.items).toEqual([]);
    });

    it('an anonymised account is found by user id only, never by its placeholder email', async () => {
      const mod = await admin('moderator');
      const gone = await user({ accountStatus: 'deleted', displayName: '[deleted user]', username: null });
      await prisma().user.update({ where: { id: gone.id }, data: { email: `deleted-${gone.id}@deleted.soccernity.internal` } });
      expect(ids((await search(mod.token, gone.id).expect(200)).body.groups.users)).toEqual([gone.id]);
      expect((await search(mod.token, `deleted-${gone.id}@deleted.soccernity.internal`).expect(200)).body.groups.users.items).toEqual([]);
      expect((await search(mod.token, '[deleted user]').expect(200)).body.groups.users.items).toEqual([]);
    });

    it('returns exactly the Users-list fields: no date of birth, no ciphertext, no guardian or flag field', async () => {
      const mod = await admin('moderator');
      const minor = await user({ isMinor: true, username: 'young_player' });
      await prisma().guardian.create({
        data: { minorUserId: minor.id, name: 'Guardian Person', email: 'guardian.private@example.com', relationship: 'Parent', consentToken: `c-${rand()}`, consentTokenExpiresAt: new Date(Date.now() + 86_400_000), consentStatus: 'confirmed' },
      });
      await prisma().guardianNoticeWithhold.create({ data: { userId: minor.id, setByAdminId: mod.id, reason: 'Safeguarding reason text that must never appear.' } });
      const res = await search(mod.token, minor.id).expect(200);
      expect(Object.keys(res.body.groups.users.items[0]).sort()).toEqual(['accountStatus', 'createdAt', 'displayName', 'email', 'id', 'username']);
      const text = JSON.stringify(res.body).toLowerCase();
      for (const forbidden of ['dateofbirth', 'v1:', 'guardian', 'withhold', 'safeguarding reason', 'isminor', 'consent']) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('a withheld minor looks identical to a vetted and an unvetted admin, and identical to the same search before the flag existed', async () => {
      const vetted = await admin('moderator', { vetted: true });
      const unvetted = await admin('moderator', { vetted: false });
      const superadmin = await admin('superadmin', { vetted: false });
      const minor = await user({ isMinor: true, username: 'withheld_kid' });
      await prisma().guardian.create({
        data: { minorUserId: minor.id, name: 'G', email: 'g@example.com', relationship: 'Parent', consentToken: `c-${rand()}`, consentTokenExpiresAt: new Date(Date.now() + 86_400_000), consentStatus: 'confirmed' },
      });
      const plain = async (token: string) => JSON.stringify((await search(token, minor.id).expect(200)).body.groups.users);
      const beforeFlag = { unvetted: await plain(unvetted.token), vetted: await plain(vetted.token) };
      await prisma().guardianNoticeWithhold.create({ data: { userId: minor.id, setByAdminId: vetted.id, reason: 'Reason that must never be searchable.' } });
      const afterFlag = { unvetted: await plain(unvetted.token), vetted: await plain(vetted.token), super: await plain(superadmin.token) };
      expect(afterFlag.unvetted).toBe(beforeFlag.unvetted);
      expect(afterFlag.vetted).toBe(beforeFlag.vetted);
      expect(afterFlag.unvetted).toBe(afterFlag.vetted);
      expect(afterFlag.super).toBe(afterFlag.vetted);
      // and the withhold reason is not searchable
      expect((await search(vetted.token, 'never be searchable').expect(200)).body.groups.users.items).toEqual([]);
    });
  });

  // =============================================================== reports
  describe('reports', () => {
    async function post(authorId: string) {
      return prisma().post.create({ data: { authorId, contentText: 'a post' } });
    }

    it('finds a report by its id, and the reports by or about a user through the user id', async () => {
      const mod = await admin('moderator');
      const reporter = await user();
      const subject = await user();
      const subjectPost = await post(subject.id);
      const comment = await prisma().comment.create({ data: { postId: subjectPost.id, authorId: subject.id, contentText: 'a comment' } });
      const other = await user();
      const make = (data: Record<string, unknown>) => prisma().report.create({ data: { reason: 'r', ...data } as never });
      const byReporter = await make({ reporterId: subject.id, targetType: 'user', targetId: other.id });
      const aboutUser = await make({ reporterId: reporter.id, targetType: 'user', targetId: subject.id });
      const aboutPost = await make({ reporterId: reporter.id, targetType: 'post', targetId: subjectPost.id });
      const aboutComment = await make({ reporterId: reporter.id, targetType: 'comment', targetId: comment.id });
      const unrelated = await make({ reporterId: reporter.id, targetType: 'user', targetId: other.id });

      expect(ids((await search(mod.token, aboutUser.id.toUpperCase()).expect(200)).body.groups.reports)).toEqual([aboutUser.id]);
      expect(ids((await search(mod.token, subject.id).expect(200)).body.groups.reports)).toEqual(
        [byReporter.id, aboutUser.id, aboutPost.id, aboutComment.id].sort(),
      );
      expect(ids((await search(mod.token, subject.id).expect(200)).body.groups.reports)).not.toContain(unrelated.id);
      expect((await search(mod.token, 'a report about nothing').expect(200)).body.groups.reports.items).toEqual([]);
    });

    it('returns only the pinned fields: never the reason, a contact email or an escalation note', async () => {
      const mod = await admin('moderator');
      const reporter = await user();
      const r = await prisma().report.create({ data: { reporterId: reporter.id, targetType: 'user', targetId: reporter.id, reason: 'secret reason words', reporterContactEmail: 'contact@example.com' } });
      const res = await search(mod.token, r.id).expect(200);
      expect(Object.keys(res.body.groups.reports.items[0]).sort()).toEqual(['concernsMinor', 'createdAt', 'id', 'severity', 'source', 'status', 'targetId', 'targetType']);
      expect(JSON.stringify(res.body)).not.toContain('secret reason words');
      expect(JSON.stringify(res.body)).not.toContain('contact@example.com');
    });

    it('a concernsMinor report is hidden from an admin who is not child-safety vetted (any role) and shown to a vetted one', async () => {
      const reporter = await user();
      const minorReport = await prisma().report.create({ data: { reporterId: reporter.id, targetType: 'user', targetId: reporter.id, reason: 'r', concernsMinor: true } });
      const plainReport = await prisma().report.create({ data: { reporterId: reporter.id, targetType: 'user', targetId: reporter.id, reason: 'r' } });
      const vetted = await admin('moderator', { vetted: true });
      const unvettedMod = await admin('moderator', { vetted: false });
      const unvettedSuper = await admin('superadmin', { vetted: false });
      expect(ids((await search(vetted.token, reporter.id).expect(200)).body.groups.reports)).toEqual([minorReport.id, plainReport.id].sort());
      for (const a of [unvettedMod, unvettedSuper]) {
        expect(ids((await search(a.token, reporter.id).expect(200)).body.groups.reports)).toEqual([plainReport.id]);
        expect((await search(a.token, minorReport.id).expect(200)).body.groups.reports.items).toEqual([]);
      }
    });

    it('marks a report made from a contact enquiry', async () => {
      const mod = await admin('moderator');
      const r = await prisma().report.create({ data: { reporterId: null, targetType: 'enquiry', targetId: randomUUID(), reason: 'from an enquiry' } });
      expect((await search(mod.token, r.id).expect(200)).body.groups.reports.items[0].source).toBe('contact_enquiry');
    });
  });

  // =============================================================== contact enquiries
  describe('contact enquiries', () => {
    async function enquiry(over: Record<string, unknown> = {}) {
      return prisma().contactEnquiry.create({
        data: { name: 'Sender', email: `e2e-sender-${rand()}@example.com`, category: 'enquiries', subject: 'A subject', message: 'A message body', ...over } as never,
      });
    }

    it('finds by the sender exact email (any case) and by subject contains (any case); never by the message', async () => {
      const mod = await admin('moderator');
      const e = await enquiry({ email: 'Sender.Exact@Example.com', subject: 'Trouble with my Livescores page', message: 'uniquemessageword zebra' });
      expect(ids((await search(mod.token, 'sender.exact@example.COM').expect(200)).body.groups.contactEnquiries)).toEqual([e.id]);
      expect(ids((await search(mod.token, 'LIVESCORES PAGE').expect(200)).body.groups.contactEnquiries)).toEqual([e.id]);
      expect((await search(mod.token, 'uniquemessageword').expect(200)).body.groups.contactEnquiries.items).toEqual([]);
      expect((await search(mod.token, 'sender.exact@').expect(200)).body.groups.contactEnquiries.items).toEqual([]);
      expect((await search(mod.token, 'sender.exact@example').expect(200)).body.groups.contactEnquiries.items).toEqual([]);
    });

    it('subject wildcards are literal', async () => {
      const mod = await admin('moderator');
      const hit = await enquiry({ subject: 'Is it 50%_off today' });
      await enquiry({ subject: 'Is it 500 reasons today' });
      expect(ids((await search(mod.token, '50%_off').expect(200)).body.groups.contactEnquiries)).toEqual([hit.id]);
    });

    it('returns the inbox list fields only: no message, no user id, no escalated report id', async () => {
      const mod = await admin('moderator');
      const e = await enquiry({ subject: 'Distinct subject words', message: 'Do not leak this message' });
      const res = await search(mod.token, 'Distinct subject').expect(200);
      expect(Object.keys(res.body.groups.contactEnquiries.items[0]).sort()).toEqual([
        'category', 'createdAt', 'email', 'handledAt', 'handledByAdminId', 'hasEscalation', 'id', 'lastMessageAt', 'name', 'status', 'subject', 'submitter',
      ]);
      expect(res.body.groups.contactEnquiries.items[0].id).toBe(e.id);
      expect(JSON.stringify(res.body)).not.toContain('Do not leak this message');
    });
  });

  // =============================================================== articles and staff
  describe('articles and staff', () => {
    async function article(authorId: string, title: string) {
      return prisma().article.create({ data: { title, body: 'the body', status: 'draft', category: { create: { name: `c-${rand()}`, slug: `c-${rand()}` } }, authorAdmin: { connect: { id: authorId } } } });
    }

    it('articles: title contains, any case, wildcards literal, never the body; editors and superadmins only', async () => {
      const editor = await admin('editor');
      const a = await article(editor.id, 'Why Grassroots Football Matters 100%_free');
      await article(editor.id, 'Unrelated headline');
      expect(ids((await search(editor.token, 'grassroots football').expect(200)).body.groups.articles)).toEqual([a.id]);
      expect(ids((await search(editor.token, '100%_free').expect(200)).body.groups.articles)).toEqual([a.id]);
      expect((await search(editor.token, '100%').expect(200)).body.groups.articles.items).toHaveLength(1);
      expect((await search(editor.token, 'the body').expect(200)).body.groups.articles.items).toEqual([]);
      const res = await search(editor.token, 'grassroots football').expect(200);
      expect(Object.keys(res.body.groups.articles.items[0]).sort()).toEqual(['category', 'createdAt', 'id', 'publishedAt', 'status', 'title']);
    });

    it('staff: name contains or exact email; superadmin only; only the pinned fields', async () => {
      const superadmin = await admin('superadmin');
      const mod = await admin('moderator', { fullName: 'Chidinma Okafor', email: 'chidinma.okafor@example.com' });
      expect(ids((await search(superadmin.token, 'chidinma').expect(200)).body.groups.staff)).toEqual([mod.id]);
      expect(ids((await search(superadmin.token, 'Chidinma.Okafor@Example.com').expect(200)).body.groups.staff)).toEqual([mod.id]);
      expect((await search(superadmin.token, 'chidinma.okafor@').expect(200)).body.groups.staff.items).toEqual([]);
      const res = await search(superadmin.token, 'chidinma').expect(200);
      expect(Object.keys(res.body.groups.staff.items[0]).sort()).toEqual(['accountStatus', 'email', 'fullName', 'id', 'role']);
      expect(JSON.stringify(res.body)).not.toContain('passwordHash');
      // a moderator never gets the group, and never sees a name through another group
      const asMod = await search(mod.token, 'chidinma').expect(200);
      expect('staff' in asMod.body.groups).toBe(false);
    });
  });

  // =============================================================== media
  describe('media review items', () => {
    async function media(uploaderId: string, over: Record<string, unknown> = {}) {
      return prisma().postMedia.create({
        data: { uploaderId, kind: 'image', declaredContentType: 'image/jpeg', declaredSize: 1000, uploadState: 'ready', status: 'pending', reviewEnteredAt: new Date(), reviewEntrySource: 'auto_check', ...over } as never,
      });
    }

    it('finds a queued item by id; an item that never entered the queue is not found; only the pinned fields', async () => {
      const mod = await admin('moderator');
      const uploader = await user();
      const queued = await media(uploader.id);
      const never = await media(uploader.id, { reviewEnteredAt: null, reviewEntrySource: null, status: 'approved', decisionSource: 'auto', decidedAt: new Date() });
      const res = await search(mod.token, queued.id.toUpperCase()).expect(200);
      expect(ids(res.body.groups.media)).toEqual([queued.id]);
      expect(Object.keys(res.body.groups.media.items[0]).sort()).toEqual(['createdAt', 'id', 'kind', 'reportCount', 'status']);
      expect((await search(mod.token, never.id).expect(200)).body.groups.media.items).toEqual([]);
    });

    it("a minor's item is hidden from an admin who is not child-safety vetted (any role), shown to a vetted one", async () => {
      const minor = await user({ isMinor: true });
      const item = await media(minor.id);
      const vetted = await admin('moderator', { vetted: true });
      const unvetted = await admin('moderator', { vetted: false });
      const unvettedSuper = await admin('superadmin', { vetted: false });
      expect(ids((await search(vetted.token, item.id).expect(200)).body.groups.media)).toEqual([item.id]);
      for (const a of [unvetted, unvettedSuper]) {
        expect((await search(a.token, item.id).expect(200)).body.groups.media.items).toEqual([]);
      }
    });
  });

  // =============================================================== caps
  it('caps a group at the page default and says truncated; exactly the cap is not truncated', async () => {
    const editor = await admin('editor');
    const category = await prisma().category.create({ data: { name: `cap-${rand()}`, slug: `cap-${rand()}` } });
    const make = (n: number) => prisma().article.createMany({ data: Array.from({ length: n }, (_, i) => ({ title: `Capword article ${i}`, body: 'b', categoryId: category.id, authorAdminId: editor.id })) });
    await make(ADMIN_SEARCH_GROUP_CAP);
    let res = await search(editor.token, 'Capword').expect(200);
    expect(res.body.groups.articles.items).toHaveLength(ADMIN_SEARCH_GROUP_CAP);
    expect(res.body.groups.articles.truncated).toBe(false);
    await make(1);
    res = await search(editor.token, 'Capword').expect(200);
    expect(res.body.groups.articles.items).toHaveLength(ADMIN_SEARCH_GROUP_CAP);
    expect(res.body.groups.articles.truncated).toBe(true);
  });

  // =============================================================== audit
  describe('the audit row', () => {
    it('an email-shaped search writes ONE row with the kind and the count, and nothing typed appears in any column', async () => {
      const mod = await admin('moderator');
      const typed = 'very.private.person@example.com';
      await user({ email: typed });
      await search(mod.token, typed).expect(200);
      const rows = await prisma().adminActionLog.findMany({ where: { action: ADMIN_ACTION_LOG_ACTIONS.ADMIN_SEARCH_PERFORMED } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ adminId: mod.id, targetType: 'search', targetId: 'email', notes: 'kind=email results=1' });
      expect(JSON.stringify(rows[0]).toLowerCase()).not.toContain('private');
      expect(JSON.stringify(rows[0]).toLowerCase()).not.toContain('example.com');
    });

    it('a half-typed address is audited; a search with no @ writes nothing; each email-shaped search writes its own row', async () => {
      const mod = await admin('moderator');
      await search(mod.token, 'someone@').expect(200);
      await search(mod.token, 'nelson').expect(200);
      await search(mod.token, 'someone@example.org').expect(200);
      const rows = await prisma().adminActionLog.findMany({ where: { action: ADMIN_ACTION_LOG_ACTIONS.ADMIN_SEARCH_PERFORMED } });
      expect(rows).toHaveLength(2);
    });

    it('a rejected query (too short, with an @) writes no row', async () => {
      const mod = await admin('moderator');
      await search(mod.token, 'a@').expect(400);
      expect(await prisma().adminActionLog.count({ where: { action: ADMIN_ACTION_LOG_ACTIONS.ADMIN_SEARCH_PERFORMED } })).toBe(0);
    });
  });

  // =============================================================== rate limit
  it('is limited per IP: request 31 in a minute is a 429, and another IP is unaffected', async () => {
    const a = await admin('editor');
    const ip = nextIp();
    for (let i = 0; i < ADMIN_SEARCH_RATE_LIMIT.limit; i += 1) await search(a.token, 'abcdef', ip).expect(200);
    const blocked = await search(a.token, 'abcdef', ip).expect(429);
    // The shared per-IP limiter names its header after the throttler ('auth'); that is existing behaviour, not asserted further.
    expect(blocked.body.statusCode).toBe(429);
    await search(a.token, 'abcdef', nextIp()).expect(200);
  });
});
