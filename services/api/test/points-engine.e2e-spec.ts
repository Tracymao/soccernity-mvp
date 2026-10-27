import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { GuardianConsentService } from '../src/modules/auth/guardian-consent/guardian-consent.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { LeaderboardRollupService } from '../src/modules/leaderboard/leaderboard-rollup.service';
import { PointsConfig } from '../src/modules/points/points-config.service';
import { RedisService } from '../src/redis/redis.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// backend/w12-points (B-093; Decision Log #382-#385; docs/contest-spec.md sections 9a-9d, 13).
// The leaderboard points engine against REAL Postgres and REAL Redis, on a FAKE CLOCK (APP_CLOCK is
// overridden; the crons are stopped). The daily caps are overridden per test through a mutable
// PointsConfig so a cap can be reached with a handful of likes.
describe('Points engine e2e: giver/receiver, caps, revocation, view heartbeats', () => {
  let app: INestApplication;
  let clockNow = new Date('2026-11-10T12:00:00Z');
  const fakeClock = { now: () => new Date(clockNow) };
  let caps = { givenQuarters: 160, receivedQuarters: 80 };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(fakeClock)
      .overrideProvider(PointsConfig)
      .useValue({
        get caps() {
          return caps;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    // The heartbeat sessions and rate counters live in Redis, which resetDatabase does not clear.
    const redis = app.get(RedisService);
    const keys = await redis.keys('viewhb:*');
    if (keys.length) await redis.del(...keys);
    clockNow = new Date('2026-11-10T12:00:00Z');
    caps = { givenQuarters: 160, receivedQuarters: 80 };
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const prisma = () => getTestPrismaClient();
  const server = () => app.getHttpServer();
  const rand = () => Math.random().toString(36).slice(2);
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const advance = (seconds: number) => {
    clockNow = new Date(clockNow.getTime() + seconds * 1000);
  };

  interface TestUser {
    userId: string;
    token: string;
  }

  async function createUser(label: string, over: Record<string, unknown> = {}): Promise<TestUser> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-pts-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Pts ${label}`,
        verificationStatus: 'verified',
        username: `pts_${label}_${rand()}`.slice(0, 24),
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
        ...over,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, token: accessToken.token };
  }

  async function seedPost(author: TestUser, over: Record<string, unknown> = {}): Promise<string> {
    const p = await prisma().post.create({
      data: { authorId: author.userId, contentText: `post ${rand()}`, mediaUrls: [], ...over },
    });
    return p.id;
  }

  const like = (u: TestUser, postId: string) => request(server()).post(`/posts/${postId}/like`).set(auth(u.token));
  const unlike = (u: TestUser, postId: string) => request(server()).delete(`/posts/${postId}/like`).set(auth(u.token));
  const comment = (u: TestUser, postId: string, text = 'nice') =>
    request(server()).post(`/posts/${postId}/comments`).set(auth(u.token)).send({ contentText: text });

  const rows = (where: Record<string, unknown> = {}) =>
    prisma().pointsLedgerEntry.findMany({ where, orderBy: [{ occurredAt: 'asc' }, { source: 'asc' }] });
  const live = (userId: string) => rows({ userId, revokedAt: null });
  const total = async (userId: string) =>
    (await live(userId)).reduce((sum, r) => sum + r.quarterPoints, 0);

  // ===============================================================================================
  describe('likes: the giver earns 1 point, the creator a quarter point (spec 9b)', () => {
    it('writes a given row (4 units) and a received row (1 unit) with the post, the counterpart and the club snapshot', async () => {
      const club = await prisma().clubPage.create({ data: { name: `Club ${rand()}`, league: 'L', country: 'NG' } });
      const author = await createUser('author');
      const fan = await createUser('fan', { representedClubId: club.id });
      const postId = await seedPost(author);

      await like(fan, postId).expect(200);

      const fanRows = await rows({ userId: fan.userId });
      expect(fanRows).toHaveLength(1);
      expect(fanRows[0]).toMatchObject({
        source: 'engagement_like_given',
        refId: postId,
        quarterPoints: 4,
        postId,
        counterpartId: null,
        revokedAt: null,
        clubId: club.id,
        occurredAt: clockNow,
      });
      const authorRows = await rows({ userId: author.userId });
      expect(authorRows).toHaveLength(1);
      expect(authorRows[0]).toMatchObject({
        source: 'engagement_like_received',
        refId: `${postId}:${fan.userId}`,
        quarterPoints: 1,
        postId,
        counterpartId: fan.userId,
        revokedAt: null,
      });
    });

    it('a repeat like is idempotent (200, nothing more is earned)', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);
      await like(fan, postId).expect(200);
      await like(fan, postId).expect(200);
      expect(await rows()).toHaveLength(2);
    });

    it('SELF-ENGAGEMENT is exempt: liking your own post earns nothing', async () => {
      const author = await createUser('author');
      const postId = await seedPost(author);
      await like(author, postId).expect(200);
      expect(await rows()).toHaveLength(0);
    });

    it('the creator earns a quarter point per unique ACCOUNT per post (three fans = 3 units)', async () => {
      const author = await createUser('author');
      const postId = await seedPost(author);
      for (const label of ['f1', 'f2', 'f3']) await like(await createUser(label), postId).expect(200);
      expect(await total(author.userId)).toBe(3);
    });

    it('an unlike REVOKES both rows; a re-like RESTORES them: the engagement earns its point once', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);

      await like(fan, postId).expect(200);
      await unlike(fan, postId).expect(200);
      const revoked = await rows();
      expect(revoked).toHaveLength(2);
      expect(revoked.every((r) => r.revokedAt !== null)).toBe(true);
      expect(await total(fan.userId)).toBe(0);

      advance(3600);
      await like(fan, postId).expect(200);
      const restored = await rows();
      expect(restored).toHaveLength(2); // the same two rows, not four
      expect(restored.every((r) => r.revokedAt === null)).toBe(true);
      expect(await total(fan.userId)).toBe(4);
      expect(await total(author.userId)).toBe(1);
      expect(restored.find((r) => r.userId === fan.userId)!.occurredAt).toEqual(clockNow);

      // like -> unlike -> like -> unlike -> like still nets exactly one point
      await unlike(fan, postId).expect(200);
      await like(fan, postId).expect(200);
      expect(await total(fan.userId)).toBe(4);
    });

    it('unlike when nothing was ever liked is a harmless 200', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);
      await unlike(fan, postId).expect(200);
      expect(await rows()).toHaveLength(0);
    });
  });

  // ===============================================================================================
  describe('comments: ten comments = one point; screening seam; revocation on removal', () => {
    it('one comment point per account per post however many comments, and a quarter point for the creator', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);
      for (let i = 0; i < 10; i++) await comment(fan, postId, `comment ${i}`).expect(201);
      expect(await rows({ source: 'engagement_comment_given' })).toHaveLength(1);
      expect(await total(fan.userId)).toBe(4);
      expect(await total(author.userId)).toBe(1);
    });

    it('deleting one of several comments keeps the point; deleting the LAST one revokes it', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);
      const first = (await comment(fan, postId, 'one').expect(201)).body.id as string;
      const second = (await comment(fan, postId, 'two').expect(201)).body.id as string;

      await request(server()).delete(`/posts/${postId}/comments/${first}`).set(auth(fan.token)).expect(204);
      expect(await total(fan.userId)).toBe(4);

      await request(server()).delete(`/posts/${postId}/comments/${second}`).set(auth(fan.token)).expect(204);
      expect(await total(fan.userId)).toBe(0);
      expect(await total(author.userId)).toBe(0);
      expect(await rows({ source: 'engagement_comment_given' })).toHaveLength(1); // kept as the audit trail
    });

    it('the post author hiding the last visible comment revokes it; unhiding restores it (earned once)', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);
      const id = (await comment(fan, postId, 'hello').expect(201)).body.id as string;

      await request(server()).patch(`/posts/${postId}/comments/${id}/hide`).set(auth(author.token)).expect(200);
      expect(await total(fan.userId)).toBe(0);
      expect(await total(author.userId)).toBe(0);

      await request(server()).patch(`/posts/${postId}/comments/${id}/unhide`).set(auth(author.token)).expect(200);
      expect(await total(fan.userId)).toBe(4);
      expect(await total(author.userId)).toBe(1);
      expect(await rows({ source: 'engagement_comment_given' })).toHaveLength(1);
    });

    it('a creator commenting on their own post earns nothing', async () => {
      const author = await createUser('author');
      const postId = await seedPost(author);
      await comment(author, postId).expect(201);
      expect(await rows()).toHaveLength(0);
    });
  });

  // ===============================================================================================
  describe('a removed post revokes everything earned on it; posts and follows earn nothing (B-094)', () => {
    it('DELETE /posts/:id marks every baseline row for the post revoked (the rows stay as the audit trail)', async () => {
      const author = await createUser('author');
      const f1 = await createUser('f1');
      const f2 = await createUser('f2');
      const postId = await seedPost(author);
      const other = await seedPost(author);
      await like(f1, postId).expect(200);
      await comment(f2, postId).expect(201);
      await like(f1, other).expect(200);

      await request(server()).delete(`/posts/${postId}`).set(auth(author.token)).expect(204);

      const forPost = await rows({ postId });
      expect(forPost).toHaveLength(4);
      expect(forPost.every((r) => r.revokedAt !== null)).toBe(true);
      expect((await rows({ postId: other })).every((r) => r.revokedAt === null)).toBe(true);
      expect(await total(f2.userId)).toBe(0);
    });

    it('creating a post and following earn nothing', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      await request(server()).post('/posts').set(auth(author.token)).send({ contentText: 'hello world' }).expect(201);
      await request(server()).post(`/users/${author.userId}/follow`).set(auth(fan.token)).expect(200);
      expect(await rows()).toHaveLength(0);
    });
  });

  // ===============================================================================================
  describe('daily caps (Europe/London calendar day)', () => {
    it('stops the GIVER at the cap, still pays the creator, frees the cap on revocation, and resets on the next London day', async () => {
      caps = { givenQuarters: 8, receivedQuarters: 80 }; // 2 points a day for giving
      const author = await createUser('author');
      const fan = await createUser('fan');
      const posts = [] as string[];
      for (let i = 0; i < 5; i++) posts.push(await seedPost(author));

      await like(fan, posts[0]).expect(200);
      await like(fan, posts[1]).expect(200);
      await like(fan, posts[2]).expect(200); // over the cap: the like succeeds, earns the giver nothing
      expect(await rows({ userId: fan.userId })).toHaveLength(2);
      expect(await total(fan.userId)).toBe(8);
      expect(await total(author.userId)).toBe(3); // the creator's own (receive) cap is separate

      // Revoking one frees that day's cap...
      await unlike(fan, posts[0]).expect(200);
      expect(await total(fan.userId)).toBe(4);
      await like(fan, posts[3]).expect(200);
      expect(await total(fan.userId)).toBe(8);
      // ...and a capped engagement is NOT queued: the like on posts[2] never pays out later.
      expect((await rows({ userId: fan.userId, refId: posts[2] }))).toHaveLength(0);

      // London midnight (GMT in November) starts a new cap day.
      clockNow = new Date('2026-11-11T00:00:00Z');
      await like(fan, posts[4]).expect(200);
      expect(await total(fan.userId)).toBe(12);
    });

    it('stops the CREATOR at the receive cap while the giver still earns', async () => {
      caps = { givenQuarters: 160, receivedQuarters: 3 };
      const author = await createUser('author');
      const postId = await seedPost(author);
      const fans = [] as TestUser[];
      for (let i = 0; i < 4; i++) fans.push(await createUser(`f${i}`));
      for (const f of fans) await like(f, postId).expect(200);
      expect(await total(author.userId)).toBe(3);
      for (const f of fans) expect(await total(f.userId)).toBe(4);
    });

    it('the cap day is the LONDON day: 23:30 UTC in summer is already tomorrow', async () => {
      caps = { givenQuarters: 4, receivedQuarters: 80 }; // 1 point a day
      const author = await createUser('author');
      const fan = await createUser('fan');
      const [p1, p2, p3] = [await seedPost(author), await seedPost(author), await seedPost(author)];
      clockNow = new Date('2026-07-10T22:30:00Z'); // 23:30 BST on the 10th
      await like(fan, p1).expect(200);
      await like(fan, p2).expect(200); // capped
      expect(await total(fan.userId)).toBe(4);
      clockNow = new Date('2026-07-10T23:30:00Z'); // 00:30 BST on the 11th
      await like(fan, p3).expect(200);
      expect(await total(fan.userId)).toBe(8);
    });

    it('concurrent likes by one account cannot overshoot the cap (advisory lock per account and day)', async () => {
      caps = { givenQuarters: 8, receivedQuarters: 80 };
      const author = await createUser('author');
      const fan = await createUser('fan');
      const posts = await Promise.all([1, 2, 3, 4, 5, 6].map(() => seedPost(author)));
      await Promise.all(posts.map((p) => like(fan, p)));
      expect(await total(fan.userId)).toBe(8);
      expect(await rows({ userId: fan.userId })).toHaveLength(2);
    });
  });

  // ===============================================================================================
  describe('who may earn: verified email, not restricted, same rules for minors', () => {
    it('an engagement from an UNVERIFIED account counts for nobody (the heartbeat endpoint is open to them)', async () => {
      const author = await createUser('author');
      const stranger = await createUser('stranger', { verificationStatus: 'unverified' });
      const postId = await seedPost(author);
      await photoView(stranger, postId);
      expect(await rows()).toHaveLength(0);
    });

    it('a RESTRICTED minor (guardian consent not confirmed) earns nothing and earns the creator nothing', async () => {
      const author = await createUser('author');
      const minor = await createUser('minor', { isMinor: true, dateOfBirth: seedDob('2012-01-01') });
      await prisma().guardian.create({
        data: {
          minorUserId: minor.userId,
          name: 'G',
          email: `g-${rand()}@example.com`,
          relationship: 'Parent',
          consentStatus: 'pending',
          consentToken: `t-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 3600_000),
        },
      });
      const postId = await seedPost(author);
      await photoView(minor, postId);
      expect(await rows()).toHaveLength(0);
    });

    it('a minor whose guardian CONFIRMED consent earns exactly like anyone else', async () => {
      const author = await createUser('author');
      const minor = await createUser('minor', { isMinor: true, dateOfBirth: seedDob('2012-01-01') });
      await prisma().guardian.create({
        data: {
          minorUserId: minor.userId,
          name: 'G',
          email: `g-${rand()}@example.com`,
          relationship: 'Parent',
          consentStatus: 'confirmed',
          consentToken: `t-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 3600_000),
          consentTimestamp: new Date(),
        },
      });
      const postId = await seedPost(author);
      await like(minor, postId).expect(200);
      expect(await total(minor.userId)).toBe(4);
      expect(await total(author.userId)).toBe(1);
    });

    it('an account LATER restricted by a guardian WITHDRAWAL loses what it earned and what it earned others', async () => {
      const author = await createUser('author');
      const minor = await createUser('minor', { isMinor: true, dateOfBirth: seedDob('2012-01-01') });
      const guardian = await prisma().guardian.create({
        data: {
          minorUserId: minor.userId,
          name: 'G',
          email: `g-${rand()}@example.com`,
          relationship: 'Parent',
          consentStatus: 'confirmed',
          consentToken: `t-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 3600_000),
          consentTimestamp: new Date(),
        },
      });
      const other = await createUser('other');
      const minorPost = await seedPost(minor);
      const authorPost = await seedPost(author);
      await like(minor, authorPost).expect(200); // the minor gives, the author receives
      await like(other, minorPost).expect(200); // another account gives, the minor receives
      expect(await total(minor.userId)).toBe(5); // 4 for giving the like, 1 for receiving one
      expect(await total(author.userId)).toBe(1);

      await app.get(GuardianConsentService).refuseConsentAndScheduleDeletion({
        guardianId: guardian.id,
        minorUserId: minor.userId,
        reason: 'withdrawn',
      });

      expect(await total(minor.userId)).toBe(0); // what it gave and what it received are both gone
      expect(await total(author.userId)).toBe(0); // what the author earned from the minor's like is gone
      expect(await total(other.userId)).toBe(4); // an unrelated giver keeps theirs
    });

    it('an admin SUSPENDING an account revokes its baseline points the same way', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const postId = await seedPost(author);
      await like(fan, postId).expect(200);
      const admin = await prisma().adminUser.create({
        data: { email: `pts-admin-${rand()}@example.com`, passwordHash: 'x', fullName: 'A', role: 'superadmin' },
      });
      const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
      await request(server())
        .patch(`/admin/users/${fan.userId}`)
        .set(auth(accessToken.token))
        .send({ status: 'suspended' })
        .expect(200);
      expect(await total(fan.userId)).toBe(0);
      expect(await total(author.userId)).toBe(0);
    });
  });

  // ===============================================================================================
  describe('view heartbeats (spec 9c): server-validated qualification', () => {
    const PHOTO_URL = 'https://cdn.example.test/p.jpg';
    const VIDEO_URL = 'https://cdn.example.test/v.mp4';
    let sessionSeq = 0;
    const session = () => `00000000-0000-4000-8000-${String(++sessionSeq).padStart(12, '0')}`;
    const beat = (u: TestUser, postId: string, sessionId: string, body: Record<string, unknown>) =>
      request(server()).post(`/posts/${postId}/view-heartbeat`).set(auth(u.token)).send({ sessionId, ...body });

    it('a PHOTO qualifies after 3 server-measured seconds: the viewer earns 1 point, the creator 0.25', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      const s = session();
      expect((await beat(viewer, postId, s, { active: true }).expect(200)).body).toEqual({ done: false });
      advance(2);
      expect((await beat(viewer, postId, s, { active: true }).expect(200)).body).toEqual({ done: false });
      expect(await rows()).toHaveLength(0);
      advance(1);
      expect((await beat(viewer, postId, s, { active: true }).expect(200)).body).toEqual({ done: true });
      const written = await rows();
      expect(written.map((r) => [r.userId, r.source, r.quarterPoints, r.refId])).toEqual(
        expect.arrayContaining([
          [viewer.userId, 'engagement_view_given', 4, postId],
          [author.userId, 'engagement_view_received', 1, `${postId}:${viewer.userId}`],
        ]),
      );
      expect(written).toHaveLength(2);
    });

    it('a TEXT-ONLY post also qualifies after 3 seconds', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author);
      await photoView(viewer, postId);
      expect(await total(viewer.userId)).toBe(4);
    });

    it('cannot be faked: a burst of beats at one instant, or beats that claim "active" across a long silence, earn nothing', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      const s = session();
      for (let i = 0; i < 20; i++) await beat(viewer, postId, s, { active: true }).expect(200);
      expect(await rows()).toHaveLength(0);
      advance(60); // one beat a minute later: the 60-second gap is not credited
      await beat(viewer, postId, s, { active: true }).expect(200);
      expect(await rows()).toHaveLength(0);
    });

    it('an inactive beat (backgrounded tab, scrolled away) interrupts the credit', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      const s = session();
      await beat(viewer, postId, s, { active: true }).expect(200);
      advance(3);
      await beat(viewer, postId, s, { active: false }).expect(200); // the gap that ends inactive earns nothing
      advance(3);
      await beat(viewer, postId, s, { active: true }).expect(200); // the gap that starts inactive earns nothing
      expect(await rows()).toHaveLength(0);
    });

    it('one view point per account per post: a second session earns nothing more', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      await photoView(viewer, postId);
      await photoView(viewer, postId);
      expect(await rows({ source: 'engagement_view_given' })).toHaveLength(1);
      expect(await total(viewer.userId)).toBe(4);
    });

    it('a creator viewing their own post earns nothing', async () => {
      const author = await createUser('author');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      await photoView(author, postId);
      expect(await rows()).toHaveLength(0);
    });

    it('a VIDEO shorter than 60 seconds qualifies only on its FULL length, with the playhead moving', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [VIDEO_URL] });
      const s = session();
      await beat(viewer, postId, s, { active: true, positionSeconds: 0, durationSeconds: 9 }).expect(200);
      for (let t = 3; t <= 6; t += 3) {
        advance(3);
        await beat(viewer, postId, s, { active: true, positionSeconds: t, durationSeconds: 9 }).expect(200);
      }
      expect(await rows()).toHaveLength(0); // 6 of 9 seconds
      advance(3);
      await beat(viewer, postId, s, { active: true, positionSeconds: 9, durationSeconds: 9 }).expect(200);
      expect(await total(viewer.userId)).toBe(4);
    });

    it('a video beat without a playhead is a 400; a paused video, a skip ahead and a loop earn no credit', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [VIDEO_URL] });
      await beat(viewer, postId, session(), { active: true, durationSeconds: 9 }).expect(400);

      // paused: the playhead never moves although the client keeps saying "active"
      const paused = session();
      await beat(viewer, postId, paused, { active: true, positionSeconds: 4, durationSeconds: 9 }).expect(200);
      for (let i = 0; i < 4; i++) {
        advance(3);
        await beat(viewer, postId, paused, { active: true, positionSeconds: 4, durationSeconds: 9 }).expect(200);
      }
      // skip ahead: jumps to the end each time
      const skipped = session();
      await beat(viewer, postId, skipped, { active: true, positionSeconds: 0, durationSeconds: 9 }).expect(200);
      advance(3);
      await beat(viewer, postId, skipped, { active: true, positionSeconds: 9, durationSeconds: 9 }).expect(200);
      // loop: position falls back each beat
      const looped = session();
      await beat(viewer, postId, looped, { active: true, positionSeconds: 8, durationSeconds: 9 }).expect(200);
      advance(3);
      await beat(viewer, postId, looped, { active: true, positionSeconds: 1, durationSeconds: 9 }).expect(200);
      advance(3);
      await beat(viewer, postId, looped, { active: true, positionSeconds: 0, durationSeconds: 9 }).expect(200);
      expect(await rows()).toHaveLength(0);
    });

    it('a LONG video qualifies after 60 seconds, not its full length', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [VIDEO_URL] });
      const s = session();
      await beat(viewer, postId, s, { active: true, positionSeconds: 0, durationSeconds: 600 }).expect(200);
      for (let t = 3; t < 60; t += 3) {
        advance(3);
        await beat(viewer, postId, s, { active: true, positionSeconds: t, durationSeconds: 600 }).expect(200);
      }
      expect(await rows()).toHaveLength(0); // 57 s
      advance(3);
      await beat(viewer, postId, s, { active: true, positionSeconds: 60, durationSeconds: 600 }).expect(200);
      expect(await total(viewer.userId)).toBe(4);
    });

    it('is a 404 for a post the viewer may not see (blocked), and 401 without a token', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      await prisma().block.create({ data: { blockerId: author.userId, blockedId: viewer.userId } });
      await beat(viewer, postId, session(), { active: true }).expect(404);
      await request(server()).post(`/posts/${postId}/view-heartbeat`).send({ sessionId: session(), active: true }).expect(401);
    });

    it('stores no dwell or session data in Postgres: only the ledger rows exist after a qualified view', async () => {
      const author = await createUser('author');
      const viewer = await createUser('viewer');
      const postId = await seedPost(author, { mediaUrls: [PHOTO_URL] });
      await photoView(viewer, postId);
      const written = await rows();
      expect(Object.keys(written[0]).sort()).toEqual(
        ['clubId', 'counterpartId', 'id', 'occurredAt', 'postId', 'quarterPoints', 'refId', 'revokedAt', 'source', 'userId'].sort(),
      );
      // the session lives only in Redis, and expires
      const keys = await app.get(RedisService).keys('viewhb:s:*');
      expect(keys).toHaveLength(1);
      expect(await app.get(RedisService).ttl(keys[0])).toBeGreaterThan(0);
    });
  });

  // ===============================================================================================
  describe('contest entries: qualified views feed Phase 1 ranking (spec 9c, 7)', () => {
    // November 2026 is GMT: week 1 opens 2026-11-01T08:00Z, Phase 1 ends 2026-11-05T00:00Z.
    it('a qualified view of an entry (photo: 5 s) is recorded and counted; the entry with the views outranks the one without', async () => {
      clockNow = new Date('2026-10-30T12:00:00Z');
      const adminRow = await prisma().adminUser.create({
        data: { email: `pts-admin2-${rand()}@example.com`, passwordHash: 'x', fullName: 'A', role: 'superadmin' },
      });
      const { accessToken } = await app.get(AdminTokenService).issueTokenPair(adminRow.id, adminRow.role);
      await request(server())
        .post('/admin/contest/cycles')
        .set(auth(accessToken.token))
        .send({
          month: '2026-11',
          title: 'November',
          description: 'Skill',
          weeks: [
            { weekNumber: 1, task: 'a', viewWatchLimitSeconds: 10 },
            { weekNumber: 2, task: 'b', viewWatchLimitSeconds: 10 },
            { weekNumber: 3, task: 'c', viewWatchLimitSeconds: 10 },
          ],
          finalTask: 'f',
          minimumTally: 1,
        })
        .expect(201);

      clockNow = new Date('2026-11-02T10:00:00Z');
      const a = await createUser('entrant-a');
      const b = await createUser('entrant-b');
      const c = await createUser('entrant-c'); // a week needs three entries or it is forfeited (spec 7)
      const viewer = await createUser('viewer');
      const mk = async (u: TestUser) => {
        const postId = await seedPost(u, { mediaUrls: ['https://cdn.example.test/e.jpg'] });
        await request(server()).post('/contest/entries').set(auth(u.token)).send({ postId }).expect(201);
        return postId;
      };
      const postA = await mk(a);
      await mk(b);
      await mk(c);

      const s = '00000000-0000-4000-8000-0000000000aa';
      await request(server()).post(`/posts/${postA}/view-heartbeat`).set(auth(viewer.token)).send({ sessionId: s, active: true }).expect(200);
      advance(3);
      const mid = await request(server()).post(`/posts/${postA}/view-heartbeat`).set(auth(viewer.token)).send({ sessionId: s, active: true }).expect(200);
      expect(mid.body).toEqual({ done: false }); // the everyday point fired at 3 s; the contest view needs 5 s
      expect(await prisma().contestEngagement.count({ where: { kind: 'view' } })).toBe(0);
      advance(2);
      const done = await request(server()).post(`/posts/${postA}/view-heartbeat`).set(auth(viewer.token)).send({ sessionId: s, active: true }).expect(200);
      expect(done.body).toEqual({ done: true });
      const viewRows = await prisma().contestEngagement.findMany({ where: { kind: 'view' } });
      expect(viewRows).toHaveLength(1);
      expect(viewRows[0]).toMatchObject({ userId: viewer.userId, followedAtEngagement: false });

      // Phase 1 closes at 2026-11-05T00:00Z; the lifecycle ranks on views + likes + comments.
      clockNow = new Date('2026-11-05T00:00:00Z');
      await app.get(ContestLifecycleService).runOnce(new Date(clockNow));
      const entries = await prisma().contestEntry.findMany({ orderBy: { phase1Rank: 'asc' } });
      // The entry that was viewed has tally 1 and ranks first; the two with no engagement have tally 0
      // (how a zero-tally tie is broken is the contest's own rule, covered in contest.e2e-spec.ts).
      expect(entries.map((e) => [e.phase1Tally, e.phase1Rank])).toEqual([
        [1, 1],
        [0, 2],
        [0, 3],
      ]);
      expect(entries[0].userId).toBe(a.userId);
      expect(entries.every((e) => e.userId !== viewer.userId)).toBe(true);
    });

    it('the contest video threshold is min(video length, the weekly limit L): a 30-second video with L = 10 qualifies after 10 s', async () => {
      clockNow = new Date('2026-10-30T12:00:00Z');
      const adminRow = await prisma().adminUser.create({
        data: { email: `pts-admin3-${rand()}@example.com`, passwordHash: 'x', fullName: 'A', role: 'superadmin' },
      });
      const { accessToken } = await app.get(AdminTokenService).issueTokenPair(adminRow.id, adminRow.role);
      await request(server())
        .post('/admin/contest/cycles')
        .set(auth(accessToken.token))
        .send({
          month: '2026-11',
          title: 'November',
          description: 'Skill',
          weeks: [
            { weekNumber: 1, task: 'a', viewWatchLimitSeconds: 10 },
            { weekNumber: 2, task: 'b', viewWatchLimitSeconds: 10 },
            { weekNumber: 3, task: 'c', viewWatchLimitSeconds: 10 },
          ],
          finalTask: 'f',
          minimumTally: 1,
        })
        .expect(201);
      clockNow = new Date('2026-11-02T10:00:00Z');
      const entrant = await createUser('entrant');
      const viewer = await createUser('viewer');
      const postId = await seedPost(entrant, { mediaUrls: ['https://cdn.example.test/clip.mp4'] });
      await request(server()).post('/contest/entries').set(auth(entrant.token)).send({ postId }).expect(201);

      const s = '00000000-0000-4000-8000-0000000000bb';
      const send = (t: number) =>
        request(server())
          .post(`/posts/${postId}/view-heartbeat`)
          .set(auth(viewer.token))
          .send({ sessionId: s, active: true, positionSeconds: t, durationSeconds: 30 })
          .expect(200);
      await send(0);
      for (let t = 3; t <= 9; t += 3) {
        advance(3);
        await send(t);
      }
      expect(await prisma().contestEngagement.count({ where: { kind: 'view' } })).toBe(0); // 9 s of 10
      advance(3);
      await send(12);
      expect(await prisma().contestEngagement.count({ where: { kind: 'view' } })).toBe(1);
    });

    it('the entrant\'s own view counts in the contest tally (self-engagement counts) but earns no everyday points', async () => {
      clockNow = new Date('2026-10-30T12:00:00Z');
      const adminRow = await prisma().adminUser.create({
        data: { email: `pts-admin4-${rand()}@example.com`, passwordHash: 'x', fullName: 'A', role: 'superadmin' },
      });
      const { accessToken } = await app.get(AdminTokenService).issueTokenPair(adminRow.id, adminRow.role);
      await request(server())
        .post('/admin/contest/cycles')
        .set(auth(accessToken.token))
        .send({
          month: '2026-11',
          title: 'November',
          description: 'Skill',
          weeks: [
            { weekNumber: 1, task: 'a', viewWatchLimitSeconds: 10 },
            { weekNumber: 2, task: 'b', viewWatchLimitSeconds: 10 },
            { weekNumber: 3, task: 'c', viewWatchLimitSeconds: 10 },
          ],
          finalTask: 'f',
          minimumTally: 1,
        })
        .expect(201);
      clockNow = new Date('2026-11-02T10:00:00Z');
      const entrant = await createUser('entrant');
      const postId = await seedPost(entrant, { mediaUrls: ['https://cdn.example.test/e.jpg'] });
      await request(server()).post('/contest/entries').set(auth(entrant.token)).send({ postId }).expect(201);
      const s = '00000000-0000-4000-8000-0000000000cc';
      const send = () =>
        request(server()).post(`/posts/${postId}/view-heartbeat`).set(auth(entrant.token)).send({ sessionId: s, active: true }).expect(200);
      await send();
      advance(5);
      await send();
      expect(await prisma().contestEngagement.count({ where: { kind: 'view', userId: entrant.userId } })).toBe(1);
      expect(await rows()).toHaveLength(0);
    });
  });

  // ===============================================================================================
  describe('placement points (spec 9d): the admin-set prizes, in quarter units', () => {
    it('the leaderboard sums given, received and placement rows and ignores revoked ones', async () => {
      const author = await createUser('author');
      const fan = await createUser('fan');
      const post1 = await seedPost(author);
      const post2 = await seedPost(author);
      await like(fan, post1).expect(200);
      await like(fan, post2).expect(200);
      await unlike(fan, post2).expect(200);
      await prisma().pointsLedgerEntry.create({
        data: {
          userId: fan.userId,
          source: 'contest_weekly_win',
          refId: 'round-x',
          quarterPoints: 2000, // 500 points
          occurredAt: clockNow,
        },
      });

      const rollup = app.get(LeaderboardRollupService);
      const period = '2026-W46'; // 2026-11-10 is in ISO week 46
      await rollup.rollupPeriod(period);

      const fanRes = await request(server()).get('/leaderboard').query({ period }).set(auth(fan.token)).expect(200);
      expect(fanRes.body.items.map((i: { userId: string; points: number; rank: number }) => [i.userId, i.points, i.rank])).toEqual([
        [fan.userId, 501, 1], // 2000 + 4 units = 501 points
        [author.userId, 0, 2], // one quarter point (post1) shows as 0 but still ranks
      ]);
      const stored = await prisma().leaderboardEntry.findMany({ where: { period, clubId: '' }, orderBy: { rank: 'asc' } });
      expect(stored.map((r) => r.quarterPoints)).toEqual([2004, 1]);
    });
  });

  // -----------------------------------------------------------------------------------------------
  // helper used above: three active beats over three seconds on a post with no video
  async function photoView(user: TestUser, postId: string): Promise<void> {
    const sessionId = `10000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`;
    for (let i = 0; i < 2; i++) {
      await request(server())
        .post(`/posts/${postId}/view-heartbeat`)
        .set(auth(user.token))
        .send({ sessionId, active: true })
        .expect(200);
      if (i === 0) advance(3);
    }
  }
});
