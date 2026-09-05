import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for sprint-2/account-deactivation-backend
// (Decision Log #221). Two things the mocked unit suites can't prove on
// their own:
//
//  1. The FULL lifecycle sequence the task brief calls out explicitly:
//     deactivate -> reactivate -> deactivate -> delete-from-inactive ->
//     the 30-day grace period -> hard-delete via the SAME
//     AccountDeletionSweepService the direct-delete flow uses (no
//     duplicated deletion logic). This must run against a real database
//     because it spans two unauthenticated credential endpoints, real
//     session revocation, and the sweep's own `pendingDeletionAt <=
//     cutoff` query.
//
//  2. The read-visibility filters (feed / single post) genuinely take a
//     real Postgres `WHERE author.accountStatus = 'active'` into account,
//     and REVERSE cleanly on reactivation with no per-row backfill.
//
// Each describe block gets its OWN app instance / fresh in-memory
// AuthThrottlerGuard bucket, and block 1 is careful to stay under the
// shared 'auth' named-throttler's 5-requests/60s limit (reactivate +
// delete-inactive + login + reactivate = 4 rate-limited calls; the two
// deactivate calls are JwtAuthGuard-only and unlimited).

describe('Account deactivation e2e: full deactivate -> reactivate -> deactivate -> delete-from-inactive -> grace-period sweep (real Postgres)', () => {
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

  function uniqueEmail(label: string): string {
    return `e2e-deact-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function createUser(label: string, password: string): Promise<{ userId: string; email: string }> {
    const prisma = getTestPrismaClient();
    const passwordService = app.get(PasswordService);
    const email = uniqueEmail(label);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await passwordService.hash(password),
        displayName: `E2E Deactivation User ${label}`,
        dateOfBirth: new Date('1998-07-04'),
        isMinor: false,
      },
    });
    return { userId: user.id, email };
  }

  it('runs the whole sequence end to end, and delete-from-inactive feeds the existing 30-day grace + hard-delete flow byte-identically', async () => {
    const prisma = getTestPrismaClient();
    const password = 'the-real-password-abc';
    const { userId, email } = await createUser('sequence', password);
    const tokenService = app.get(TokenService);

    // --- (1) deactivate (authenticated) ---
    const firstToken = (await tokenService.issueTokenPair(userId, 'fan')).accessToken.token;
    await request(app.getHttpServer())
      .post('/auth/deactivate-account')
      .set('Authorization', `Bearer ${firstToken}`)
      .send({ password })
      .expect(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).accountStatus).toBe(
      'deactivated',
    );

    // --- (2) reactivate (unauthenticated), no time limit, no restrictions ---
    const reactivate1 = await request(app.getHttpServer())
      .post('/auth/reactivate-account')
      .send({ email, password })
      .expect(200);
    const reactivatedToken = reactivate1.body.accessToken as string;
    expect(reactivatedToken).toEqual(expect.any(String));
    const afterReactivate = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterReactivate.accountStatus).toBe('active');
    expect(afterReactivate.pendingDeletionAt).toBeNull();

    // --- (3) deactivate again, using the token the reactivate call returned ---
    await request(app.getHttpServer())
      .post('/auth/deactivate-account')
      .set('Authorization', `Bearer ${reactivatedToken}`)
      .send({ password })
      .expect(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).accountStatus).toBe(
      'deactivated',
    );

    // --- (4) delete FROM the inactive state (unauthenticated) ---
    const before = Date.now();
    await request(app.getHttpServer())
      .post('/auth/delete-inactive-account')
      .send({ email, password })
      .expect(204);
    const after = Date.now();

    const afterDelete = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterDelete.accountStatus).toBe('pending_deletion');
    // The 30-day clock started now, via the SAME field the authenticated
    // POST /auth/delete-account sets (AuthService.startPendingDeletion).
    expect(afterDelete.pendingDeletionAt).not.toBeNull();
    const pendingAt = afterDelete.pendingDeletionAt!.getTime();
    expect(pendingAt).toBeGreaterThanOrEqual(before);
    expect(pendingAt).toBeLessThanOrEqual(after);

    // --- (5) it is genuinely on the deletion path now, not the reversible one ---
    await request(app.getHttpServer()).post('/auth/login').send({ email, password }).expect(401);
    const reactivate2 = await request(app.getHttpServer())
      .post('/auth/reactivate-account')
      .send({ email, password })
      .expect(401);
    expect(reactivate2.body.message).toBe('Invalid credentials');
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).accountStatus,
    ).toBe('pending_deletion');

    // --- (6) the real sweep, 31 days later, hard-deletes the row ---
    const sweepService = app.get(AccountDeletionSweepService);
    const thirtyOneDaysLater = new Date(afterDelete.pendingDeletionAt!.getTime() + 31 * 24 * 60 * 60 * 1000);
    const result = await sweepService.sweepPendingDeletions(thirtyOneDaysLater);

    expect(result.hardDeletedUserIds).toContain(userId);
    expect(result.blockedUserIds).toHaveLength(0);
    expect(await prisma.user.findUnique({ where: { id: userId } })).toBeNull();
  });

  it('delete-from-inactive is NOT reachable for an active account (it must use the authenticated POST /auth/delete-account)', async () => {
    const prisma = getTestPrismaClient();
    const password = 'the-real-password-def';
    const { userId, email } = await createUser('still-active', password);

    await request(app.getHttpServer())
      .post('/auth/delete-inactive-account')
      .send({ email, password })
      .expect(401);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.accountStatus).toBe('active');
    expect(row.pendingDeletionAt).toBeNull();
  });
});

describe('Account deactivation e2e: an inactive account\'s content disappears from feeds and reappears on reactivate (real Postgres)', () => {
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

  function uniqueEmail(label: string): string {
    return `e2e-deact-vis-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Seed directly + mint a real token via the real TokenService (the same
  // pattern feed-reactions.e2e-spec.ts uses) — this block is about the
  // read-side WHERE filter, not the deactivate ENDPOINT (block 1 covers
  // that), so it flips accountStatus with a plain Prisma update.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Deactivation Visibility ${label}`,
        dateOfBirth: new Date('1998-07-04'),
        isMinor: false,
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  it('hides a deactivated author\'s post from a follower\'s feed and 404s GET /posts/:id, then restores both on reactivate', async () => {
    const prisma = getTestPrismaClient();
    const author = await createUser('author');
    const follower = await createUser('follower');

    // follower follows author; author posts.
    await prisma.follow.create({ data: { followerId: follower.userId, followeeId: author.userId } });
    const post = await prisma.post.create({
      data: { authorId: author.userId, contentText: 'a post by the soon-to-be-deactivated author', mediaUrls: [] },
    });

    const feedWhileActive = await request(app.getHttpServer())
      .get('/posts/feed')
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(feedWhileActive.body.items.map((p: { id: string }) => p.id)).toContain(post.id);

    await request(app.getHttpServer())
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);

    // --- author deactivates ---
    await prisma.user.update({ where: { id: author.userId }, data: { accountStatus: 'deactivated' } });

    const feedWhileDeactivated = await request(app.getHttpServer())
      .get('/posts/feed')
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(feedWhileDeactivated.body.items.map((p: { id: string }) => p.id)).not.toContain(post.id);

    await request(app.getHttpServer())
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(404);

    // --- author reactivates: no per-post backfill, the post simply reappears ---
    await prisma.user.update({ where: { id: author.userId }, data: { accountStatus: 'active' } });

    const feedAfterReactivate = await request(app.getHttpServer())
      .get('/posts/feed')
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(feedAfterReactivate.body.items.map((p: { id: string }) => p.id)).toContain(post.id);

    await request(app.getHttpServer())
      .get(`/posts/${post.id}`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
  });

  it('a deactivated user drops out of another user\'s followers list, and their own follow-graph 404s', async () => {
    const prisma = getTestPrismaClient();
    const target = await createUser('target');
    const fan = await createUser('fan');

    await prisma.follow.create({ data: { followerId: fan.userId, followeeId: target.userId } });

    const followersWhileActive = await request(app.getHttpServer())
      .get(`/users/${target.userId}/followers`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(200);
    expect(followersWhileActive.body.items.map((u: { id: string }) => u.id)).toContain(fan.userId);

    await prisma.user.update({ where: { id: fan.userId }, data: { accountStatus: 'deactivated' } });

    const followersAfter = await request(app.getHttpServer())
      .get(`/users/${target.userId}/followers`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(200);
    expect(followersAfter.body.items.map((u: { id: string }) => u.id)).not.toContain(fan.userId);

    // The deactivated user's OWN follower/following graph is hidden entirely.
    await request(app.getHttpServer())
      .get(`/users/${fan.userId}/followers`)
      .set('Authorization', `Bearer ${target.accessToken}`)
      .expect(404);
  });
});
