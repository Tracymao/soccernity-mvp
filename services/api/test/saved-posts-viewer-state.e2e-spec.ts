import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// Real-Postgres coverage for GET /users/:id/saved-posts carrying the same per-caller viewer state the
// feed does (Decision Log #153, build-register B-064 follow-up): isLiked, isSaved and author.isFollowing,
// read from the caller's own Like / SavedPost / Follow rows. A mocked Prisma client cannot show that the
// batched lookups return the right rows, so this runs against a real database. Same seed-directly /
// mint-a-real-token pattern as feed-pagination-ordering.e2e-spec.ts.
describe('Saved posts viewer state e2e (Decision Log #153 applied to GET /users/:id/saved-posts)', () => {
  let app: INestApplication;

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

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-saved-vs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Saved VS ${label}`,
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const auth = (u: { accessToken: string }) => ({ Authorization: `Bearer ${u.accessToken}` });

  async function seedPost(authorId: string, text: string) {
    return getTestPrismaClient().post.create({ data: { authorId, contentText: text, mediaUrls: [] } });
  }

  it('returns isLiked and author.isFollowing per post, from the caller\'s own rows, and isSaved true', async () => {
    const prisma = getTestPrismaClient();
    const me = await createUser('me');
    const followed = await createUser('followed-author');
    const stranger = await createUser('stranger-author');
    const other = await createUser('other-person');

    const likedAndFollowed = await seedPost(followed.userId, 'liked, author followed');
    const plain = await seedPost(stranger.userId, 'not liked, author not followed');
    const mine = await seedPost(me.userId, 'my own post');
    for (const p of [likedAndFollowed, plain, mine]) {
      await prisma.savedPost.create({ data: { userId: me.userId, postId: p.id } });
    }
    await prisma.like.create({ data: { userId: me.userId, postId: likedAndFollowed.id } });
    await prisma.follow.create({ data: { followerId: me.userId, followeeId: followed.userId } });
    // Someone ELSE's like and follow must not leak into my view of the posts.
    await prisma.like.create({ data: { userId: other.userId, postId: plain.id } });
    await prisma.follow.create({ data: { followerId: other.userId, followeeId: stranger.userId } });

    const res = await request(app.getHttpServer())
      .get(`/users/${me.userId}/saved-posts`)
      .set(auth(me))
      .expect(200);

    const byId = Object.fromEntries(res.body.items.map((e: { postId: string; post: any }) => [e.postId, e.post]));
    expect(Object.keys(byId)).toHaveLength(3);
    expect(byId[likedAndFollowed.id]).toMatchObject({ isLiked: true, isSaved: true });
    expect(byId[likedAndFollowed.id].author.isFollowing).toBe(true);
    expect(byId[plain.id]).toMatchObject({ isLiked: false, isSaved: true });
    expect(byId[plain.id].author.isFollowing).toBe(false);
    expect(byId[mine.id]).toMatchObject({ isLiked: false, isSaved: true });
    expect(byId[mine.id].author.isFollowing).toBe(false);
    // Entry shape otherwise unchanged.
    expect(res.body.items[0]).toEqual(expect.objectContaining({ postId: expect.any(String), savedAt: expect.any(String) }));
    expect(res.body.items[0]).not.toHaveProperty('sequence');
  });

  it('still drops a post that was unsaved or deleted by its author', async () => {
    const prisma = getTestPrismaClient();
    const me = await createUser('me');
    const author = await createUser('author');
    const kept = await seedPost(author.userId, 'kept');
    const unsaved = await seedPost(author.userId, 'unsaved later');
    const deleted = await seedPost(author.userId, 'deleted by author');
    for (const p of [kept, unsaved, deleted]) {
      await prisma.savedPost.create({ data: { userId: me.userId, postId: p.id } });
      await prisma.like.create({ data: { userId: me.userId, postId: p.id } });
    }
    await prisma.savedPost.deleteMany({ where: { userId: me.userId, postId: unsaved.id } });
    await request(app.getHttpServer()).delete(`/posts/${deleted.id}`).set(auth(author)).expect(204);

    const res = await request(app.getHttpServer())
      .get(`/users/${me.userId}/saved-posts`)
      .set(auth(me))
      .expect(200);

    expect(res.body.items.map((e: { postId: string }) => e.postId)).toEqual([kept.id]);
    expect(res.body.items[0].post).toMatchObject({ isLiked: true, isSaved: true });
  });

  it('an empty saved list is an empty page', async () => {
    const me = await createUser('me');
    const res = await request(app.getHttpServer())
      .get(`/users/${me.userId}/saved-posts`)
      .set(auth(me))
      .expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('another user\'s id is still a 403, with nothing read', async () => {
    const me = await createUser('me');
    const other = await createUser('other');
    await request(app.getHttpServer())
      .get(`/users/${other.userId}/saved-posts`)
      .set(auth(me))
      .expect(403);
  });
});
