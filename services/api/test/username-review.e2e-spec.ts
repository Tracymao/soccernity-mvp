import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { RedisService } from '../src/redis/redis.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------------------------------------------------
// B-139 part (c) (Decision Log #467): the revoked-username REVIEW route, against the REAL app, real Postgres and
// real Redis. The only fake is the email sender (a recorder standing in for every RegistrationEmailService), so the
// test reads exactly what would have been sent and to whom.
//
// WHAT IS PROVEN HERE THAT A MOCK CANNOT SHOW
//   - a real revoke (POST /admin/users/:id/username-revoke) leads to a request the user can make, and a DIFFERENT
//     admin can decide, end to end through the real guards;
//   - the raw SQL of the list and of the decide lookup: the revoker (column, else the audit-log row), the minor
//     rule, keyset paging, and that no date of birth or contact detail can come back;
//   - a decision is ONE transaction: a failing audit write (a real trigger) leaves the user, the record and the
//     request untouched;
//   - races: two simultaneous requests, and the unique index on the handle;
//   - the cascade: deleting the revoked-username record deletes its request, and anonymisation deletes it too;
//   - the audit-log reader hides a row about a minor from an unvetted admin;
//   - the migration, replayed over a database that already holds revoked-username rows.
// ---------------------------------------------------------------------------------------------------------------

jest.setTimeout(240_000);

const DAY = 24 * 60 * 60 * 1000;
const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const REASON = 'Looked at the account history and the report; the handle is fine.';
const SECRET_REASON = 'A private moderator reason that no user or guardian may see';

type SentCall = { method: string; args: unknown[] };

describe('Username review route (B-139 part (c)) -- real Postgres + real Redis', () => {
  let app: INestApplication;
  let redis: RedisService;
  const sent: SentCall[] = [];
  let failSafetyEmail = false;
  const priorRateLimit = process.env.AUTH_RATE_LIMIT_MAX;
  const http = () => request(app.getHttpServer());
  const prisma = () => getTestPrismaClient();

  const safetyNotices = () => sent.filter((c) => c.method === 'sendGuardianSafetyNoticeEmail');
  // The real revoke that sets each scenario up already sends its own 'username_removed' notice to a minor's
  // guardian (B-279). These are the notices THIS route sends: the two review outcomes.
  const reviewNotices = () =>
    safetyNotices().filter((c) => /restored the username|reviewed the removal/.test((c.args as string[])[2]));

  // One recorder for every RegistrationEmailService instance. Only send* methods exist (answering every property
  // would make it look like a thenable and Nest would hang).
  const emailRecorder = new Proxy(
    {},
    {
      get: (_t, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          if (name === 'sendGuardianSafetyNoticeEmail' && failSafetyEmail) return Promise.reject(new Error('mail down'));
          return Promise.resolve(name === 'sendLoginLockoutNoticeEmail' ? true : undefined);
        };
      },
    },
  );

  beforeAll(async () => {
    // Many calls to the @AuthRateLimit() route; the limit itself is proved in its own describe at the end.
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue(emailRecorder)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
    redis = app.get(RedisService);
  });

  beforeEach(async () => {
    await resetDatabase();
    const keys = await redis.keys('guardian-security-notice:*');
    if (keys.length > 0) await redis.del(...keys);
    sent.length = 0;
    failSafetyEmail = false;
  });

  afterAll(async () => {
    if (priorRateLimit === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = priorRateLimit;
    await app.close();
    await disconnectTestPrismaClient();
  });

  // ---------------------------------------------------------------- helpers

  type SeedOpts = {
    username?: string | null;
    isMinor?: boolean;
    consent?: string | null; // Guardian.consentStatus for a minor; null = no Guardian row
    accountStatus?: string;
    verificationStatus?: string;
    displayName?: string;
  };
  type U = { id: string; auth: { Authorization: string }; guardianEmail: string | null; displayName: string };

  async function seedUser(opts: SeedOpts = {}): Promise<U> {
    const isMinor = opts.isMinor ?? false;
    const displayName = opts.displayName ?? 'Ada Obi';
    const user = await prisma().user.create({
      data: {
        email: `rev-${rand()}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName,
        username: opts.username === undefined ? `u_${rand()}` : opts.username,
        dateOfBirth: seedDob(isMinor ? '2012-06-01' : '1990-01-01'),
        isMinor,
        verificationStatus: opts.verificationStatus ?? 'verified',
        accountStatus: opts.accountStatus ?? 'active',
      },
    });
    const consent = opts.consent === undefined ? 'confirmed' : opts.consent;
    const guardianEmail = `guardian-${rand()}@example.com`;
    if (isMinor && consent !== null) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: guardianEmail,
          relationship: 'Parent',
          consentToken: `consent-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: consent,
        },
      });
    }
    const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return {
      id: user.id,
      auth: bearer(pair.accessToken.token),
      guardianEmail: isMinor && consent !== null ? guardianEmail : null,
      displayName,
    };
  }

  type Admin = { id: string; auth: { Authorization: string }; fullName: string };
  async function seedAdmin(role = 'moderator', vetted = false, fullName = `Admin ${rand()}`): Promise<Admin> {
    const admin = await prisma().adminUser.create({
      data: { email: `rev-admin-${rand()}@example.com`, passwordHash: 'unused', fullName, role, childSafetyVetted: vetted },
    });
    const token = (await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token;
    return { id: admin.id, auth: bearer(token), fullName };
  }

  /** A REAL revoke through the admin route. Returns the RevokedUsername record it wrote. */
  async function revoke(admin: Admin, user: U, handle: string) {
    await prisma().user.update({ where: { id: user.id }, data: { username: handle } });
    await http().post(`/admin/users/${user.id}/username-revoke`).set(admin.auth).send({ reason: SECRET_REASON }).expect(200);
    return prisma().revokedUsername.findFirstOrThrow({ where: { userId: user.id, username: handle } });
  }

  const askForReview = (u: U, body: Record<string, unknown> = {}) => http().post('/users/me/username-review').set(u.auth).send(body);
  const reviewStatus = (u: U) => http().get('/users/me/username-review').set(u.auth);
  const decide = (a: Admin, requestId: string, decision: string, reason: string = REASON) =>
    http().post(`/admin/username-reviews/${requestId}/decide`).set(a.auth).send({ decision, reason });
  const list = (a: Admin, qs = '') => http().get(`/admin/username-reviews${qs}`).set(a.auth);
  const requestOf = (revokedUsernameId: string) => prisma().usernameReviewRequest.findUniqueOrThrow({ where: { revokedUsernameId } });
  const dbUser = (id: string) => prisma().user.findUniqueOrThrow({ where: { id } });
  const auditRows = (targetId: string) =>
    prisma().adminActionLog.findMany({ where: { action: 'user.username_review_decided', targetId } });
  async function waitForReviewNotices(count: number) {
    const deadline = Date.now() + 5_000;
    while (reviewNotices().length < count && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
  }
  const settle = () => new Promise((r) => setTimeout(r, 400));

  /** revoke -> ask: a pending request, ready for another admin. */
  async function pendingRequest(opts: { revoker?: Admin; user?: U; handle?: string; message?: string } = {}) {
    const revoker = opts.revoker ?? (await seedAdmin('moderator', true));
    const user = opts.user ?? (await seedUser());
    const handle = opts.handle ?? `old_${rand()}`;
    const record = await revoke(revoker, user, handle);
    await askForReview(user, opts.message === undefined ? {} : { message: opts.message }).expect(201);
    return { revoker, user, handle, record, request: await requestOf(record.id) };
  }

  // =============================================================== the user's two routes

  describe('GET and POST /users/me/username-review', () => {
    it('a user with a username, and a user who was never revoked, read as none', async () => {
      const withName = await seedUser();
      const noName = await seedUser({ username: null });
      expect((await reviewStatus(withName).expect(200)).body).toEqual({ state: 'none', requestableUntil: null });
      expect((await reviewStatus(noName).expect(200)).body).toEqual({ state: 'none', requestableUntil: null });
    });

    it('after a REAL revoke the user can ask; the window ends at the end of the UTC day 30 days after revokedAt', async () => {
      const admin = await seedAdmin();
      const user = await seedUser();
      const record = await revoke(admin, user, 'chelsea_fc');
      const r = record.revokedAt;
      // 30 days later, then to the end of that UTC day = midnight at the start of day (revokedAt + 31 days).
      const expected = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth(), r.getUTCDate() + 31)).toISOString();
      expect((await reviewStatus(user).expect(200)).body).toEqual({ state: 'can_request', requestableUntil: expected });
    });

    it('the revoke records WHO revoked, on the record', async () => {
      const admin = await seedAdmin();
      const record = await revoke(admin, await seedUser(), 'someone_fc');
      expect(record.revokedByAdminId).toBe(admin.id);
    });

    it('asking stores the request tied to that revocation (message trimmed), reads as pending, and cannot be repeated', async () => {
      const admin = await seedAdmin();
      const user = await seedUser();
      const record = await revoke(admin, user, 'my_handle');

      const res = await askForReview(user, { message: '  Please look again.  ' }).expect(201);
      expect(res.body).toEqual({ state: 'pending', requestableUntil: null });
      const row = await requestOf(record.id);
      expect(row).toMatchObject({ userId: user.id, message: 'Please look again.', status: 'pending', decidedAt: null, decidedByAdminId: null });
      expect((await reviewStatus(user).expect(200)).body).toEqual({ state: 'pending', requestableUntil: null });

      const again = await askForReview(user, { message: 'second try' }).expect(409);
      expect(again.body.code).toBe('username_review_already_requested');
      expect(await prisma().usernameReviewRequest.count()).toBe(1);
    });

    it('the message is optional (stored as NULL) and a 501-character message is a coded 400 that stores nothing', async () => {
      const admin = await seedAdmin();
      const quiet = await seedUser();
      const record = await revoke(admin, quiet, 'quiet_one');
      await askForReview(quiet, {}).expect(201);
      expect((await requestOf(record.id)).message).toBeNull();

      const wordy = await seedUser();
      await revoke(admin, wordy, 'wordy_one');
      const res = await askForReview(wordy, { message: 'a'.repeat(501) }).expect(400);
      expect(res.body.code).toBe('username_review_message_invalid');
      expect(await prisma().usernameReviewRequest.count()).toBe(1);
      // and exactly 500 is fine
      await askForReview(wordy, { message: 'b'.repeat(500) }).expect(201);
    });

    it('the 30-day edge: 30 days ago is still open for the whole UTC day; 31 days ago is closed, and reads as none', async () => {
      const admin = await seedAdmin();
      const open = await seedUser();
      const closed = await seedUser();
      const recOpen = await revoke(admin, open, 'edge_open');
      const recClosed = await revoke(admin, closed, 'edge_closed');
      await prisma().revokedUsername.update({ where: { id: recOpen.id }, data: { revokedAt: new Date(Date.now() - 30 * DAY) } });
      await prisma().revokedUsername.update({ where: { id: recClosed.id }, data: { revokedAt: new Date(Date.now() - 31 * DAY) } });

      expect((await reviewStatus(open).expect(200)).body.state).toBe('can_request');
      await askForReview(open).expect(201);

      expect((await reviewStatus(closed).expect(200)).body).toEqual({ state: 'none', requestableUntil: null });
      const res = await askForReview(closed).expect(403);
      expect(res.body.code).toBe('username_review_window_closed');
      expect(await prisma().usernameReviewRequest.count()).toBe(1);
    });

    it('not available (403, one code): the user has a username, was never revoked, or the account is closed', async () => {
      const admin = await seedAdmin();
      const hasName = await seedUser();
      const never = await seedUser({ username: null });
      const closed = await seedUser();
      await revoke(admin, closed, 'closed_acct');
      await prisma().user.update({ where: { id: closed.id }, data: { accountStatus: 'deactivated' } });
      // the first revoked user then chose a new username: nothing left to review
      const chose = await seedUser();
      await revoke(admin, chose, 'chose_new');
      await prisma().user.update({ where: { id: chose.id }, data: { username: 'brand_new_pick' } });

      for (const u of [hasName, never, closed, chose]) {
        const res = await askForReview(u).expect(403);
        expect(res.body.code).toBe('username_review_not_available');
      }
      expect(await prisma().usernameReviewRequest.count()).toBe(0);
    });

    it('needs a signed-in user', async () => {
      await http().get('/users/me/username-review').expect(401);
      await http().post('/users/me/username-review').send({}).expect(401);
    });

    it('works for an account the other guards would refuse: a restricted-pending minor and an unverified email, no username', async () => {
      const admin = await seedAdmin();
      const restricted = await seedUser({ isMinor: true, consent: 'pending' });
      const unverified = await seedUser({ verificationStatus: 'unverified' });
      await revoke(admin, restricted, 'restricted_one');
      await revoke(admin, unverified, 'unverified_one');
      await askForReview(restricted, { message: 'I am a minor with pending consent' }).expect(201);
      await askForReview(unverified).expect(201);
    });

    it('two simultaneous requests: the unique index lets exactly one through', async () => {
      const admin = await seedAdmin();
      const user = await seedUser();
      await revoke(admin, user, 'racing_one');
      const [a, b] = await Promise.all([askForReview(user, { message: 'one' }), askForReview(user, { message: 'two' })]);
      expect([a.status, b.status].sort()).toEqual([201, 409]);
      expect(await prisma().usernameReviewRequest.count()).toBe(1);
    });

    it('concerns the LATEST revocation when a user was revoked twice', async () => {
      const admin = await seedAdmin();
      const user = await seedUser();
      const first = await revoke(admin, user, 'first_handle');
      await askForReview(user).expect(201); // a request for the first revocation
      await prisma().revokedUsername.update({ where: { id: first.id }, data: { revokedAt: new Date(Date.now() - 5 * DAY) } });
      const second = await revoke(admin, user, 'second_handle');
      expect((await reviewStatus(user).expect(200)).body.state).toBe('can_request'); // the new revocation has none yet
      await askForReview(user).expect(201);
      expect(await requestOf(second.id)).toBeDefined();
      expect(await prisma().usernameReviewRequest.count()).toBe(2);
    });
  });

  // =============================================================== the admin list

  describe('GET /admin/username-reviews', () => {
    it('401 without a token, 403 for an editor, 200 for a moderator and a superadmin', async () => {
      await http().get('/admin/username-reviews').expect(401);
      await list(await seedAdmin('editor')).expect(403);
      await list(await seedAdmin('moderator')).expect(200);
      await list(await seedAdmin('superadmin')).expect(200);
    });

    it('returns exactly the fields the screen needs and NEVER a date of birth or a contact detail', async () => {
      const { request: req, handle, user, revoker } = await pendingRequest({ message: 'Please look again' });
      const other = await seedAdmin('moderator');
      const res = await list(other).expect(200);
      expect(res.body.items).toHaveLength(1);
      const item = res.body.items[0];
      expect(Object.keys(item).sort()).toEqual(
        ['createdAt', 'id', 'message', 'removedUsername', 'revokedAt', 'revokedBy', 'status', 'userDisplayName', 'userId'].sort(),
      );
      expect(item).toMatchObject({
        id: req.id,
        status: 'pending',
        message: 'Please look again',
        removedUsername: handle,
        userId: user.id,
        userDisplayName: 'Ada Obi',
        revokedBy: { displayName: revoker.fullName },
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/dateOfBirth|email|phone|passwordHash|guardian/i);
      expect(text).not.toContain(SECRET_REASON);
    });

    it('the REVOKING admin does not see their own revocation\'s request; another admin does', async () => {
      const { revoker } = await pendingRequest();
      expect((await list(revoker).expect(200)).body.items).toHaveLength(0);
      expect((await list(await seedAdmin('superadmin')).expect(200)).body.items).toHaveLength(1);
    });

    it('older rows with no revokedByAdminId fall back to the audit-log row; with neither, the revoker is unknown and nobody is excluded', async () => {
      const a = await seedAdmin('moderator', false, 'Original Revoker');
      const b = await seedAdmin('moderator');
      // (1) the audit row exists, the column is NULL (a row written before the column existed)
      const u1 = await seedUser();
      const rec1 = await revoke(a, u1, 'old_audited');
      await prisma().revokedUsername.update({ where: { id: rec1.id }, data: { revokedByAdminId: null } });
      await askForReview(u1).expect(201);
      // (2) neither
      const u2 = await seedUser();
      const rec2 = await prisma().revokedUsername.create({
        data: { username: 'old_orphan', userId: u2.id, revokedAt: new Date(), holdUntil: new Date(Date.now() + 30 * DAY) },
      });
      await prisma().user.update({ where: { id: u2.id }, data: { username: null } });
      await askForReview(u2).expect(201);

      const asA = (await list(a).expect(200)).body.items;
      expect(asA.map((i: { removedUsername: string }) => i.removedUsername)).toEqual(['old_orphan']); // not their own audited one
      const asB = (await list(b).expect(200)).body.items;
      const byHandle = Object.fromEntries(asB.map((i: { removedUsername: string; revokedBy: unknown }) => [i.removedUsername, i.revokedBy]));
      expect(byHandle).toEqual({ old_audited: { displayName: 'Original Revoker' }, old_orphan: null });

      // and the decide check uses the same definition: A may not decide the audited one, B may
      await decide(a, (await requestOf(rec1.id)).id, 'decline').expect(403);
      await decide(b, (await requestOf(rec1.id)).id, 'decline').expect(200);
      expect(rec2.id).toBeDefined();
    });

    it('a MINOR\'s request is absent for an unvetted admin and present for a vetted one; a deleted account is never listed', async () => {
      const minor = await seedUser({ isMinor: true });
      const revoker = await seedAdmin('moderator', true);
      await pendingRequest({ revoker, user: minor });
      const adult = await seedUser();
      await pendingRequest({ revoker, user: adult });
      const gone = await seedUser();
      const { request: goneReq } = await pendingRequest({ revoker, user: gone });
      await prisma().user.update({ where: { id: gone.id }, data: { accountStatus: 'deleted' } });

      const unvetted = (await list(await seedAdmin('superadmin', false)).expect(200)).body.items;
      expect(unvetted.map((i: { userId: string }) => i.userId)).toEqual([adult.id]);
      const vetted = (await list(await seedAdmin('moderator', true)).expect(200)).body.items;
      expect(vetted.map((i: { userId: string }) => i.userId).sort()).toEqual([adult.id, minor.id].sort());
      expect(vetted.map((i: { id: string }) => i.id)).not.toContain(goneReq.id);
    });

    it('filters by status and rejects an unknown one', async () => {
      const { request: pending } = await pendingRequest();
      const { request: toDecline } = await pendingRequest();
      const decider = await seedAdmin('moderator');
      await decide(decider, toDecline.id, 'decline').expect(200);
      const ids = async (qs: string) => (await list(decider, qs).expect(200)).body.items.map((i: { id: string }) => i.id);
      expect(await ids('?status=pending')).toEqual([pending.id]);
      expect(await ids('?status=declined')).toEqual([toDecline.id]);
      expect(await ids('?status=reinstated')).toEqual([]);
      await list(decider, '?status=maybe').expect(400);
    });

    it('pages newest first with a keyset cursor: no gaps or repeats, even with identical timestamps', async () => {
      const revoker = await seedAdmin('moderator', true);
      const ids: string[] = [];
      for (let i = 0; i < 5; i += 1) ids.push((await pendingRequest({ revoker })).request.id);
      // identical createdAt for three of them
      const tie = new Date('2026-11-01T12:00:00.000Z');
      await prisma().usernameReviewRequest.updateMany({ where: { id: { in: ids.slice(0, 3) } }, data: { createdAt: tie } });

      const reader = await seedAdmin('moderator');
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 10; guard += 1) {
        const res: request.Response = await list(reader, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`).expect(200);
        seen.push(...res.body.items.map((i: { id: string }) => i.id));
        cursor = res.body.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect([...seen].sort()).toEqual([...ids].sort());
      await list(reader, '?cursor=garbage').expect(400);
    });
  });

  // =============================================================== deciding

  describe('POST /admin/username-reviews/:id/decide', () => {
    it('REINSTATE: the username comes back, the record and the request are gone, ONE audit row, a notification, no cooldown burnt', async () => {
      const { request: req, user, handle, record, revoker } = await pendingRequest();
      const decider = await seedAdmin('moderator');

      const res = await decide(decider, req.id, 'reinstate', `  ${REASON}  `).expect(200);
      expect(res.body).toMatchObject({ id: req.id, status: 'reinstated' });

      const after = await dbUser(user.id);
      expect(after.username).toBe(handle);
      expect(after.usernameChangedAt).toBeNull();
      expect(await prisma().revokedUsername.findUnique({ where: { id: record.id } })).toBeNull();
      expect(await prisma().usernameReviewRequest.count()).toBe(0); // cascade

      const audit = await auditRows(user.id);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ adminId: decider.id, targetType: 'user', notes: `decision=reinstate; username=${handle}; reason=${REASON}` });

      // the user reads it in their notification list: outcome only, no reason
      const notes = await http().get('/notifications').set(user.auth).expect(200);
      const n = notes.body.items.find((i: { type: string }) => i.type === 'username_review_decided');
      expect(n).toMatchObject({ payloadRefId: 'reinstated', data: { usernameReview: { outcome: 'reinstated' } } });
      expect(JSON.stringify(notes.body)).not.toContain(REASON);

      expect((await reviewStatus(user).expect(200)).body.state).toBe('none');
      // reinstating neither grants nor burns a change: the first change is free (no cooldown)
      await http().patch(`/users/${user.id}`).set(user.auth).send({ username: `new_${rand()}` }).expect(200);
      expect(revoker.id).not.toBe(decider.id);
    });

    it('DECLINE: the record and the permanent bar stay, the request is declined and final, the user is told', async () => {
      const { request: req, user, handle, record } = await pendingRequest();
      const decider = await seedAdmin('superadmin');

      await decide(decider, req.id, 'decline').expect(200);

      expect(await prisma().revokedUsername.findUnique({ where: { id: record.id } })).not.toBeNull();
      expect(await requestOf(record.id)).toMatchObject({ status: 'declined', decidedByAdminId: decider.id });
      expect((await requestOf(record.id)).decidedAt).toBeInstanceOf(Date);
      expect((await dbUser(user.id)).username).toBeNull();
      expect((await auditRows(user.id))[0].notes).toBe(`decision=decline; username=${handle}; reason=${REASON}`);

      expect((await reviewStatus(user).expect(200)).body).toEqual({ state: 'declined', requestableUntil: null });
      // the permanent bar: the user can never re-pick that handle...
      const bar = await http().patch(`/users/${user.id}`).set(user.auth).send({ username: handle }).expect(400);
      expect(bar.body.code).toBe('username_not_allowed');
      // ...but can choose another, and then there is nothing to review
      await http().patch(`/users/${user.id}`).set(user.auth).send({ username: `fresh_${rand()}` }).expect(200);
      expect((await reviewStatus(user).expect(200)).body.state).toBe('none');

      const notes = await http().get('/notifications').set(user.auth).expect(200);
      expect(notes.body.items.find((i: { type: string }) => i.type === 'username_review_decided').data).toEqual({
        usernameReview: { outcome: 'declined' },
      });
      // final: no second review, and a second decision on the same request is a 409
      const again = await decide(decider, req.id, 'reinstate').expect(409);
      expect(again.body.code).toBe('username_review_not_pending');
    });

    it('the reason is required (10 to 500 after trimming) for both outcomes', async () => {
      const { request: req } = await pendingRequest();
      const decider = await seedAdmin('moderator');
      for (const decision of ['reinstate', 'decline']) {
        const res = await decide(decider, req.id, decision, '   too short ').expect(400);
        expect(res.body.code).toBe('username_review_reason_invalid');
      }
      await decide(decider, req.id, 'decline', 'x'.repeat(501)).expect(400);
      expect(await prisma().usernameReviewRequest.count({ where: { status: 'pending' } })).toBe(1);
    });

    it('the revoking admin gets a coded 403 and nothing changes; a missing id is a coded 404; an editor is a 403', async () => {
      const { request: req, revoker, user } = await pendingRequest();
      const res = await decide(revoker, req.id, 'reinstate').expect(403);
      expect(res.body.code).toBe('username_review_own_revocation');
      expect((await requestOf(req.revokedUsernameId)).status).toBe('pending');
      expect((await dbUser(user.id)).username).toBeNull();

      const missing = await decide(await seedAdmin(), 'no-such-request', 'decline').expect(404);
      expect(missing.body.code).toBe('username_review_not_found');
      await decide(await seedAdmin('editor'), req.id, 'decline').expect(403);
    });

    it('a user who chose a new username since cannot be reinstated (409), and NOTHING is written; declining still works', async () => {
      const { request: req, user } = await pendingRequest();
      await http().patch(`/users/${user.id}`).set(user.auth).send({ username: 'already_new' }).expect(200);
      const decider = await seedAdmin();

      const res = await decide(decider, req.id, 'reinstate').expect(409);
      expect(res.body.code).toBe('username_review_user_has_username');
      expect((await requestOf(req.revokedUsernameId)).status).toBe('pending'); // the claim was rolled back
      expect((await dbUser(user.id)).username).toBe('already_new');
      expect(await auditRows(user.id)).toHaveLength(0);
      expect(await prisma().notification.count({ where: { type: 'username_review_decided' } })).toBe(0);

      await decide(decider, req.id, 'decline').expect(200);
    });

    it('a handle somebody else now holds cannot be restored (409, rolled back): taken by another user, or under their running hold', async () => {
      // (1) the 30-day hold is over and another user took the handle: the unique index on User.username decides
      const takenCase = await pendingRequest();
      await prisma().revokedUsername.update({ where: { id: takenCase.record.id }, data: { holdUntil: new Date(Date.now() - DAY) } });
      await seedUser({ username: takenCase.handle });
      const decider = await seedAdmin();
      const taken = await decide(decider, takenCase.request.id, 'reinstate').expect(409);
      expect(taken.body.code).toBe('username_review_handle_unavailable');
      expect((await requestOf(takenCase.record.id)).status).toBe('pending');
      expect((await dbUser(takenCase.user.id)).username).toBeNull();
      expect(await auditRows(takenCase.user.id)).toHaveLength(0);

      // (2) another user's record on the same handle with a running hold
      const heldCase = await pendingRequest();
      const other = await seedUser({ username: null });
      await prisma().revokedUsername.create({
        data: { username: heldCase.handle, userId: other.id, revokedAt: new Date(), holdUntil: new Date(Date.now() + 10 * DAY) },
      });
      const held = await decide(decider, heldCase.request.id, 'reinstate').expect(409);
      expect(held.body.code).toBe('username_review_handle_unavailable');
      expect((await dbUser(heldCase.user.id)).username).toBeNull();
    });

    it('is ONE transaction: a failing audit write (a real trigger) leaves the user, the record and the request untouched', async () => {
      const { request: req, user, record } = await pendingRequest();
      const decider = await seedAdmin();
      await prisma().$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION test_block_review_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit write blocked for the test'; END; $$ LANGUAGE plpgsql`,
      );
      await prisma().$executeRawUnsafe(
        `CREATE TRIGGER test_block_review_audit BEFORE INSERT ON "AdminActionLog" FOR EACH ROW WHEN (NEW."action" = 'user.username_review_decided') EXECUTE FUNCTION test_block_review_audit()`,
      );
      try {
        await decide(decider, req.id, 'reinstate').expect(500);
        expect((await dbUser(user.id)).username).toBeNull();
        expect(await prisma().revokedUsername.findUnique({ where: { id: record.id } })).not.toBeNull();
        expect(await requestOf(record.id)).toMatchObject({ status: 'pending', decidedAt: null, decidedByAdminId: null });
        expect(await prisma().notification.count({ where: { type: 'username_review_decided' } })).toBe(0);
        await settle();
        expect(reviewNotices()).toHaveLength(0);
      } finally {
        await prisma().$executeRawUnsafe('DROP TRIGGER IF EXISTS test_block_review_audit ON "AdminActionLog"');
        await prisma().$executeRawUnsafe('DROP FUNCTION IF EXISTS test_block_review_audit()');
      }
      // and once the trigger is gone the same request decides normally
      await decide(decider, req.id, 'reinstate').expect(200);
    });

    it('two admins deciding at once: exactly one wins, the other gets the 409', async () => {
      const { request: req } = await pendingRequest();
      const [a, b] = await Promise.all([seedAdmin(), seedAdmin()]);
      const [ra, rb] = await Promise.all([decide(a, req.id, 'reinstate'), decide(b, req.id, 'decline')]);
      expect([ra.status, rb.status].sort()).toEqual([200, 409]);
      // one winner means one audit row and one notification, not two
      expect(await prisma().adminActionLog.count({ where: { action: 'user.username_review_decided' } })).toBe(1);
      expect(await prisma().notification.count({ where: { type: 'username_review_decided' } })).toBe(1);
    });
  });

  // =============================================================== minors, guardians, the audit log

  describe('a minor\'s account', () => {
    it('an UNVETTED admin gets the same 404 as for a missing id; a vetted admin can decide', async () => {
      const minor = await seedUser({ isMinor: true });
      const { request: req } = await pendingRequest({ user: minor, revoker: await seedAdmin('moderator', true) });
      const unvetted = await seedAdmin('superadmin', false);

      const hidden = await decide(unvetted, req.id, 'decline').expect(404);
      const missing = await decide(unvetted, 'no-such-request', 'decline').expect(404);
      expect(hidden.body).toEqual(missing.body);
      expect((await requestOf(req.revokedUsernameId)).status).toBe('pending');

      await decide(await seedAdmin('moderator', true), req.id, 'decline').expect(200);
    });

    it('the guardian gets a KIND-OF-ACTION notice (never the reason or the handle), once', async () => {
      const minor = await seedUser({ isMinor: true, displayName: 'Sam Minor' });
      const { request: req, handle } = await pendingRequest({ user: minor, revoker: await seedAdmin('moderator', true) });
      const decider = await seedAdmin('moderator', true);

      await decide(decider, req.id, 'reinstate', SECRET_REASON).expect(200);
      await waitForReviewNotices(1);
      expect(reviewNotices()).toHaveLength(1);
      const [to, subject, summary] = reviewNotices()[0].args as [string, string, string];
      expect(to).toBe(minor.guardianEmail);
      expect(subject).toBe("An update on Sam Minor's Soccernity account");
      expect(summary).toBe("Soccernity restored the username on Sam Minor's account.");
      expect(JSON.stringify(sent.map((c) => c.args))).not.toContain(SECRET_REASON);
      expect(JSON.stringify(reviewNotices().map((c) => c.args))).not.toContain(handle);
    });

    it('a decline sends the "removal stands" sentence', async () => {
      const minor = await seedUser({ isMinor: true, displayName: 'Sam Minor' });
      const { request: req } = await pendingRequest({ user: minor, revoker: await seedAdmin('moderator', true) });
      await decide(await seedAdmin('moderator', true), req.id, 'decline').expect(200);
      await waitForReviewNotices(1);
      expect((reviewNotices()[0].args as string[])[2]).toBe(
        "Soccernity reviewed the removal of the username on Sam Minor's account. The removal stands.",
      );
    });

    it('with "withhold guardian notices" set, nothing is sent; an adult never triggers one; a failing guardian email never fails the decision', async () => {
      const withheld = await seedUser({ isMinor: true });
      const revoker = await seedAdmin('moderator', true);
      const { request: reqW } = await pendingRequest({ user: withheld, revoker });
      await prisma().guardianNoticeWithhold.create({
        data: { userId: withheld.id, setByAdminId: revoker.id, reason: 'A reason of at least ten characters' },
      });
      await decide(await seedAdmin('moderator', true), reqW.id, 'decline').expect(200);

      const { request: reqA } = await pendingRequest({ revoker });
      await decide(await seedAdmin('moderator'), reqA.id, 'decline').expect(200);

      failSafetyEmail = true;
      const failing = await seedUser({ isMinor: true });
      const { request: reqF } = await pendingRequest({ user: failing, revoker });
      await decide(await seedAdmin('moderator', true), reqF.id, 'decline').expect(200);
      expect((await requestOf(reqF.revokedUsernameId)).status).toBe('declined');

      await settle();
      // the only review notice attempted was the failing one; the withheld minor and the adult sent none
      expect(reviewNotices()).toHaveLength(1);
      expect((reviewNotices()[0].args as string[])[0]).toBe(failing.guardianEmail);
    });
  });

  describe('the audit log', () => {
    it('a decision row about a MINOR is absent from the reader for an unvetted admin and present for a vetted one; about an adult, visible to a superadmin', async () => {
      const minor = await seedUser({ isMinor: true });
      const adult = await seedUser();
      const revoker = await seedAdmin('moderator', true);
      const vetted = await seedAdmin('superadmin', true);
      const unvetted = await seedAdmin('superadmin', false);
      const { request: reqMinor } = await pendingRequest({ user: minor, revoker });
      const { request: reqAdult } = await pendingRequest({ user: adult, revoker });
      await decide(vetted, reqMinor.id, 'decline').expect(200);
      await decide(vetted, reqAdult.id, 'decline').expect(200);

      const rowsFor = async (a: Admin) =>
        (await http().get('/admin/action-log?action=user.username_review_decided').set(a.auth).expect(200)).body.items.map(
          (i: { targetId: string }) => i.targetId,
        );
      expect((await rowsFor(vetted)).sort()).toEqual([adult.id, minor.id].sort());
      expect(await rowsFor(unvetted)).toEqual([adult.id]); // the minor's row is ABSENT, not hidden behind a placeholder
    });
  });

  // =============================================================== retention

  describe('retention', () => {
    it('anonymisation deletes the request at once, even while the 30-day hold still keeps the record; the cleanup removes the record once the hold is over', async () => {
      const { user, record } = await pendingRequest();
      const now = new Date();
      await app.get(AccountDeletionSweepService).anonymizeUser(user.id, false, now);

      expect(await prisma().usernameReviewRequest.count()).toBe(0);
      expect(await prisma().revokedUsername.findUnique({ where: { id: record.id } })).not.toBeNull(); // hold still running

      const later = new Date(now.getTime() + 31 * DAY);
      await app.get(AnonymizedRowPurgeService).cleanupRevokedUsernames(later);
      expect(await prisma().revokedUsername.findUnique({ where: { id: record.id } })).toBeNull();
    });

    it('deleting a revoked-username record deletes its request by cascade (real foreign key)', async () => {
      const { user, record } = await pendingRequest();
      const now = new Date();
      await prisma().revokedUsername.update({ where: { id: record.id }, data: { holdUntil: new Date(now.getTime() - DAY) } });
      await app.get(AccountDeletionSweepService).anonymizeUser(user.id, false, now);
      expect(await prisma().revokedUsername.findUnique({ where: { id: record.id } })).toBeNull();
      expect(await prisma().usernameReviewRequest.count()).toBe(0);
      // and a plain delete of a record with a request cascades too
      const second = await pendingRequest();
      await prisma().revokedUsername.delete({ where: { id: second.record.id } });
      expect(await prisma().usernameReviewRequest.count()).toBe(0);
    });

    it('the database rejects an invalid status, an over-long message and a half-decided row', async () => {
      const second = await pendingRequest();
      const bad = async (data: Record<string, unknown>) =>
        prisma().usernameReviewRequest.update({ where: { id: second.request.id }, data }).then(
          () => 'accepted',
          () => 'rejected',
        );
      expect(await bad({ status: 'maybe' })).toBe('rejected');
      expect(await bad({ status: 'declined' })).toBe('rejected'); // decided but no decidedAt / decidedByAdminId
      expect(await bad({ message: 'a'.repeat(501) })).toBe('rejected');
      expect(await bad({ decidedAt: new Date() })).toBe('rejected'); // a pending request has no decision
      expect(await bad({ status: 'declined', decidedAt: new Date(), decidedByAdminId: 'admin-x' })).toBe('accepted');
    });
  });

  // =============================================================== the migration

  describe('the migration', () => {
    it('20261110090000 applies to a database that already holds revoked-username rows, leaving them intact (rolled back afterwards)', async () => {
      const sql = fs
        .readFileSync(path.join(__dirname, '../prisma/migrations/20261110090000_add_username_review_request/migration.sql'), 'utf8')
        .split(String.fromCharCode(10))
        .filter((l) => !l.trim().startsWith('--'))
        .join(' ');
      const statements = sql.split(';').map((x) => x.trim()).filter(Boolean);
      expect(statements.length).toBeGreaterThan(5);

      const rollback = new Error('rollback');
      const seen: { after: Array<{ username: string; revokedByAdminId: string | null }>; requestWorks: boolean } = {
        after: [],
        requestWorks: false,
      };
      await prisma()
        .$transaction(async (tx) => {
          // Put the schema back to its pre-migration shape, seed rows the way they existed then, replay the migration.
          await tx.$executeRawUnsafe('DROP TABLE "UsernameReviewRequest"');
          await tx.$executeRawUnsafe('ALTER TABLE "RevokedUsername" DROP COLUMN "revokedByAdminId"');
          for (const [id, name] of [['mig-rv-1', 'old_one'], ['mig-rv-2', 'old_two']]) {
            await tx.$executeRawUnsafe(
              `INSERT INTO "RevokedUsername" ("id","username","userId","revokedAt","holdUntil") VALUES ('${id}','${name}','user-${id}',now(),now() + interval '30 days')`,
            );
          }
          for (const statement of statements) await tx.$executeRawUnsafe(statement);
          seen.after = await tx.revokedUsername.findMany({
            where: { id: { in: ['mig-rv-1', 'mig-rv-2'] } },
            select: { username: true, revokedByAdminId: true },
            orderBy: { username: 'asc' },
          });
          await tx.usernameReviewRequest.create({ data: { revokedUsernameId: 'mig-rv-1', userId: 'user-mig-rv-1', message: 'hi' } });
          await tx.revokedUsername.delete({ where: { id: 'mig-rv-1' } });
          seen.requestWorks = (await tx.usernameReviewRequest.count()) === 0; // the cascade is in place
          throw rollback;
        })
        .catch((e) => {
          if (e !== rollback) throw e;
        });
      expect(seen.after).toEqual([
        { username: 'old_one', revokedByAdminId: null },
        { username: 'old_two', revokedByAdminId: null },
      ]);
      expect(seen.requestWorks).toBe(true);
      // Rolled back: the table and the column exist again for the rest of the suite.
      const cols = await prisma().$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM information_schema.columns WHERE (table_name = 'RevokedUsername' AND column_name = 'revokedByAdminId') OR table_name = 'UsernameReviewRequest'`,
      );
      expect(Number(cols[0].n)).toBeGreaterThan(1);
    });
  });
});

// ------------------------------------------------------------------------------------------------------------
// The shared auth rate limit on the POST, with the real (small) limit. Its own app so the main describe's raised
// limit does not apply.
// ------------------------------------------------------------------------------------------------------------
describe('Username review: the rate limit on POST /users/me/username-review (real app, real limit)', () => {
  let app: INestApplication;
  const priorRateLimit = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT_MAX = '2';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue({ sendUsernameRevokedEmail: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    if (priorRateLimit === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = priorRateLimit;
    await app.close();
    await disconnectTestPrismaClient();
  });

  it('the third request from one address inside the window is a 429; the GET is not limited', async () => {
    const prisma = getTestPrismaClient();
    const tokens = app.get(TokenService);
    const users: Array<{ auth: { Authorization: string } }> = [];
    for (let i = 0; i < 3; i += 1) {
      const user = await prisma.user.create({
        data: {
          email: `rl-${rand()}@example.com`,
          passwordHash: 'unused',
          displayName: 'Rate Limited',
          username: null,
          dateOfBirth: seedDob('1990-01-01'),
          isMinor: false,
          verificationStatus: 'verified',
        },
      });
      await prisma.revokedUsername.create({
        data: { username: `rl_${rand()}`, userId: user.id, revokedAt: new Date(), holdUntil: new Date(Date.now() + 30 * DAY) },
      });
      users.push({ auth: bearer((await tokens.issueTokenPair(user.id, user.role)).accessToken.token) });
    }
    const post = (u: { auth: { Authorization: string } }) => request(app.getHttpServer()).post('/users/me/username-review').set(u.auth).send({});
    await post(users[0]).expect(201);
    await post(users[1]).expect(201);
    await post(users[2]).expect(429);
    for (let i = 0; i < 5; i += 1) await request(app.getHttpServer()).get('/users/me/username-review').set(users[2].auth).expect(200);
  });
});
