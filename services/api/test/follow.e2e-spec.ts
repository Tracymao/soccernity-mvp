import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// Real-Postgres coverage for UsersService.followUser/unfollowUser/
// getFollowers/getFollowing's transactional and notification-direction
// logic (see users.service.ts's own comments) — the same category (2)
// "transaction/isolation-level reasoning" test/README.md's guiding
// principle calls out for e2e coverage, mirroring feed-reactions.e2e-spec
// .ts's like/comment coverage for the Follow model's own P2002-idempotent
// create + same-transaction Notification write.
describe('Follow e2e: follow/unfollow, notification direction, and followers/following listing against real Postgres', () => {
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
    return `e2e-follow-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // Same real gap as feed-reactions.e2e-spec.ts's own detailed comment on
  // its identically-named helper: this file also needs more distinct
  // users across a single spec file's real HTTP traffic than real POST
  // /auth/register's hardcoded (not actually env-configurable — see the
  // other file's comment for the full explanation) 5-requests/60s
  // AuthThrottlerGuard limit allows. Seeds the User row directly via
  // Prisma and mints a real access token via the real, unmocked
  // TokenService pulled from this test's own DI container — every
  // downstream request still exercises the real JwtAuthGuard ->
  // TokenService.verifyAccessToken chain; only register's own HTTP/
  // rate-limiter/argon2id path is bypassed, and that path is already
  // covered by auth.e2e-spec.ts.
  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Follow User ${label}`,
        dateOfBirth: new Date('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });

    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);

    return { userId: user.id, accessToken: accessToken.token };
  }

  it('rejects self-follow with 400 and creates no Follow row', async () => {
    const user = await createUser('self');

    await request(app.getHttpServer())
      .post(`/users/${user.userId}/follow`)
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(400);

    const prisma = getTestPrismaClient();
    const followRows = await prisma.follow.findMany({
      where: { followerId: user.userId, followeeId: user.userId },
    });
    expect(followRows).toHaveLength(0);
  });

  it('follow is idempotent — double-follow produces exactly one Follow row and exactly one Notification row, addressed to the person being followed', async () => {
    const follower = await createUser('follower');
    const followee = await createUser('followee');

    const firstFollow = await request(app.getHttpServer())
      .post(`/users/${followee.userId}/follow`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(firstFollow.body).toEqual({ following: true });

    const secondFollow = await request(app.getHttpServer())
      .post(`/users/${followee.userId}/follow`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(secondFollow.body).toEqual({ following: true });

    const prisma = getTestPrismaClient();
    const followRows = await prisma.follow.findMany({
      where: { followerId: follower.userId, followeeId: followee.userId },
    });
    expect(followRows).toHaveLength(1);

    // Notification direction: recipient (userId) is the person being
    // followed (followee), payloadRefId is the FOLLOWER's own userId —
    // this is the exact direction called out as easiest to get backwards.
    const notifications = await prisma.notification.findMany({
      where: { type: 'follow', payloadRefId: follower.userId },
    });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.userId).toBe(followee.userId);
    expect(notifications[0]!.userId).not.toBe(follower.userId);
  });

  it('unfollow is idempotent — removes the Follow row, and unfollowing again is a no-op', async () => {
    const follower = await createUser('follower');
    const followee = await createUser('followee');

    await request(app.getHttpServer())
      .post(`/users/${followee.userId}/follow`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);

    const firstUnfollow = await request(app.getHttpServer())
      .delete(`/users/${followee.userId}/follow`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(firstUnfollow.body).toEqual({ following: false });

    const secondUnfollow = await request(app.getHttpServer())
      .delete(`/users/${followee.userId}/follow`)
      .set('Authorization', `Bearer ${follower.accessToken}`)
      .expect(200);
    expect(secondUnfollow.body).toEqual({ following: false });

    const prisma = getTestPrismaClient();
    const followRows = await prisma.follow.findMany({
      where: { followerId: follower.userId, followeeId: followee.userId },
    });
    expect(followRows).toHaveLength(0);
  });

  describe('GET /users/:id/followers and GET /users/:id/following — seeded directly via Prisma, verified against the real HTTP response', () => {
    it('followers: response items and pagination match real Follow rows in the database', async () => {
      const target = await createUser('target');
      const followerA = await createUser('follower-a');
      const followerB = await createUser('follower-b');
      const followerC = await createUser('follower-c');

      const prisma = getTestPrismaClient();
      // Seed directly via Prisma, not via POST /users/:id/follow — this
      // is testing the read path, not the follow write path (already
      // covered above).
      await prisma.follow.create({ data: { followerId: followerA.userId, followeeId: target.userId } });
      await prisma.follow.create({ data: { followerId: followerB.userId, followeeId: target.userId } });
      await prisma.follow.create({ data: { followerId: followerC.userId, followeeId: target.userId } });

      const response = await request(app.getHttpServer())
        .get(`/users/${target.userId}/followers?limit=2`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.nextCursor).toEqual(expect.any(String));

      const returnedIds = response.body.items.map((item: { id: string }) => item.id);
      const expectedIds = [followerA.userId, followerB.userId, followerC.userId];
      for (const id of returnedIds) {
        expect(expectedIds).toContain(id);
      }

      // Follow the cursor to the second page and confirm the remaining
      // follower is returned with no further page after it.
      const secondPage = await request(app.getHttpServer())
        .get(`/users/${target.userId}/followers?limit=2&cursor=${encodeURIComponent(response.body.nextCursor)}`)
        .set('Authorization', `Bearer ${target.accessToken}`)
        .expect(200);

      expect(secondPage.body.items).toHaveLength(1);
      expect(secondPage.body.nextCursor).toBeNull();

      const allReturnedIds = [...returnedIds, secondPage.body.items[0].id];
      expect(new Set(allReturnedIds)).toEqual(new Set(expectedIds));
    });

    it('following: response items match real Follow rows where the target user is the follower', async () => {
      const source = await createUser('source');
      const followeeA = await createUser('followee-a');
      const followeeB = await createUser('followee-b');

      const prisma = getTestPrismaClient();
      await prisma.follow.create({ data: { followerId: source.userId, followeeId: followeeA.userId } });
      await prisma.follow.create({ data: { followerId: source.userId, followeeId: followeeB.userId } });

      const response = await request(app.getHttpServer())
        .get(`/users/${source.userId}/following`)
        .set('Authorization', `Bearer ${source.accessToken}`)
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.nextCursor).toBeNull();

      const returnedIds = response.body.items.map((item: { id: string }) => item.id);
      expect(new Set(returnedIds)).toEqual(new Set([followeeA.userId, followeeB.userId]));
    });
  });
});
