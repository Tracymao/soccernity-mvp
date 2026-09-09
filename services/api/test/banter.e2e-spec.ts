import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-3/banter-rooms-backend — Build Plan Section 4.4 (Banter Rooms
// half). Hits test/README.md's e2e triggers:
//   - a genuinely NEW Prisma relation/constraint: BanterRoomMember, its
//     @@unique([userId, banterRoomId]), and its onDelete: Cascade FKs —
//     never exercised against a real Postgres before this PR.
//   - transaction reasoning: BanterRoom.memberCount incremented/
//     decremented transactionally alongside the member row, proven never
//     to drift or go negative across a real operation sequence, and a
//     genuine concurrent double-join.
// The mocked unit suite (src/modules/banter/*.spec.ts) covers DTO
// validation, guard wiring, the branching logic and the P2002/P2025
// idempotency paths a mock can prove.
//
// Users are seeded directly via Prisma + a real TokenService-minted
// access token (createUser), not POST /auth/register — the same pattern
// clubs.e2e-spec.ts / grassroots.e2e-spec.ts use. None of the Banter
// endpoints carry @AuthRateLimit(), so this is a speed choice, not a
// rate-limit workaround: every downstream request still exercises the
// real JwtAuthGuard -> TokenService.verifyAccessToken and (for writes)
// the real GuardianConsentGuard chain.
describe('Banter Rooms e2e (Section 4.4, /banter-rooms half)', () => {
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

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-banter-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Banter ${label}`,
        dateOfBirth: new Date('1994-05-05'), // adult — GuardianConsentGuard passes
        isMinor: false,
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  // A minor whose guardian has NOT confirmed consent — the exact state
  // GuardianConsentGuard blocks (Build Plan Section 8.3 step 5 / 5.7).
  async function createRestrictedMinor(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-banter-minor-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused',
        displayName: `E2E Banter Minor ${label}`,
        dateOfBirth: new Date('2014-01-01'),
        isMinor: true,
        guardian: {
          create: {
            name: 'Guardian Name',
            email: `guardian-${label}-${Date.now()}@example.com`,
            relationship: 'Parent',
            consentStatus: 'pending',
            consentToken: `tok-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
          },
        },
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createRoom(
    token: string,
    over: Partial<{ name: string; scopeType: string }> = {},
  ): Promise<{ id: string; memberCount: number }> {
    const res = await request(server())
      .post('/banter-rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: over.name ?? 'Gooners Only', scopeType: over.scopeType ?? 'club' })
      .expect(201);
    return { id: res.body.id as string, memberCount: res.body.memberCount as number };
  }

  async function realMemberRowCount(roomId: string): Promise<number> {
    const prisma = getTestPrismaClient();
    return prisma.banterRoomMember.count({ where: { banterRoomId: roomId } });
  }
  async function cachedMemberCount(roomId: string): Promise<number> {
    const prisma = getTestPrismaClient();
    const row = await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } });
    return row.memberCount;
  }

  // ---------- Create + auto-join ----------

  describe('POST /banter-rooms', () => {
    it('creates a room owned by the caller, auto-joins them (memberCount 1, one real BanterRoomMember row), and it shows in "My Bants"', async () => {
      const creator = await createUser('creator');

      const create = await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ name: 'Gooners Only', scopeType: 'club' })
        .expect(201);

      expect(create.body).toEqual({
        id: expect.any(String),
        name: 'Gooners Only',
        scopeType: 'club',
        createdBy: creator.userId,
        memberCount: 1,
        joined: true,
      });

      expect(await realMemberRowCount(create.body.id)).toBe(1);
      expect(await cachedMemberCount(create.body.id)).toBe(1);

      const mine = await request(server())
        .get('/banter-rooms/mine')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(mine.body.items.map((r: { id: string }) => r.id)).toEqual([create.body.id]);
      expect(mine.body.items[0].joined).toBe(true);
    });

    it('rejects an unknown scopeType (400) and requires auth (401)', async () => {
      const { accessToken } = await createUser('validate');
      await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Bad Room', scopeType: 'stadium' })
        .expect(400);
      await request(server()).post('/banter-rooms').send({ name: 'X Y', scopeType: 'topic' }).expect(401);
    });
  });

  // ---------- Join / leave: memberCount discipline (transaction reasoning) ----------

  describe('POST/DELETE /banter-rooms/:id/join', () => {
    it('a full join -> join -> leave -> leave -> join cycle keeps memberCount and the real row count in lockstep, never drifting, never negative', async () => {
      const creator = await createUser('cycle-creator'); // auto-joined, count 1
      const joiner = await createUser('cycle-joiner');
      const room = await createRoom(creator.accessToken);
      expect(room.memberCount).toBe(1);

      const hit = (method: 'post' | 'delete') =>
        request(server())
          [method](`/banter-rooms/${room.id}/join`)
          .set('Authorization', `Bearer ${joiner.accessToken}`)
          .expect(200);

      const j1 = await hit('post');
      expect(j1.body).toEqual({ roomId: room.id, joined: true, memberCount: 2 });
      expect(await realMemberRowCount(room.id)).toBe(2);
      expect(await cachedMemberCount(room.id)).toBe(2);

      // Duplicate join — idempotent, must NOT double-increment.
      const j2 = await hit('post');
      expect(j2.body).toEqual({ roomId: room.id, joined: true, memberCount: 2 });
      expect(await realMemberRowCount(room.id)).toBe(2);

      const l1 = await hit('delete');
      expect(l1.body).toEqual({ roomId: room.id, joined: false, memberCount: 1 });
      expect(await realMemberRowCount(room.id)).toBe(1);
      expect(await cachedMemberCount(room.id)).toBe(1);

      // Leaving again when not a member — idempotent, memberCount unchanged.
      const l2 = await hit('delete');
      expect(l2.body).toEqual({ roomId: room.id, joined: false, memberCount: 1 });
      expect(await cachedMemberCount(room.id)).toBe(1);

      // Rejoin — proves leaving left no poisoned unique-index/row state.
      const j3 = await hit('post');
      expect(j3.body).toEqual({ roomId: room.id, joined: true, memberCount: 2 });
      expect(await realMemberRowCount(room.id)).toBe(2);
      expect(await cachedMemberCount(room.id)).toBe(2);
    });

    it('two concurrent joins by the same user produce exactly one BanterRoomMember row and memberCount incremented exactly once', async () => {
      const creator = await createUser('conc-creator'); // count 1
      const joiner = await createUser('conc-joiner');
      const room = await createRoom(creator.accessToken);

      const fire = () =>
        request(server())
          .post(`/banter-rooms/${room.id}/join`)
          .set('Authorization', `Bearer ${joiner.accessToken}`);

      const [r1, r2] = await Promise.all([fire(), fire()]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.body.joined).toBe(true);
      expect(r2.body.joined).toBe(true);

      // The whole point: exactly one row, count went 1 -> 2, not 1 -> 3.
      expect(await realMemberRowCount(room.id)).toBe(2);
      expect(await cachedMemberCount(room.id)).toBe(2);
    });

    it('leaving a non-existent room is a 404; join/leave require auth', async () => {
      const { accessToken } = await createUser('jl-404');
      await request(server())
        .post('/banter-rooms/does-not-exist/join')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(server())
        .delete('/banter-rooms/does-not-exist/join')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(server()).post('/banter-rooms/x/join').expect(401);
    });
  });

  // ---------- List / search filters + pagination ----------

  describe('GET /banter-rooms + /search', () => {
    it('filters by scopeType and by name (case-insensitive), and keyset-paginates alphabetically', async () => {
      const owner = await createUser('list-owner');
      await createRoom(owner.accessToken, { name: 'Anfield Chat', scopeType: 'club' });
      await createRoom(owner.accessToken, { name: 'Bragging Rights', scopeType: 'club' });
      await createRoom(owner.accessToken, { name: 'Zonal Marking', scopeType: 'topic' });
      await createRoom(owner.accessToken, { name: 'Premier League Talk', scopeType: 'league' });

      const clubsOnly = await request(server())
        .get('/banter-rooms?scopeType=club&limit=1')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(clubsOnly.body.items.map((r: { name: string }) => r.name)).toEqual(['Anfield Chat']);
      expect(clubsOnly.body.nextCursor).toEqual(expect.any(String));

      const clubsPage2 = await request(server())
        .get(`/banter-rooms?scopeType=club&limit=1&cursor=${encodeURIComponent(clubsOnly.body.nextCursor)}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(clubsPage2.body.items.map((r: { name: string }) => r.name)).toEqual(['Bragging Rights']);
      expect(clubsPage2.body.nextCursor).toBeNull();

      const byName = await request(server())
        .get('/banter-rooms/search?q=MARK')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(byName.body.items.map((r: { name: string }) => r.name)).toEqual(['Zonal Marking']);
    });

    it('GET /banter-rooms reports per-caller joined correctly, scoped to the calling user', async () => {
      const owner = await createUser('joined-owner');
      const other = await createUser('joined-other');
      const room = await createRoom(owner.accessToken, { name: 'Shared Room' });

      await request(server())
        .post(`/banter-rooms/${room.id}/join`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);

      const asOwner = await request(server())
        .get('/banter-rooms')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const asStranger = await request(server())
        .get('/banter-rooms')
        .set('Authorization', `Bearer ${(await createUser('joined-stranger')).accessToken}`)
        .expect(200);

      expect(asOwner.body.items.find((r: { id: string }) => r.id === room.id).joined).toBe(true);
      expect(asStranger.body.items.find((r: { id: string }) => r.id === room.id).joined).toBe(false);
    });
  });

  // ---------- GuardianConsentGuard: read yes, write no ----------

  describe('a restricted-pending minor', () => {
    it('can browse and read Banter Rooms, but cannot create, join, or post (403 guardian_consent_pending)', async () => {
      const adult = await createUser('guard-adult');
      const minor = await createRestrictedMinor('guard');
      const room = await createRoom(adult.accessToken, { name: 'Adults FC' });

      // Reads are fine.
      await request(server())
        .get('/banter-rooms')
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(200);
      await request(server())
        .get(`/banter-rooms/${room.id}`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(200);
      await request(server())
        .get(`/banter-rooms/${room.id}/posts`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(200);

      // Writes are blocked, and nothing changes.
      const createBlocked = await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .send({ name: 'Minor Room', scopeType: 'topic' })
        .expect(403);
      expect(createBlocked.body.code).toBe('guardian_consent_pending');

      await request(server())
        .post(`/banter-rooms/${room.id}/join`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(403);
      await request(server())
        .post(`/banter-rooms/${room.id}/posts`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .send({ contentText: 'let me in' })
        .expect(403);

      const prisma = getTestPrismaClient();
      expect(await prisma.banterRoom.count()).toBe(1); // only the adult's
      expect(await cachedMemberCount(room.id)).toBe(1); // only the adult
    });
  });

  // ---------- Room posting + room feed (reads Post.banterRoomId) ----------

  describe('POST + GET /banter-rooms/:id/posts', () => {
    it('a member can post into a room, a non-member gets 403, and the room feed shows only that room\'s posts', async () => {
      const owner = await createUser('post-owner');
      const nonMember = await createUser('post-nonmember');
      const roomA = await createRoom(owner.accessToken, { name: 'Room A' });
      const roomB = await createRoom(owner.accessToken, { name: 'Room B' });

      // Non-member cannot post.
      await request(server())
        .post(`/banter-rooms/${roomA.id}/posts`)
        .set('Authorization', `Bearer ${nonMember.accessToken}`)
        .send({ contentText: 'sneaking in' })
        .expect(403);

      // Owner is a member (auto-joined) — can post into both rooms.
      const inA = await request(server())
        .post(`/banter-rooms/${roomA.id}/posts`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ contentText: 'hello room A' })
        .expect(201);
      expect(inA.body.banterRoomId).toBe(roomA.id);
      await request(server())
        .post(`/banter-rooms/${roomB.id}/posts`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .send({ contentText: 'hello room B' })
        .expect(201);

      const feedA = await request(server())
        .get(`/banter-rooms/${roomA.id}/posts`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(feedA.body.items.map((p: { contentText: string }) => p.contentText)).toEqual([
        'hello room A',
      ]);
      // FeedPostWithViewerState shape (Decision Log #153) — same as GET /posts/feed.
      expect(feedA.body.items[0]).toHaveProperty('isLiked', false);
      expect(feedA.body.items[0]).toHaveProperty('isSaved', false);
      expect(feedA.body.items[0].author).toHaveProperty('isFollowing');
      expect(feedA.body.items[0].author).not.toHaveProperty('isMinor');

      // And the room post is confirmed in Postgres against Post.banterRoomId.
      const prisma = getTestPrismaClient();
      expect(await prisma.post.count({ where: { banterRoomId: roomA.id } })).toBe(1);

      // A post to a room the caller then leaves still belongs to the room.
      await request(server())
        .delete(`/banter-rooms/${roomA.id}/join`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const stillThere = await request(server())
        .get(`/banter-rooms/${roomA.id}/posts`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(stillThere.body.items).toHaveLength(1);
    });

    it('GET /banter-rooms/:id/posts 404s for a non-existent room', async () => {
      const { accessToken } = await createUser('feed-404');
      await request(server())
        .get('/banter-rooms/does-not-exist/posts')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  // ---------- Cascade on User delete ----------

  describe('account deletion cascade (Decision Log #44)', () => {
    it('hard-deleting a User cascades their BanterRoomMember rows away, leaving the room and other members intact', async () => {
      const prisma = getTestPrismaClient();
      const creator = await createUser('cascade-creator');
      const leaver = await createUser('cascade-leaver');
      const room = await createRoom(creator.accessToken); // creator auto-joined

      await request(server())
        .post(`/banter-rooms/${room.id}/join`)
        .set('Authorization', `Bearer ${leaver.accessToken}`)
        .expect(200);
      expect(await realMemberRowCount(room.id)).toBe(2);

      // A real hard delete, the same operation AccountDeletionSweepService
      // performs after the 30-day grace period.
      await prisma.user.delete({ where: { id: leaver.userId } });

      // The membership row is gone; the room and the creator's own
      // membership survive. (memberCount is a denormalized cache — the
      // cascade doesn't touch it, matching how a raw hard delete behaves;
      // the real row count is the source of truth.)
      expect(await realMemberRowCount(room.id)).toBe(1);
      expect(
        await prisma.banterRoomMember.count({ where: { userId: creator.userId } }),
      ).toBe(1);
      await prisma.banterRoom.findUniqueOrThrow({ where: { id: room.id } });
    });
  });
});
