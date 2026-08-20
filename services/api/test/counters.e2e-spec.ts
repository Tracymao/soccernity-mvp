import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Direct, real-Postgres proof of the "denormalized cache must never
// drift" obligation documented on Post.likeCount and Post.commentCount in
// schema.prisma, and referenced again in feed.service.ts's own comments
// on likePost/unlikePost/addComment. Unlike feed-reactions.e2e-spec.ts
// (which asserts the HTTP response's own reported likeCount/commentCount
// at a couple of points), this file asserts, at EVERY step of a real
// like/like/unlike/unlike/comment/comment sequence, that Post.likeCount
// read back from the database equals Like.count({ where: { postId } })
// and Post.commentCount equals Comment.count({ where: { postId } }) —
// proving the cache and the real row counts agree throughout, not just
// that they happen to agree once the sequence is done.
describe('Counters e2e: Post.likeCount/commentCount never drift from real Like/Comment row counts', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  function uniqueEmail(label: string): string {
    return `e2e-counters-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Same real, discovered gap as feed-reactions.e2e-spec.ts's identically
  // named helper — see that file's comment for the full explanation.
  // Bypasses real POST /auth/register's hardcoded, not-actually-env-
  // configurable rate limit by seeding the User row directly via Prisma
  // and minting a real access token via the real, unmocked TokenService
  // from this test's own DI container; every downstream request still
  // exercises the real JwtAuthGuard -> TokenService.verifyAccessToken
  // chain.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Counters User ${label}`,
        dateOfBirth: new Date('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });

    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);

    return { userId: user.id, accessToken: accessToken.token };
  }

  async function assertCountersMatchRealRows(postId: string): Promise<void> {
    const prisma = getTestPrismaClient();
    const [postRow, realLikeCount, realCommentCount] = await Promise.all([
      prisma.post.findUniqueOrThrow({ where: { id: postId } }),
      prisma.like.count({ where: { postId } }),
      prisma.comment.count({ where: { postId } }),
    ]);
    expect(postRow.likeCount).toBe(realLikeCount);
    expect(postRow.commentCount).toBe(realCommentCount);
  }

  it('cache matches real row counts at every step of like, like (idempotent), unlike, unlike (idempotent), comment, comment', async () => {
    const author = await createUser('author');
    const actor = await createUser('actor');

    const prisma = getTestPrismaClient();
    const post = await prisma.post.create({
      data: { authorId: author.userId, contentText: 'Counters drift-proof seed post', mediaUrls: [] },
    });

    // Baseline: freshly created post, nothing yet.
    await assertCountersMatchRealRows(post.id);

    // Step 1: like.
    await request(app.getHttpServer())
      .post(`/posts/${post.id}/like`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);
    await assertCountersMatchRealRows(post.id);

    // Step 2: like again (idempotent) — cache must NOT double-increment.
    await request(app.getHttpServer())
      .post(`/posts/${post.id}/like`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);
    await assertCountersMatchRealRows(post.id);

    // Step 3: unlike.
    await request(app.getHttpServer())
      .delete(`/posts/${post.id}/like`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);
    await assertCountersMatchRealRows(post.id);

    // Step 4: unlike again (idempotent) — cache must NOT go negative or
    // otherwise drift from the real (now-zero) Like row count.
    await request(app.getHttpServer())
      .delete(`/posts/${post.id}/like`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .expect(200);
    await assertCountersMatchRealRows(post.id);

    // Step 5: comment.
    await request(app.getHttpServer())
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ contentText: 'First comment in the drift-proof sequence' })
      .expect(201);
    await assertCountersMatchRealRows(post.id);

    // Step 6: comment again — every comment is a genuinely new row (no
    // idempotency concern), so the cache must increment again, exactly
    // matching the now-2 real Comment row count.
    await request(app.getHttpServer())
      .post(`/posts/${post.id}/comments`)
      .set('Authorization', `Bearer ${actor.accessToken}`)
      .send({ contentText: 'Second comment in the drift-proof sequence' })
      .expect(201);
    await assertCountersMatchRealRows(post.id);

    // Final sanity check on the exact numbers, not just "they match each
    // other" — pins the sequence's expected end state explicitly.
    const finalPost = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(finalPost.likeCount).toBe(0);
    expect(finalPost.commentCount).toBe(2);
  });
});
