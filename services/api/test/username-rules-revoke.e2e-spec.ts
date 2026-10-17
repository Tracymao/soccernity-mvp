import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-031 / B-032 / B-033 / B-034 (Decision Log #369, #398 D3, #402 item 3, #404)
// against real Postgres. What needs a real database rather than only the mocked
// specs:
//   - the club-name impersonation check is raw SQL (regexp_replace) over ClubPage;
//   - the optimistic lock on username + usernameChangedAt under a real race;
//   - the revoke is ONE transaction (user row + RevokedUsername + AdminActionLog);
//   - the RevokedUsername unique/hold/permanent-bar behaviour across users;
//   - the gate reads the cleared column fresh, so the user's EXISTING token
//     loses the right to post at once;
//   - the username keyset (nulls last, id tiebreak) pages a real table without
//     gaps or repeats, and its cursor never carries the real displayName.

const DAY = 24 * 60 * 60 * 1000;

describe('Username rules, admin revoke and name keyset e2e (real Postgres)', () => {
  let app: INestApplication;
  let emailSpy: jest.SpyInstance;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    emailSpy = jest.spyOn(RegistrationEmailService.prototype, 'sendUsernameRevokedEmail').mockResolvedValue(undefined);
  });
  afterEach(() => emailSpy.mockRestore());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const server = () => app.getHttpServer();
  const rand = () => Math.random().toString(36).slice(2);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const prisma = () => getTestPrismaClient();

  async function createUser(displayName: string, username?: string | null, extra: Record<string, unknown> = {}) {
    const user = await prisma().user.create({
      data: {
        email: `e2e-un-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName,
        username: username ?? undefined,
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
        verificationStatus: 'verified',
        ...extra,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, token: accessToken.token, email: user.email };
  }

  async function createAdmin(role: string) {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-un-admin-${Date.now()}-${rand()}@example.com`, passwordHash: 'unused', fullName: 'E2E Admin', role },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, token: accessToken.token };
  }

  const setUsername = (u: { id: string; token: string }, username: unknown) =>
    request(server()).patch(`/users/${u.id}`).set(bearer(u.token)).send({ username });
  const dbUser = (id: string) => prisma().user.findUniqueOrThrow({ where: { id } });

  // ---------------------------------------------------------------- B-032 rules
  describe('B-032: the username rules, through PATCH /users/:id', () => {
    it.each(['admin', 'Soccernity_Official', 'xx_fuck_xx', 'snapchat_tom', 'a1b2c3d4e5f6g7h8'])('refuses %s with 400 username_not_allowed and stores nothing', async (bad) => {
      const u = await createUser('Plain Person');
      const res = await setUsername(u, bad).expect(400);
      expect(res.body.code).toBe('username_not_allowed');
      expect((await dbUser(u.id)).username).toBeNull();
    });

    it("refuses the user's own name and email, naming the reason only for personal data", async () => {
      const u = await createUser('Ada Obi');
      const own = await setUsername(u, 'ada_obi').expect(400);
      expect(own.body.code).toBe('username_not_allowed');
      expect(own.body.message).toContain("can't include your name");
      const generic = await setUsername(u, 'admin').expect(400);
      expect(generic.body.message).not.toContain("can't include");
    });

    it("refuses the user's own birth year (read from the ENCRYPTED date of birth)", async () => {
      const u = await createUser('Someone Else');
      await setUsername(u, 'striker1998').expect(400);
      await setUsername(u, 'striker1999').expect(200);
    });

    it('refuses a handle that is a club name (raw SQL over ClubPage), with or without punctuation, fc or official', async () => {
      await prisma().clubPage.create({ data: { name: 'Chelsea FC', league: 'Premier League', country: 'England', memberCount: 0 } });
      await prisma().clubPage.create({ data: { name: 'Man. United', league: 'Premier League', country: 'England', memberCount: 0 } });
      const u = await createUser('Plain Person');
      for (const bad of ['chelsea', 'Chelsea_FC', 'fc_chelsea', 'official_chelsea', 'man_united', 'ManUnited']) {
        const res = await setUsername(u, bad).expect(400);
        expect(res.body.code).toBe('username_not_allowed');
      }
      // near misses are fine
      await setUsername(u, 'chelsea_9').expect(200);
    });

    it('allows an ordinary handle and lower-cases it', async () => {
      const u = await createUser('Plain Person');
      const res = await setUsername(u, 'Tunde_Strikes').expect(200);
      expect(res.body.username).toBe('tunde_strikes');
      expect(res.body.profileComplete).toBe(true);
    });

    it('two racing claims on one free handle: exactly one wins, the other is a 409', async () => {
      const a = await createUser('Player A');
      const b = await createUser('Player B');
      const [ra, rb] = await Promise.all([setUsername(a, 'same_handle'), setUsername(b, 'same_handle')]);
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
    });
  });

  describe('B-032: the change cooldown', () => {
    it('a first choice and ONE correction are free; a second change inside 30 days is a 429 with the date it opens', async () => {
      const u = await createUser('Plain Person');
      await setUsername(u, 'first_pick').expect(200);
      expect((await dbUser(u.id)).usernameChangedAt).toBeNull(); // first choice starts no clock

      await setUsername(u, 'second_pick').expect(200);
      const afterChange = await dbUser(u.id);
      expect(afterChange.usernameChangedAt).toBeInstanceOf(Date);

      const blocked = await setUsername(u, 'third_pick').expect(429);
      expect(blocked.body.code).toBe('username_change_cooldown');
      expect(new Date(blocked.body.availableAt).getTime()).toBe(afterChange.usernameChangedAt!.getTime() + 30 * DAY);
      expect((await dbUser(u.id)).username).toBe('second_pick');
    });

    it('re-sending the current handle never starts or restarts the cooldown', async () => {
      const u = await createUser('Plain Person', 'keep_this');
      await setUsername(u, 'Keep_This').expect(200);
      expect((await dbUser(u.id)).usernameChangedAt).toBeNull();
      await setUsername(u, 'keep_this').expect(200);
      expect((await dbUser(u.id)).usernameChangedAt).toBeNull();
    });

    it('opens again once 30 days have passed', async () => {
      const u = await createUser('Plain Person', 'old_pick', { usernameChangedAt: new Date(Date.now() - 31 * DAY) });
      await setUsername(u, 'new_pick').expect(200);
      expect((await dbUser(u.id)).username).toBe('new_pick');
    });

    it('two concurrent changes cannot both pass: one 200, the other a 409 (lost lock) or a 429 (cooldown already running)', async () => {
      const u = await createUser('Plain Person', 'start_pick');
      const [r1, r2] = await Promise.all([setUsername(u, 'race_one'), setUsername(u, 'race_two')]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses[0]).toBe(200);
      expect([409, 429]).toContain(statuses[1]);
      expect(['race_one', 'race_two']).toContain((await dbUser(u.id)).username);
    });
  });

  // ------------------------------------------------------------- B-033 revoke
  describe('B-033: POST /admin/users/:id/username-revoke', () => {
    const REASON = 'Impersonates an official account, reported twice';
    const revoke = (admin: { token: string }, id: string, body: unknown = { reason: REASON }) =>
      request(server()).post(`/admin/users/${id}/username-revoke`).set(bearer(admin.token)).send(body as object);

    it('removes the username in ONE transaction: user cleared, hold recorded, audit row with the reason, user emailed', async () => {
      const mod = await createAdmin('moderator');
      const u = await createUser('Ada Obi', 'club_official9', { usernameChangedAt: new Date() });

      const res = await revoke(mod, u.id).expect(200);
      expect(res.body.revokedUsername).toBe('club_official9');

      const row = await dbUser(u.id);
      expect(row.username).toBeNull();
      expect(row.usernameChangedAt).toBeNull();

      const rev = await prisma().revokedUsername.findMany({ where: { userId: u.id } });
      expect(rev).toHaveLength(1);
      expect(rev[0]!.username).toBe('club_official9');
      expect(rev[0]!.holdUntil.getTime() - rev[0]!.revokedAt.getTime()).toBe(30 * DAY);

      const logs = await prisma().adminActionLog.findMany({ where: { action: 'user.username_revoked' } });
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({ adminId: mod.id, targetType: 'user', targetId: u.id });
      expect(logs[0]!.notes).toContain('username=club_official9');
      expect(logs[0]!.notes).toContain(`reason=${REASON}`);

      expect(emailSpy).toHaveBeenCalledTimes(1);
      expect(emailSpy).toHaveBeenCalledWith(u.email, 'Ada Obi');
    });

    it('puts the account back in the incomplete-profile gate on its EXISTING token: placeholder name, create_profile, cannot post', async () => {
      const mod = await createAdmin('superadmin');
      const u = await createUser('Ada Obi', 'club_official9');
      await request(server()).post('/posts').set(bearer(u.token)).send({ contentText: 'before' }).expect(201);

      await revoke(mod, u.id).expect(200);

      const me = await request(server()).get(`/users/${u.id}`).set(bearer(u.token)).expect(200);
      expect(me.body).toMatchObject({ username: null, publicName: 'Soccernity member', profileComplete: false, nextStep: 'create_profile' });
      const blocked = await request(server()).post('/posts').set(bearer(u.token)).send({ contentText: 'after' }).expect(403);
      expect(blocked.body.code).toBe('profile_incomplete');
      // content already published stays, shown under the placeholder
      const posts = await prisma().post.count({ where: { authorId: u.id } });
      expect(posts).toBe(1);
    });

    it('the user can then choose a NEW username with no cooldown, and is complete again', async () => {
      const mod = await createAdmin('moderator');
      const u = await createUser('Ada Obi', 'club_official9', { usernameChangedAt: new Date() });
      await revoke(mod, u.id).expect(200);
      const res = await setUsername(u, 'fresh_start_7').expect(200);
      expect(res.body).toMatchObject({ username: 'fresh_start_7', profileComplete: true, nextStep: 'none' });
      await request(server()).post('/posts').set(bearer(u.token)).send({ contentText: 'back' }).expect(201);
    });

    it('the revoked handle is HELD 30 days for everyone else (looks taken) and free again afterwards', async () => {
      const mod = await createAdmin('moderator');
      const ada = await createUser('Ada Obi', 'zed_striker');
      const ben = await createUser('Ben Cole');
      await revoke(mod, ada.id).expect(200);

      const held = await setUsername(ben, 'zed_striker').expect(409);
      expect(held.body.message).toBe('That username is already taken');
      expect((await dbUser(ben.id)).username).toBeNull();

      await prisma().revokedUsername.updateMany({ data: { holdUntil: new Date(Date.now() - 1000) } });
      await setUsername(ben, 'zed_striker').expect(200);
    });

    it('the revoked user can NEVER re-pick it, not even after the hold has ended', async () => {
      const mod = await createAdmin('moderator');
      const ada = await createUser('Ada Obi', 'zed_striker');
      await revoke(mod, ada.id).expect(200);

      const during = await setUsername(ada, 'zed_striker').expect(400);
      expect(during.body.code).toBe('username_not_allowed');

      await prisma().revokedUsername.updateMany({ data: { holdUntil: new Date(Date.now() - 400 * DAY) } });
      const after = await setUsername(ada, 'Zed_Striker').expect(400);
      expect(after.body.code).toBe('username_not_allowed');
      expect((await dbUser(ada.id)).username).toBeNull();
    });

    it('is refused for an editor (403), a missing or short reason (400), and an unknown field (400), with nothing changed', async () => {
      const editor = await createAdmin('editor');
      const mod = await createAdmin('moderator');
      const u = await createUser('Ada Obi', 'keep_handle');
      await revoke(editor, u.id).expect(403);
      await revoke(mod, u.id, {}).expect(400);
      await revoke(mod, u.id, { reason: 'bad' }).expect(400);
      await revoke(mod, u.id, { reason: REASON, username: 'x_y_z' }).expect(400);
      expect((await dbUser(u.id)).username).toBe('keep_handle');
      expect(await prisma().revokedUsername.count()).toBe(0);
      expect(await prisma().adminActionLog.count()).toBe(0);
      expect(emailSpy).not.toHaveBeenCalled();
    });

    it('404 for an unknown user; 409 for a user with no username (second revoke) and for an anonymized account', async () => {
      const mod = await createAdmin('moderator');
      await revoke(mod, '00000000-0000-4000-8000-000000000000').expect(404);

      const u = await createUser('Ada Obi', 'club_official9');
      await revoke(mod, u.id).expect(200);
      await revoke(mod, u.id).expect(409);

      const gone = await createUser('[deleted user]', null, { accountStatus: 'deleted' });
      await revoke(mod, gone.id).expect(409);
      expect(await prisma().adminActionLog.count()).toBe(1);
      expect(emailSpy).toHaveBeenCalledTimes(1);
    });

    it('a user token cannot reach the admin route (separate auth domain)', async () => {
      const u = await createUser('Ada Obi', 'club_official9');
      await request(server()).post(`/admin/users/${u.id}/username-revoke`).set(bearer(u.token)).send({ reason: REASON }).expect(401);
      expect((await dbUser(u.id)).username).toBe('club_official9');
    });

    it('GET /admin/users/:id lists the revocations (handle, when, hold end) and never the reason', async () => {
      const mod = await createAdmin('moderator');
      const u = await createUser('Ada Obi', 'club_official9');
      await revoke(mod, u.id).expect(200);
      const detail = await request(server()).get(`/admin/users/${u.id}`).set(bearer(mod.token)).expect(200);
      expect(detail.body.username).toBeNull();
      expect(detail.body.usernameRevocations).toHaveLength(1);
      expect(detail.body.usernameRevocations[0]).toMatchObject({ username: 'club_official9' });
      expect(new Date(detail.body.usernameRevocations[0].heldUntil).getTime()).toBeGreaterThan(Date.now() + 29 * DAY);
      expect(JSON.stringify(detail.body.usernameRevocations)).not.toContain('Impersonates');
    });

    it('revoke -> re-pick another -> revoke again keeps BOTH handles barred for that user', async () => {
      const mod = await createAdmin('moderator');
      const u = await createUser('Ada Obi', 'first_bad_one');
      await revoke(mod, u.id).expect(200);
      await setUsername(u, 'second_bad_one').expect(200);
      await revoke(mod, u.id).expect(200);
      await setUsername(u, 'first_bad_one').expect(400);
      await setUsername(u, 'second_bad_one').expect(400);
      await setUsername(u, 'third_try_ok').expect(200);
      expect(await prisma().revokedUsername.count({ where: { userId: u.id } })).toBe(2);
    });
  });

  // ------------------------------------------------------------ B-034 keyset
  describe('B-034: rosters and people search page by username, never by (or with) the real name', () => {
    // Real names are the OPPOSITE order of the usernames on purpose: if anything
    // still ordered by displayName the assertions below would fail.
    const FIXTURE = [
      { displayName: 'Zed Realname', username: 'aaa_user' },
      { displayName: 'Yan Realname', username: 'bbb_user' },
      { displayName: 'Xia Realname', username: 'ccc_user' },
      { displayName: 'Wes Realname', username: null },
      { displayName: 'Vic Realname', username: null },
    ];

    async function seedPeople() {
      const out: Array<{ id: string; displayName: string; username: string | null }> = [];
      for (const f of FIXTURE) {
        const u = await createUser(f.displayName, f.username);
        out.push({ id: u.id, ...f });
      }
      const viewer = await createUser('Viewer Person', 'viewer_one');
      return { people: out, viewer };
    }

    async function walk(urlFor: (cursor?: string) => string, token: string) {
      const items: Array<{ id: string; publicName: string }> = [];
      const cursors: string[] = [];
      let cursor: string | undefined;
      for (let i = 0; i < 10; i += 1) {
        const res = await request(server()).get(urlFor(cursor)).set(bearer(token)).expect(200);
        items.push(...res.body.items);
        if (!res.body.nextCursor) return { items, cursors };
        cursors.push(res.body.nextCursor);
        cursor = res.body.nextCursor;
      }
      throw new Error('did not terminate');
    }

    function assertNoRealNames(cursors: string[], body: unknown) {
      for (const c of cursors) {
        const decoded = Buffer.from(c, 'base64url').toString('utf8');
        expect(decoded).not.toContain('Realname');
        expect(Object.keys(JSON.parse(decoded)).sort()).toEqual(['id', 'username']);
      }
      expect(JSON.stringify(body)).not.toContain('Realname');
    }

    it('club roster: usernames ascending, then the no-username group by id; no gaps or repeats across pages; cursor has no real name', async () => {
      const { people, viewer } = await seedPeople();
      const club = await prisma().clubPage.create({ data: { name: 'Roster FC', league: 'L', country: 'C', memberCount: 0 } });
      for (const p of [...people, { id: viewer.id }]) {
        await prisma().clubPage.update({ where: { id: club.id }, data: { members: { connect: { id: p.id } } } });
      }
      const { items, cursors } = await walk((c) => `/clubs/${club.id}/members?limit=2${c ? `&cursor=${c}` : ''}`, viewer.token);

      const expectedNamed = ['aaa_user', 'bbb_user', 'ccc_user', 'viewer_one'];
      expect(items.slice(0, 4).map((i) => i.publicName)).toEqual(expectedNamed);
      const nullIds = people.filter((p) => !p.username).map((p) => p.id).sort();
      expect(items.slice(4).map((i) => i.id)).toEqual(nullIds);
      expect(items.slice(4).every((i) => i.publicName === 'Soccernity member')).toBe(true);
      expect(new Set(items.map((i) => i.id)).size).toBe(6);
      expect(cursors.length).toBeGreaterThanOrEqual(2);
      assertNoRealNames(cursors, items);
    });

    it('community group roster: same order and the same cursor guarantees', async () => {
      const { people, viewer } = await seedPeople();
      const group = await prisma().communityGroup.create({
        data: { name: 'Roster Group', nameNormalized: 'roster group', city: 'Lagos', createdById: viewer.id, memberCount: 6 },
      });
      for (const p of [...people, { id: viewer.id }]) {
        await prisma().communityGroupMember.create({ data: { userId: p.id, communityGroupId: group.id } });
      }
      const { items, cursors } = await walk((c) => `/community-groups/${group.id}/members?limit=2${c ? `&cursor=${c}` : ''}`, viewer.token);
      expect(items.slice(0, 4).map((i) => i.publicName)).toEqual(['aaa_user', 'bbb_user', 'ccc_user', 'viewer_one']);
      expect(new Set(items.map((i) => i.id)).size).toBe(6);
      assertNoRealNames(cursors, items);
    });

    it('people search: matches and orders by username, cursor never carries a real name', async () => {
      const { viewer } = await seedPeople();
      const { items, cursors } = await walk(
        (c) => `/search?scope=users&q=_user&limit=1${c ? `&cursor=${c}` : ''}`,
        viewer.token,
      );
      expect(items.map((i) => i.publicName)).toEqual(['aaa_user', 'bbb_user', 'ccc_user']);
      expect(cursors).toHaveLength(2);
      assertNoRealNames(cursors, items);
    });

    it('a legacy displayName-keyed cursor is refused with a 400 on all three lists', async () => {
      const { viewer } = await seedPeople();
      const club = await prisma().clubPage.create({ data: { name: 'Legacy FC', league: 'L', country: 'C', memberCount: 0 } });
      const group = await prisma().communityGroup.create({
        data: { name: 'Legacy Group', nameNormalized: 'legacy group', city: 'Lagos', createdById: viewer.id, memberCount: 0 },
      });
      const legacyClub = Buffer.from(JSON.stringify({ name: 'Zed Realname', id: viewer.id })).toString('base64url');
      const legacySearch = Buffer.from(JSON.stringify({ displayName: 'Zed Realname', id: viewer.id })).toString('base64url');
      await request(server()).get(`/clubs/${club.id}/members?cursor=${legacyClub}`).set(bearer(viewer.token)).expect(400);
      await request(server()).get(`/community-groups/${group.id}/members?cursor=${legacyClub}`).set(bearer(viewer.token)).expect(400);
      await request(server()).get(`/search?scope=users&q=user&cursor=${legacySearch}`).set(bearer(viewer.token)).expect(400);
    });
  });
});
