import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for POST /posts/:id/view
// (sprint-4/post-view-tracking) — guiding-principle trigger #3 from this
// file's own README ("a genuinely novel Prisma relation or constraint").
// PostView.@@unique([viewerId, postId]) is nullable on viewerId, and the
// entire "logged-in view is deduplicated, anonymous view isn't" design
// this endpoint documents rests on Postgres's real behavior that NULL is
// never considered equal to another NULL under a unique index — a mock
// can be made to assert whatever the code author believes that behavior
// to be, which is exactly the failure mode this layer exists to catch.
// See feed.service.ts's recordView() and schema.prisma's PostView model
// for the full reasoning this spec proves against a live engine.
describe('Post view tracking e2e: POST /posts/:id/view against real Postgres', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  function uniqueEmail(label: string): string {
    return `e2e-post-view-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Same "seed the User row directly via Prisma, mint a real access token
  // via the real TokenService" pattern feed-reactions.e2e-spec.ts's own
  // createUser() helper established and documents in full — the real
  // register/login HTTP path (with its own rate limiter) is already
  // covered elsewhere and isn't what this file's coverage is about.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E View User ${label}`,
        dateOfBirth: new Date('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });

    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);

    return { userId: user.id, accessToken: accessToken.token };
  }

  // Post rows are seeded directly via Prisma — same precedent
  // feed-reactions.e2e-spec.ts's own seedPost() set, since this file is
  // about the view-tracking endpoint's own transactional/constraint
  // behavior, not about proving POST /posts works.
  async function seedPost(authorId: string) {
    const prisma = getTestPrismaClient();
    return prisma.post.create({
      data: { authorId, contentText: 'A real seeded post for e2e view tracking', mediaUrls: [] },
    });
  }

  it('creates a PostView row and increments Post.viewCount for a logged-in viewer, and is idempotent on a repeat view', async () => {
    const author = await createUser('author');
    const viewer = await createUser('viewer');
    const post = await seedPost(author.userId);

    const first = await request(app.getHttpServer())
      .post(`/posts/${post.id}/view`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(200);
    expect(first.body).toEqual({ postId: post.id, viewCount: 1 });

    const second = await request(app.getHttpServer())
      .post(`/posts/${post.id}/view`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(200);
    // The bug this guards against: a naive implementation double-
    // incrementing viewCount to 2 on the repeat call from the same real
    // user instead of staying at 1.
    expect(second.body).toEqual({ postId: post.id, viewCount: 1 });

    const prisma = getTestPrismaClient();
    const viewRows = await prisma.postView.findMany({ where: { viewerId: viewer.userId, postId: post.id } });
    expect(viewRows).toHaveLength(1);

    const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(postRow.viewCount).toBe(1);
  });

  it('records a genuine concurrent double-view from the same logged-in user as exactly one row (transaction/isolation-level proof)', async () => {
    const author = await createUser('author');
    const viewer = await createUser('viewer');
    const post = await seedPost(author.userId);

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/posts/${post.id}/view`)
        .set('Authorization', `Bearer ${viewer.accessToken}`),
      request(app.getHttpServer())
        .post(`/posts/${post.id}/view`)
        .set('Authorization', `Bearer ${viewer.accessToken}`),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    const prisma = getTestPrismaClient();
    const viewRows = await prisma.postView.findMany({ where: { viewerId: viewer.userId, postId: post.id } });
    expect(viewRows).toHaveLength(1);

    const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(postRow.viewCount).toBe(1);
  });

  it('records an anonymous view with viewerId null, with no Authorization header at all', async () => {
    const author = await createUser('author');
    const post = await seedPost(author.userId);

    const response = await request(app.getHttpServer()).post(`/posts/${post.id}/view`).expect(200);
    expect(response.body).toEqual({ postId: post.id, viewCount: 1 });

    const prisma = getTestPrismaClient();
    const viewRows = await prisma.postView.findMany({ where: { postId: post.id } });
    expect(viewRows).toHaveLength(1);
    expect(viewRows[0].viewerId).toBeNull();
  });

  // The behavior schema.prisma's own PostView comment documents as a
  // deliberate, disclosed tradeoff, proven here against the real
  // database rather than just asserted in a comment: Postgres never
  // treats two NULLs as equal under a unique index, so
  // @@unique([viewerId, postId]) provides NO de-duplication when
  // viewerId is null — every anonymous call is a genuinely distinct row,
  // and Post.viewCount increments every single time.
  it('does NOT de-duplicate anonymous views — repeated anonymous calls each create a new PostView row and viewCount keeps incrementing', async () => {
    const author = await createUser('author');
    const post = await seedPost(author.userId);

    const first = await request(app.getHttpServer()).post(`/posts/${post.id}/view`).expect(200);
    expect(first.body).toEqual({ postId: post.id, viewCount: 1 });

    const second = await request(app.getHttpServer()).post(`/posts/${post.id}/view`).expect(200);
    expect(second.body).toEqual({ postId: post.id, viewCount: 2 });

    const third = await request(app.getHttpServer()).post(`/posts/${post.id}/view`).expect(200);
    expect(third.body).toEqual({ postId: post.id, viewCount: 3 });

    const prisma = getTestPrismaClient();
    const viewRows = await prisma.postView.findMany({ where: { postId: post.id, viewerId: null } });
    expect(viewRows).toHaveLength(3);

    const postRow = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(postRow.viewCount).toBe(3);
  });

  it('a logged-in view and an anonymous view on the same post are independently counted, not conflated', async () => {
    const author = await createUser('author');
    const viewer = await createUser('viewer');
    const post = await seedPost(author.userId);

    await request(app.getHttpServer())
      .post(`/posts/${post.id}/view`)
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(200);
    const anonymous = await request(app.getHttpServer()).post(`/posts/${post.id}/view`).expect(200);

    expect(anonymous.body).toEqual({ postId: post.id, viewCount: 2 });

    const prisma = getTestPrismaClient();
    const viewRows = await prisma.postView.findMany({ where: { postId: post.id } });
    expect(viewRows).toHaveLength(2);
    expect(viewRows.filter((v) => v.viewerId === viewer.userId)).toHaveLength(1);
    expect(viewRows.filter((v) => v.viewerId === null)).toHaveLength(1);
  });

  it('returns a real 404 for a non-existent postId, for both a logged-in and an anonymous caller', async () => {
    const viewer = await createUser('viewer');

    await request(app.getHttpServer())
      .post('/posts/00000000-0000-0000-0000-000000000000/view')
      .set('Authorization', `Bearer ${viewer.accessToken}`)
      .expect(404);

    await request(app.getHttpServer()).post('/posts/00000000-0000-0000-0000-000000000000/view').expect(404);
  });

  it('degrades an invalid bearer token to an anonymous view (200, not 401)', async () => {
    const author = await createUser('author');
    const post = await seedPost(author.userId);

    const response = await request(app.getHttpServer())
      .post(`/posts/${post.id}/view`)
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(200);

    expect(response.body).toEqual({ postId: post.id, viewCount: 1 });

    const prisma = getTestPrismaClient();
    const viewRows = await prisma.postView.findMany({ where: { postId: post.id } });
    expect(viewRows).toHaveLength(1);
    expect(viewRows[0].viewerId).toBeNull();
  });
});
