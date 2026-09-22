import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { TRENDING_WINDOW_HOURS } from '../src/modules/search/trending.constants';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-4/trending-topics-backend — Build Plan Section 4.7 (GET
// /trending). No hashtag/topic model existed anywhere in this schema
// before this PR. Hits test/README.md's e2e triggers #1 (raw SQL — the
// exponential-decay SUM + EXTRACT(EPOCH ...) aggregation in
// trending.service.ts, never run against a real Postgres before this
// PR) and #3 (a genuinely novel Prisma model/constraint — Hashtag /
// PostHashtag's @@unique([postId, hashtagId]) composite constraint is
// proven here against a real engine, not a mock that returns whatever a
// test tells it to).
//
// The mocked unit suite (src/modules/search/hashtag.util.spec.ts,
// trending.service.spec.ts, trending.controller.http.spec.ts) already
// covers extraction/dedup/normalization logic and the raw query's
// SHAPE (parameters passed, SQL text contains the right clauses)
// against a hand-built mocked PrismaService. This file is what proves
// the SQL itself is valid and correct against the real schema, and that
// the full pipeline (POST /posts -> hashtag extraction -> GET
// /trending) really works end to end.
describe('Trending topics e2e (Section 4.7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  function server() {
    return app.getHttpServer();
  }

  // Same "seed a User directly via Prisma + mint a real access token via
  // the real, unmocked TokenService" speed choice
  // leaderboard.e2e-spec.ts / banter.e2e-spec.ts / community-groups.e2e-spec.ts
  // all make — GET /trending carries no @AuthRateLimit() (it needs no
  // auth at all), so this is purely about speed, not a rate-limit
  // workaround. POST /posts still exercises the real
  // JwtAuthGuard -> TokenService.verifyAccessToken chain end to end.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-trending-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Trending ${label}`,
        dateOfBirth: new Date('1994-05-05'),
        isMinor: false,
        accountStatus: 'active',
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  // Seeds a real Post row directly via Prisma (bypassing POST /posts'
  // own hashtag extraction — these tests seed the PostHashtag rows
  // themselves, deliberately, so window/decay behavior can be proven
  // against caller-controlled `createdAt` offsets rather than real
  // wall-clock waits — the same "seed directly, don't wait on real
  // timing" approach leaderboard.e2e-spec.ts's own awardLedgerEntry()
  // helper takes for PointsLedgerEntry.occurredAt).
  async function seedPost(authorId: string, label: string): Promise<string> {
    const prisma = getTestPrismaClient();
    const post = await prisma.post.create({
      data: { authorId, contentText: `seed post ${label}`, mediaUrls: [] },
    });
    return post.id;
  }

  async function seedHashtagUse(postId: string, tag: string, createdAt: Date) {
    const prisma = getTestPrismaClient();
    const hashtag = await prisma.hashtag.upsert({
      where: { tag },
      create: { tag, postCount: 1 },
      update: { postCount: { increment: 1 } },
    });
    await prisma.postHashtag.create({ data: { postId, hashtagId: hashtag.id, createdAt } });
    return hashtag;
  }

  describe('POST /posts -> hashtag extraction -> GET /trending, end to end', () => {
    it('extracts hashtags from a real post, dedupes case-insensitively, and GET /trending surfaces it — genuinely public, no auth required to read', async () => {
      const author = await createUser('author');

      await request(server())
        .post('/posts')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ contentText: 'Huge result for #EPL fans today, #epl news everywhere' })
        .expect(201);

      // No Authorization header on this request at all.
      const res = await request(server()).get('/trending').expect(200);

      expect(res.body.items).toEqual([expect.objectContaining({ tag: 'epl', postCount: 1 })]);

      // "#EPL" and "#epl" in the same post normalize to ONE Hashtag row
      // and one PostHashtag row (search/hashtag.util.ts's own dedupe) —
      // proven here against the real Prisma client, not a mock.
      const prisma = getTestPrismaClient();
      const hashtagRows = await prisma.hashtag.findMany({ where: { tag: 'epl' } });
      expect(hashtagRows).toHaveLength(1);
      expect(hashtagRows[0].postCount).toBe(1);
      expect(await prisma.postHashtag.count()).toBe(1);
    });

    it('a post with no hashtags creates no Hashtag/PostHashtag rows at all', async () => {
      const author = await createUser('author');

      await request(server())
        .post('/posts')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ contentText: 'No tags in this one' })
        .expect(201);

      const prisma = getTestPrismaClient();
      expect(await prisma.hashtag.count()).toBe(0);
      expect(await prisma.postHashtag.count()).toBe(0);
    });

    it('a second real post reusing an existing tag increments Hashtag.postCount (the all-time denormalized cache)', async () => {
      const author = await createUser('author');

      await request(server())
        .post('/posts')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ contentText: 'First #chelsea post' })
        .expect(201);
      await request(server())
        .post('/posts')
        .set('Authorization', `Bearer ${author.accessToken}`)
        .send({ contentText: 'Second #chelsea post' })
        .expect(201);

      const prisma = getTestPrismaClient();
      const hashtag = await prisma.hashtag.findUnique({ where: { tag: 'chelsea' } });
      expect(hashtag?.postCount).toBe(2);
      expect(await prisma.postHashtag.count()).toBe(2);
    });
  });

  describe('GET /trending — time-decayed ranking', () => {
    it('ranks a more recent use of a tag above an older one via genuine exponential decay, not raw postCount', async () => {
      const author = await createUser('author');
      const now = new Date();
      const oldPost = await seedPost(author.userId, 'old');
      const newPost = await seedPost(author.userId, 'new');

      // #grassroots used once, 40 hours ago (still inside the 48h window,
      // but heavily decayed at a 6h half-life). #epl used once, 1 hour
      // ago (barely decayed). Both have identical raw postCount (1) —
      // only the decay can explain a difference in ordering/score.
      await seedHashtagUse(oldPost, 'grassroots', new Date(now.getTime() - 40 * 60 * 60 * 1000));
      await seedHashtagUse(newPost, 'epl', new Date(now.getTime() - 1 * 60 * 60 * 1000));

      const res = await request(server()).get('/trending').expect(200);

      const items: Array<{ tag: string; postCount: number; score: number }> = res.body.items;
      const tags = items.map((i) => i.tag);
      expect(tags.indexOf('epl')).toBeLessThan(tags.indexOf('grassroots'));

      const eplItem = items.find((i) => i.tag === 'epl')!;
      const grassrootsItem = items.find((i) => i.tag === 'grassroots')!;
      expect(eplItem.postCount).toBe(1);
      expect(grassrootsItem.postCount).toBe(1);
      expect(eplItem.score).toBeGreaterThan(grassrootsItem.score);
    });

    it('excludes a hashtag use entirely once it falls outside the rolling window, even though it still counts toward the all-time Hashtag.postCount cache', async () => {
      const author = await createUser('author');
      const now = new Date();
      const post = await seedPost(author.userId, 'stale');

      // Just past the 48h window.
      await seedHashtagUse(post, 'ancient', new Date(now.getTime() - (TRENDING_WINDOW_HOURS + 1) * 60 * 60 * 1000));

      const res = await request(server()).get('/trending').expect(200);

      expect(res.body.items).toEqual([]);

      // The all-time denormalized cache still reflects it — this is
      // exactly WHY trending can't read from Hashtag.postCount directly
      // (schema.prisma's own comment on that field, and search/README.md's
      // "Trending topics" section).
      const prisma = getTestPrismaClient();
      const hashtag = await prisma.hashtag.findUnique({ where: { tag: 'ancient' } });
      expect(hashtag?.postCount).toBe(1);
    });

    it('respects a real caller-supplied limit, ordered by score descending', async () => {
      const author = await createUser('author');
      const now = new Date();
      const postA = await seedPost(author.userId, 'a');
      const postB = await seedPost(author.userId, 'b');
      const postC = await seedPost(author.userId, 'c');

      // Distinct ages so score ordering is unambiguous.
      await seedHashtagUse(postA, 'alpha', new Date(now.getTime() - 3 * 60 * 60 * 1000));
      await seedHashtagUse(postB, 'beta', new Date(now.getTime() - 2 * 60 * 60 * 1000));
      await seedHashtagUse(postC, 'gamma', new Date(now.getTime() - 1 * 60 * 60 * 1000));

      const res = await request(server()).get('/trending').query({ limit: 2 }).expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.items.map((i: { tag: string }) => i.tag)).toEqual(['gamma', 'beta']);
    });
  });

  describe('PostHashtag.@@unique([postId, hashtagId]) — a genuinely novel Prisma constraint', () => {
    it('rejects a duplicate (postId, hashtagId) pair at the database level', async () => {
      const author = await createUser('author');
      const postId = await seedPost(author.userId, 'dup');
      const prisma = getTestPrismaClient();
      const hashtag = await prisma.hashtag.upsert({
        where: { tag: 'dupe' },
        create: { tag: 'dupe', postCount: 1 },
        update: {},
      });
      await prisma.postHashtag.create({ data: { postId, hashtagId: hashtag.id } });

      await expect(
        prisma.postHashtag.create({ data: { postId, hashtagId: hashtag.id } }),
      ).rejects.toThrow();
    });
  });
});
