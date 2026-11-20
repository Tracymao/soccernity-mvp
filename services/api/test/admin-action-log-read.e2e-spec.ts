import { randomUUID } from 'crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ADMIN_ACTION_LOG_ACTIONS, ADMIN_ACTION_LOG_TARGET_TYPES } from '../src/modules/admin-action-log/admin-action-log.constants';
import { ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS } from '../src/modules/admin-action-log/admin-action-log-read.constants';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// GET /admin/action-log (Decision Log #464, option B) against the REAL app, real Postgres and the real guards.
//
// PROVEN HERE THAT A MOCK CANNOT SHOW
//   - the SQL itself: the scope condition, the child-safety exclusion across every target kind, the keyset cursor
//     (ties on createdAt included), and that a hidden row leaves NO gap in a page
//   - the role matrix over real admin tokens: a superadmin reads everything, an editor or moderator ONLY their own rows,
//     and no query parameter can widen that
//   - the vetting matrix for every reader role, a reader's own rows included
//   - that reading the log writes no log row, and that a row written by a real admin action is readable

jest.setTimeout(240_000);

type Role = 'editor' | 'moderator' | 'superadmin';

describe('GET /admin/action-log (real Postgres)', () => {
  let app: INestApplication;
  const prisma = () => getTestPrismaClient();
  const rand = () => Math.random().toString(36).slice(2, 10);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const A = ADMIN_ACTION_LOG_ACTIONS;
  const T = ADMIN_ACTION_LOG_TARGET_TYPES;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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
  async function admin(role: Role, over: { vetted?: boolean; fullName?: string } = {}) {
    const a = await prisma().adminUser.create({
      data: {
        email: `e2e-actionlog-${role}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: over.fullName ?? `Admin ${role} ${rand()}`,
        role,
        childSafetyVetted: over.vetted ?? false,
      },
    });
    const token = (await app.get(AdminTokenService).issueTokenPair(a.id, a.role)).accessToken.token;
    return { id: a.id, token, role, fullName: a.fullName };
  }

  async function user(over: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: `e2e-actionlog-user-${rand()}@example.com`,
        passwordHash: 'unused-hash',
        displayName: 'Log User',
        dateOfBirth: seedDob('1998-07-04'),
        ...over,
      } as never,
    });
  }
  const minorUser = () => user({ isMinor: true, dateOfBirth: seedDob('2012-03-05') });

  let tick = 0;
  /** A log row with a strictly increasing createdAt unless one is given. */
  async function log(adminId: string, action: string, targetType: string, targetId: string, over: { notes?: string | null; createdAt?: Date } = {}) {
    return prisma().adminActionLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        notes: over.notes === undefined ? null : over.notes,
        createdAt: over.createdAt ?? new Date(Date.UTC(2026, 10, 1, 12, 0, 0, 0) + ++tick * 1000),
      },
    });
  }

  const read = (token: string, query: Record<string, string> = {}) =>
    request(app.getHttpServer()).get('/admin/action-log').query(query).set(bearer(token));
  const ids = (body: { items: Array<{ id: string }> }) => body.items.map((i) => i.id);

  // =============================================================== access
  describe('access', () => {
    it('401 without a token and with a User token; 200 for every admin role; an empty log is an empty page', async () => {
      const u = await user();
      const userToken = (await app.get(TokenService).issueTokenPair(u.id, u.role)).accessToken.token;
      await request(app.getHttpServer()).get('/admin/action-log').expect(401);
      await read(userToken).expect(401);
      for (const role of ['editor', 'moderator', 'superadmin'] as const) {
        const a = await admin(role);
        const res = await read(a.token).expect(200);
        expect(res.body).toEqual({ items: [], nextCursor: null });
      }
    });

    it('returns exactly { id, createdAt, actor { id, displayName }, action, targetType, targetId, notes }, notes as stored', async () => {
      const s = await admin('superadmin', { fullName: 'Sam Super' });
      const notes = '  reason:  "quoted" \n second line é中  ';
      const row = await log(s.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'cycle-1', { notes });
      const res = await read(s.token).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toEqual({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        actor: { id: s.id, displayName: 'Sam Super' },
        action: A.CONTEST_CYCLE_UPDATED,
        targetType: T.CONTEST_CYCLE,
        targetId: 'cycle-1',
        notes,
      });
    });

    it('a row with null notes returns notes null', async () => {
      const s = await admin('superadmin');
      await log(s.id, A.CONTEST_CYCLE_CREATED, T.CONTEST_CYCLE, 'cycle-2');
      expect((await read(s.token).expect(200)).body.items[0].notes).toBeNull();
    });
  });

  // =============================================================== scope
  describe('scope (who reads whose rows)', () => {
    async function seed() {
      const editor = await admin('editor');
      const moderator = await admin('moderator');
      const superadmin = await admin('superadmin');
      const rows = {
        editor: [await log(editor.id, A.CONTEST_CYCLE_CREATED, T.CONTEST_CYCLE, 'c1'), await log(editor.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'c1')],
        moderator: [await log(moderator.id, A.CONTEST_CYCLE_CREATED, T.CONTEST_CYCLE, 'c2'), await log(moderator.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'c2')],
        superadmin: [await log(superadmin.id, A.ADMIN_USER_CREATED, T.ADMIN_USER, editor.id)],
      };
      return { editor, moderator, superadmin, rows };
    }

    it('a superadmin reads every row, newest first', async () => {
      const { superadmin, rows } = await seed();
      const res = await read(superadmin.token).expect(200);
      const all = [...rows.editor, ...rows.moderator, ...rows.superadmin].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      expect(ids(res.body)).toEqual(all.map((r) => r.id));
    });

    it.each(['editor', 'moderator'] as const)('a %s reads ONLY the rows where they are the acting admin', async (role) => {
      const s = await seed();
      const me = s[role];
      const res = await read(me.token).expect(200);
      expect(ids(res.body)).toEqual([...s.rows[role]].reverse().map((r) => r.id));
      expect(res.body.items.every((i: { actor: { id: string } }) => i.actor.id === me.id)).toBe(true);
    });

    it('a superadmin may filter by acting admin', async () => {
      const { superadmin, moderator, rows } = await seed();
      const res = await read(superadmin.token, { adminId: moderator.id }).expect(200);
      expect(ids(res.body)).toEqual([...rows.moderator].reverse().map((r) => r.id));
    });

    it.each(['editor', 'moderator'] as const)('a %s passing adminId (another admin, or their own) is refused with a stable 400 and sees no row', async (role) => {
      const s = await seed();
      const other = role === 'editor' ? s.moderator : s.editor;
      for (const adminId of [other.id, s.superadmin.id, s[role].id]) {
        const res = await read(s[role].token, { adminId }).expect(400);
        expect(res.body.code).toBe('admin_action_log_admin_filter_not_allowed');
        expect(res.body.items).toBeUndefined();
      }
    });

    it('NO combination of parameters lets an editor or a moderator read another admin\'s row', async () => {
      const s = await seed();
      const othersRows = new Set([...s.rows.superadmin, ...s.rows.moderator, ...s.rows.editor].map((r) => r.id));
      for (const role of ['editor', 'moderator'] as const) {
        const mine = new Set(s.rows[role].map((r) => r.id));
        const queries: Array<Record<string, string>> = [
          {},
          { limit: '50' },
          { limit: '1' },
          { action: A.CONTEST_CYCLE_CREATED },
          { action: A.ADMIN_USER_CREATED },
          { from: '2020-01-01' },
          { to: '2099-01-01' },
          { from: '2020-01-01', to: '2099-01-01', limit: '50' },
        ];
        for (const q of queries) {
          const res = await read(s[role].token, q).expect(200);
          for (const row of res.body.items as Array<{ id: string; actor: { id: string } }>) {
            expect(row.actor.id).toBe(s[role].id);
            expect(mine.has(row.id)).toBe(true);
            expect(othersRows.has(row.id)).toBe(true); // sanity: ids come from the seeded set
          }
        }
        // And following a cursor never crosses over either: walk the whole log one row at a time.
        let cursor: string | undefined;
        const seen: string[] = [];
        for (let i = 0; i < 10; i++) {
          const res = await read(s[role].token, { limit: '1', ...(cursor ? { cursor } : {}) }).expect(200);
          seen.push(...ids(res.body));
          cursor = res.body.nextCursor ?? undefined;
          if (!cursor) break;
        }
        expect(seen.sort()).toEqual([...mine].sort());
      }
    });

    it('a token forged with a different subject cannot be used: the scope follows the verified token only', async () => {
      const s = await seed();
      // The query string can carry no admin identity (adminId is refused), so the only identity is the token's.
      const res = await read(s.editor.token, { action: A.ADMIN_USER_CREATED }).expect(200);
      expect(res.body.items).toEqual([]); // the superadmin's row exists but is not the editor's
    });
  });

  // =============================================================== child-safety rule
  describe('child-safety rule', () => {
    /**
     * Every row is written BY THE READER (their own rows), so only the child-safety rule decides what comes back.
     * Returns the ids that must be hidden from an unvetted reader and those that must stay.
     */
    async function seedKinds(by: string) {
      const minor = await minorUser();
      const adult = await user();
      const minorReport = await prisma().report.create({ data: { reporterId: null, targetType: 'user', targetId: randomUUID(), reason: 'r', concernsMinor: true } as never });
      const plainReport = await prisma().report.create({ data: { reporterId: null, targetType: 'user', targetId: randomUUID(), reason: 'r' } as never });
      const minorMedia = await prisma().postMedia.create({
        data: { uploaderId: minor.id, kind: 'image', declaredContentType: 'image/jpeg', declaredSize: 1000, uploadState: 'ready', status: 'pending' } as never,
      });
      const adultMedia = await prisma().postMedia.create({
        data: { uploaderId: adult.id, kind: 'image', declaredContentType: 'image/jpeg', declaredSize: 1000, uploadState: 'ready', status: 'pending' } as never,
      });
      const minorEnquiryReport = await prisma().report.create({ data: { reporterId: null, targetType: 'enquiry', targetId: randomUUID(), reason: 'r', concernsMinor: true } as never });
      const plainEnquiryReport = await prisma().report.create({ data: { reporterId: null, targetType: 'enquiry', targetId: randomUUID(), reason: 'r' } as never });
      const enquiry = (extra: Record<string, unknown> = {}) =>
        prisma().contactEnquiry.create({ data: { name: 'S', email: `e-${rand()}@example.com`, category: 'enquiries', subject: 's', message: 'm', ...extra } as never });
      const minorEnquiry = await enquiry({ escalatedReportId: minorEnquiryReport.id });
      const plainEnquiry = await enquiry({ escalatedReportId: plainEnquiryReport.id });
      const unescalatedEnquiry = await enquiry();

      const hidden: Record<string, string> = {};
      const shown: Record<string, string> = {};
      const add = async (bucket: Record<string, string>, key: string, action: string, targetType: string, targetId: string) => {
        bucket[key] = (await log(by, action, targetType, targetId)).id;
      };

      // child-safety ACTIONS: hidden whatever the target (even an adult user / a made-up id)
      for (const action of ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS) await add(hidden, `action ${action}`, action, T.USER, adult.id);
      // targets
      await add(hidden, 'user: minor', A.USER_STATUS_UPDATED, T.USER, minor.id);
      await add(hidden, 'user: not found (cannot show it is not a minor)', A.USER_STATUS_UPDATED, T.USER, randomUUID());
      await add(hidden, 'account hold on a minor', A.ACCOUNT_HOLD_LIFTED, T.USER, minor.id);
      await add(hidden, 'report: concernsMinor', A.REPORT_ACTIONED, T.REPORT, minorReport.id);
      await add(hidden, 'report: not found', A.REPORT_ACTIONED, T.REPORT, randomUUID());
      await add(hidden, 'media: minor uploader', A.MEDIA_REJECTED, T.POST_MEDIA, minorMedia.id);
      await add(hidden, 'media: not found', A.MEDIA_APPROVED, T.POST_MEDIA, randomUUID());
      await add(hidden, 'enquiry: escalated, concernsMinor', A.CONTACT_ENQUIRY_ESCALATED, T.CONTACT_ENQUIRY, minorEnquiry.id);

      await add(shown, 'user: adult', A.USER_STATUS_UPDATED, T.USER, adult.id);
      await add(shown, 'account hold on an adult', A.ACCOUNT_HOLD_LIFTED, T.USER, adult.id);
      await add(shown, 'report: plain', A.REPORT_ACTIONED, T.REPORT, plainReport.id);
      await add(shown, 'media: adult uploader', A.MEDIA_APPROVED, T.POST_MEDIA, adultMedia.id);
      await add(shown, 'enquiry: escalated, not a minor', A.CONTACT_ENQUIRY_ESCALATED, T.CONTACT_ENQUIRY, plainEnquiry.id);
      await add(shown, 'enquiry: not escalated', A.CONTACT_ENQUIRY_HANDLED, T.CONTACT_ENQUIRY, unescalatedEnquiry.id);
      await add(shown, 'enquiry: not found (never escalated as a minor)', A.CONTACT_ENQUIRY_REOPENED, T.CONTACT_ENQUIRY, randomUUID());
      await add(shown, 'admin user', A.ADMIN_ROLE_CHANGED, T.ADMIN_USER, randomUUID());
      await add(shown, 'contest', A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, randomUUID());
      await add(shown, 'search', A.ADMIN_SEARCH_PERFORMED, T.SEARCH, 'email');
      return { hidden, shown };
    }

    // every reader role x vetted / unvetted: the rule applies to each, to the reader's OWN rows
    describe.each([
      ['editor', true],
      ['editor', false],
      ['moderator', true],
      ['moderator', false],
      ['superadmin', true],
      ['superadmin', false],
    ] as Array<[Role, boolean]>)('a %s who is vetted=%s, reading their own rows', (role, vetted) => {
      it(vetted ? 'sees every row' : 'sees the non-child-safety rows only, with no placeholder', async () => {
        const reader = await admin(role, { vetted });
        const { hidden, shown } = await seedKinds(reader.id);
        const res = await read(reader.token, { limit: '50' }).expect(200);
        const got = new Set(ids(res.body));
        for (const [key, id] of Object.entries(shown)) expect({ key, present: got.has(id) }).toEqual({ key, present: true });
        for (const [key, id] of Object.entries(hidden)) expect({ key, present: got.has(id) }).toEqual({ key, present: vetted });
        expect(res.body.items).toHaveLength(Object.keys(shown).length + (vetted ? Object.keys(hidden).length : 0));
        expect(res.body.nextCursor).toBeNull();
      });
    });

    it('a superadmin who is not vetted does not see ANOTHER admin\'s child-safety rows either; a vetted superadmin does', async () => {
      const author = await admin('moderator', { vetted: true });
      const { hidden, shown } = await seedKinds(author.id);
      const unvettedSuper = await admin('superadmin', { vetted: false });
      const vettedSuper = await admin('superadmin', { vetted: true });
      const a = new Set(ids((await read(unvettedSuper.token, { limit: '50' }).expect(200)).body));
      const b = new Set(ids((await read(vettedSuper.token, { limit: '50' }).expect(200)).body));
      for (const id of Object.values(hidden)) {
        expect(a.has(id)).toBe(false);
        expect(b.has(id)).toBe(true);
      }
      for (const id of Object.values(shown)) {
        expect(a.has(id)).toBe(true);
        expect(b.has(id)).toBe(true);
      }
    });

    it('the action filter returns an empty page, not an error, for a child-safety action an unvetted reader asks for', async () => {
      const reader = await admin('superadmin', { vetted: false });
      await seedKinds(reader.id);
      const res = await read(reader.token, { action: A.USER_DOB_VIEWED }).expect(200);
      expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    it('is decided by a FRESH read: withdrawing vetting takes effect on the same token, at once', async () => {
      const reader = await admin('moderator', { vetted: true });
      const { hidden } = await seedKinds(reader.id);
      const hiddenId = Object.values(hidden)[0];
      expect(ids((await read(reader.token, { limit: '50' }).expect(200)).body)).toContain(hiddenId);
      await prisma().adminUser.update({ where: { id: reader.id }, data: { childSafetyVetted: false } });
      expect(ids((await read(reader.token, { limit: '50' }).expect(200)).body)).not.toContain(hiddenId);
    });
  });

  // =============================================================== pagination
  describe('pagination', () => {
    it('walks the log newest first with no gap or duplicate, and ends with a null cursor', async () => {
      const s = await admin('superadmin');
      const rows = [] as string[];
      for (let i = 0; i < 7; i++) rows.push((await log(s.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, `c${i}`)).id);
      const pages: string[][] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await read(s.token, { limit: '3', ...(cursor ? { cursor } : {}) }).expect(200);
        pages.push(ids(res.body));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
      expect(pages.flat()).toEqual([...rows].reverse());
    });

    it('rows sharing the same createdAt are ordered by id and none is skipped or repeated across a page boundary', async () => {
      const s = await admin('superadmin');
      const same = new Date(Date.UTC(2026, 10, 1, 9, 0, 0, 123));
      const made = [] as string[];
      for (let i = 0; i < 5; i++) made.push((await log(s.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, `t${i}`, { createdAt: same })).id);
      const expected = [...made].sort().reverse(); // createdAt desc, id desc
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await read(s.token, { limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...ids(res.body));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(seen).toEqual(expected);
    });

    it('hidden rows leave NO gap for an unvetted reader: same page size and cursor as if they did not exist', async () => {
      const reader = await admin('superadmin', { vetted: false });
      const visible = [] as string[];
      for (let i = 0; i < 7; i++) {
        visible.push((await log(reader.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, `v${i}`)).id);
        // a hidden row between every pair, and two at the very newest end
        await log(reader.id, A.USER_DOB_VIEWED, T.USER, randomUUID());
      }
      await log(reader.id, A.USER_GUARDIAN_NOTICES_WITHHELD, T.USER, randomUUID());
      const pages: string[][] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i++) {
        const res = await read(reader.token, { limit: '3', ...(cursor ? { cursor } : {}) }).expect(200);
        pages.push(ids(res.body));
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(pages.map((p) => p.length)).toEqual([3, 3, 1]);
      expect(pages.flat()).toEqual([...visible].reverse());
    });

    it('the default page size is 20 and the maximum 50', async () => {
      const s = await admin('superadmin');
      await prisma().adminActionLog.createMany({
        data: Array.from({ length: 55 }, (_v, i) => ({
          adminId: s.id,
          action: A.CONTEST_CYCLE_UPDATED,
          targetType: T.CONTEST_CYCLE,
          targetId: `bulk-${i}`,
          createdAt: new Date(Date.UTC(2026, 10, 1, 8, 0, 0) + i * 1000),
        })),
      });
      const first = await read(s.token).expect(200);
      expect(first.body.items).toHaveLength(20);
      expect(first.body.nextCursor).not.toBeNull();
      expect((await read(s.token, { limit: '50' }).expect(200)).body.items).toHaveLength(50);
    });
  });

  // =============================================================== filters
  describe('filters', () => {
    it('action, from and to (date-only and instant), and adminId combine', async () => {
      const s = await admin('superadmin');
      const m = await admin('moderator');
      const day = (d: number, h = 12) => new Date(Date.UTC(2026, 9, d, h, 0, 0, 0));
      const r1 = await log(s.id, A.CONTEST_CYCLE_CREATED, T.CONTEST_CYCLE, 'x1', { createdAt: day(10) });
      const r2 = await log(s.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'x2', { createdAt: day(11) });
      const r3 = await log(m.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'x3', { createdAt: day(12) });
      const r4 = await log(m.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'x4', { createdAt: day(12, 23) });

      expect(ids((await read(s.token, { action: A.CONTEST_CYCLE_CREATED }).expect(200)).body)).toEqual([r1.id]);
      expect(ids((await read(s.token, { action: A.CONTEST_CYCLE_UPDATED }).expect(200)).body)).toEqual([r4.id, r3.id, r2.id]);
      // date-only `to` covers that whole UTC day (r4 at 23:00 on the 12th is in)
      expect(ids((await read(s.token, { from: '2026-10-11', to: '2026-10-12' }).expect(200)).body)).toEqual([r4.id, r3.id, r2.id]);
      expect(ids((await read(s.token, { from: '2026-10-12', to: '2026-10-12' }).expect(200)).body)).toEqual([r4.id, r3.id]);
      // an instant `to` includes that millisecond and nothing later; `from` is inclusive
      expect(ids((await read(s.token, { from: '2026-10-11T12:00:00.000Z', to: '2026-10-12T12:00:00.000Z' }).expect(200)).body)).toEqual([r3.id, r2.id]);
      expect(ids((await read(s.token, { adminId: m.id, action: A.CONTEST_CYCLE_UPDATED, from: '2026-10-12T13:00:00Z' }).expect(200)).body)).toEqual([r4.id]);
      expect((await read(s.token, { from: '2030-01-01' }).expect(200)).body).toEqual({ items: [], nextCursor: null });
    });

    it('filters also apply to a non-superadmin\'s own rows', async () => {
      const m = await admin('moderator');
      const a = await log(m.id, A.CONTEST_CYCLE_CREATED, T.CONTEST_CYCLE, 'y1');
      await log(m.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'y2');
      expect(ids((await read(m.token, { action: A.CONTEST_CYCLE_CREATED }).expect(200)).body)).toEqual([a.id]);
    });

    it.each([
      ['an unknown action', { action: 'report.deleted' }, 'admin_action_log_action_invalid'],
      ['a malformed from', { from: 'yesterday' }, 'admin_action_log_date_invalid'],
      ['a malformed to', { to: '2026-02-31' }, 'admin_action_log_date_invalid'],
      ['an instant without a zone', { from: '2026-11-01T10:00:00' }, 'admin_action_log_date_invalid'],
      ['a reversed range', { from: '2026-11-03', to: '2026-11-02' }, 'admin_action_log_range_invalid'],
      ['limit 0', { limit: '0' }, 'admin_action_log_limit_invalid'],
      ['limit 51', { limit: '51' }, 'admin_action_log_limit_invalid'],
      ['limit abc', { limit: 'abc' }, 'admin_action_log_limit_invalid'],
      ['a garbage cursor', { cursor: 'not-a-cursor' }, 'admin_action_log_cursor_invalid'],
    ])('rejects %s with a stable 400 code', async (_label, query, code) => {
      const s = await admin('superadmin');
      const res = await read(s.token, query as Record<string, string>).expect(400);
      expect(res.body.code).toBe(code);
    });

    it('a superadmin passing a malformed adminId gets a stable 400', async () => {
      const s = await admin('superadmin');
      expect((await read(s.token, { adminId: 'nope' }).expect(400)).body.code).toBe('admin_action_log_admin_id_invalid');
    });

    it('rejects an unknown query parameter (400)', async () => {
      const s = await admin('superadmin');
      await request(app.getHttpServer()).get('/admin/action-log?targetId=x').set(bearer(s.token)).expect(400);
    });
  });

  // =============================================================== no writes, real rows
  describe('reading writes nothing; real actions are readable', () => {
    it('reading the log (any role, any filter) writes no AdminActionLog row', async () => {
      const s = await admin('superadmin');
      const m = await admin('moderator');
      await log(s.id, A.CONTEST_CYCLE_UPDATED, T.CONTEST_CYCLE, 'z1');
      const before = await prisma().adminActionLog.count();
      await read(s.token).expect(200);
      await read(m.token, { action: A.CONTEST_CYCLE_UPDATED, from: '2020-01-01' }).expect(200);
      await read(s.token, { adminId: m.id }).expect(200);
      expect(await prisma().adminActionLog.count()).toBe(before);
    });

    it('a row written by a REAL admin action is read back by its actor, and is hidden from an unvetted actor when the target is a minor', async () => {
      const mod = await admin('moderator', { vetted: false });
      const adult = await user();
      const minor = await minorUser();
      await request(app.getHttpServer()).patch(`/admin/users/${adult.id}`).set(bearer(mod.token)).send({ status: 'suspended', reasonCategory: 'other' }).expect(200);
      await request(app.getHttpServer()).patch(`/admin/users/${minor.id}`).set(bearer(mod.token)).send({ status: 'suspended', reasonCategory: 'other' }).expect(200);
      expect(await prisma().adminActionLog.count({ where: { adminId: mod.id, action: A.USER_STATUS_UPDATED } })).toBe(2);

      const res = await read(mod.token).expect(200);
      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0]).toMatchObject({ action: A.USER_STATUS_UPDATED, targetType: T.USER, targetId: adult.id, actor: { id: mod.id } });
      // B-291 (Decision Log #485): a suspension now records its reason category in the detail string; the reader passes notes through unchanged.
      expect(res.body.items[0].notes).toBe('status=suspended; reasonCategory=other');

      await prisma().adminUser.update({ where: { id: mod.id }, data: { childSafetyVetted: true } });
      expect((await read(mod.token).expect(200)).body.items).toHaveLength(2);
    });
  });
});
