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
// sprint-3/banter-room-topics (Decision Log #276) adds two more real
// Prisma relations/constraints this file now also proves against Postgres:
// Topic.nameNormalized's own @@unique (a genuine concurrent double-create
// of the SAME normalized name, from two different rooms, must resolve to
// one Topic row) and BanterRoomTopic's @@unique([banterRoomId, topicId])
// (idempotent re-attach, a genuine concurrent double-attach).
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

  // Defaults to a topic-scoped room: a club-scoped room now REQUIRES a real
  // club the caller belongs to (Decision Log #276 item b), so the generic
  // helper no longer defaults to 'club'. Club rooms go through
  // seedClubFor + an explicit scopeRef.
  async function createRoom(
    token: string,
    over: Partial<{ name: string; scopeType: string; scopeRef: string }> = {},
  ): Promise<{ id: string; memberCount: number }> {
    const res = await request(server())
      .post('/banter-rooms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: over.name ?? 'Gooners Only',
        scopeType: over.scopeType ?? 'topic',
        ...(over.scopeRef ? { scopeRef: over.scopeRef } : {}),
      })
      .expect(201);
    return { id: res.body.id as string, memberCount: res.body.memberCount as number };
  }

  // A real ClubPage with `memberUserId` already a member — the only way a
  // user becomes affiliated with a club (ClubPage.members, the populated
  // membership mechanism). Seeded directly so this spec doesn't depend on
  // the club-join endpoint's own rate-limited setup.
  async function seedClubFor(memberUserId: string, name: string): Promise<{ id: string; name: string }> {
    const prisma = getTestPrismaClient();
    const club = await prisma.clubPage.create({
      data: { name, memberCount: 1, members: { connect: { id: memberUserId } } },
    });
    return { id: club.id, name: club.name };
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
      const club = await seedClubFor(creator.userId, 'Arsenal');

      const create = await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ name: 'Gooners Only', scopeType: 'club', scopeRef: club.id })
        .expect(201);

      expect(create.body).toEqual({
        id: expect.any(String),
        name: 'Gooners Only',
        scopeType: 'club',
        scopeRef: club.id,
        scopeName: 'Arsenal',
        createdBy: creator.userId,
        status: 'active', // Decision Log #357
        memberCount: 1,
        joined: true,
        topics: [], // sprint-3/banter-room-topics (Decision Log #276)
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
      const club = await seedClubFor(owner.userId, 'Liverpool');
      await createRoom(owner.accessToken, { name: 'Anfield Chat', scopeType: 'club', scopeRef: club.id });
      await createRoom(owner.accessToken, { name: 'Bragging Rights', scopeType: 'club', scopeRef: club.id });
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

    // Decision Log #358 — dateFrom/dateTo filter on the real BanterRoom.createdAt
    // column. One room is backdated directly so the range can exclude it.
    it('filters by createdAt date range (whole UTC days, inclusive), and rejects dateFrom > dateTo with 400', async () => {
      const owner = await createUser('date-owner');
      await createRoom(owner.accessToken, { name: 'Recent Room', scopeType: 'topic' });
      const old = await createRoom(owner.accessToken, { name: 'Old Room', scopeType: 'topic' });
      await getTestPrismaClient().banterRoom.update({
        where: { id: old.id },
        data: { createdAt: new Date('2020-01-15T12:00:00.000Z') },
      });

      const day = (d: Date) => d.toISOString().slice(0, 10);
      const today = new Date();
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

      const names = async (query: string) => {
        const res = await request(server())
          .get(`/banter-rooms?${query}`)
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .expect(200);
        return (res.body.items as { name: string; id: string }[]).map((r) => r.name).sort();
      };

      expect(await names(`dateFrom=${day(today)}&dateTo=${day(today)}`)).toEqual(['Recent Room']);
      expect(await names(`dateFrom=2020-01-15&dateTo=2020-01-15`)).toEqual(['Old Room']);
      expect(await names(`dateFrom=${day(tomorrow)}`)).toEqual([]);
      expect(await names(`dateTo=${day(yesterday)}`)).toEqual(['Old Room']);

      await request(server())
        .get(`/banter-rooms?dateFrom=${day(tomorrow)}&dateTo=${day(yesterday)}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(400);
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

  // ---------- Scope target (Decision Log #276 item b) ----------

  describe('scopeRef / scopeName on POST /banter-rooms', () => {
    it('rejects a club room with no scopeRef (400) and writes nothing', async () => {
      const creator = await createUser('scope-noref');
      await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ name: 'Club Without Club', scopeType: 'club' })
        .expect(400);
      expect(await getTestPrismaClient().banterRoom.count()).toBe(0);
    });

    it('rejects a club scopeRef that is not a real club (404)', async () => {
      const creator = await createUser('scope-ghost');
      await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({
          name: 'Ghost Club Room',
          scopeType: 'club',
          scopeRef: '00000000-0000-4000-8000-000000000000',
        })
        .expect(404);
      expect(await getTestPrismaClient().banterRoom.count()).toBe(0);
    });

    it('rejects a club the caller is not a member of (403), even though the club exists', async () => {
      const member = await createUser('scope-member');
      const outsider = await createUser('scope-outsider');
      const club = await seedClubFor(member.userId, 'Chelsea');
      await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${outsider.accessToken}`)
        .send({ name: 'Blues Only', scopeType: 'club', scopeRef: club.id })
        .expect(403);
      expect(await getTestPrismaClient().banterRoom.count()).toBe(0);
    });

    it.each(['league', 'country', 'topic'])(
      'rejects a scopeRef on a %s room (400) — mismatched scopeType/scopeRef',
      async (scopeType) => {
        const creator = await createUser(`scope-mismatch-${scopeType}`);
        const club = await seedClubFor(creator.userId, 'Everton');
        await request(server())
          .post('/banter-rooms')
          .set('Authorization', `Bearer ${creator.accessToken}`)
          .send({ name: `Mismatched ${scopeType}`, scopeType, scopeRef: club.id })
          .expect(400);
        expect(await getTestPrismaClient().banterRoom.count()).toBe(0);
      },
    );

    it('keeps scopeName in sync: a club rename is visible on the next read and the stored snapshot is corrected', async () => {
      const creator = await createUser('scope-rename');
      const club = await seedClubFor(creator.userId, 'Arsenal');
      const room = await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ name: 'Gunners', scopeType: 'club', scopeRef: club.id })
        .expect(201);
      expect(room.body.scopeName).toBe('Arsenal');

      // Renamed out-of-band — there is no club-rename endpoint.
      await getTestPrismaClient().clubPage.update({
        where: { id: club.id },
        data: { name: 'Arsenal FC' },
      });

      const detail = await request(server())
        .get(`/banter-rooms/${room.body.id}`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(detail.body.scopeName).toBe('Arsenal FC');
      expect(detail.body.scopeRef).toBe(club.id);

      // The write-back is real, not just a response-time override.
      const stored = await getTestPrismaClient().banterRoom.findUniqueOrThrow({
        where: { id: room.body.id },
      });
      expect(stored.scopeName).toBe('Arsenal FC');

      // And the list read agrees.
      const list = await request(server())
        .get('/banter-rooms?scopeType=club')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(list.body.items[0].scopeName).toBe('Arsenal FC');
    });

    it('leaves league/country/topic rooms with a null scopeRef and scopeName', async () => {
      const creator = await createUser('scope-null');
      const league = await request(server())
        .post('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ name: 'Premier League Talk', scopeType: 'league' })
        .expect(201);
      expect(league.body.scopeRef).toBeNull();
      expect(league.body.scopeName).toBeNull();
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

  // ---------- Topics (sprint-3/banter-room-topics, Decision Log #276) ----------

  describe('GET /banter-rooms/topics + POST /banter-rooms/:id/topics', () => {
    it('the creator can attach topics; a non-creator (even a member) gets 403; nothing changes on the 403', async () => {
      const creator = await createUser('topic-creator');
      const member = await createUser('topic-member');
      const room = await createRoom(creator.accessToken, { name: 'Deadline Day Chat' });
      await request(server())
        .post(`/banter-rooms/${room.id}/join`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(200);

      const forbidden = await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .send({ names: ['Transfers'] })
        .expect(403);
      expect(forbidden.body).toBeDefined();

      const prisma = getTestPrismaClient();
      expect(await prisma.topic.count()).toBe(0);
      expect(await prisma.banterRoomTopic.count()).toBe(0);

      const attach = await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Transfers', 'Deadline Day'] })
        .expect(200);

      expect(attach.body.roomId).toBe(room.id);
      expect(attach.body.topics.map((t: { name: string }) => t.name).sort()).toEqual([
        'Deadline Day',
        'Transfers',
      ]);
      expect(await prisma.topic.count()).toBe(2);
      expect(await prisma.banterRoomTopic.count({ where: { banterRoomId: room.id } })).toBe(2);
    });

    it('attached topics are surfaced on GET /banter-rooms, GET /banter-rooms/:id, and GET /banter-rooms/mine', async () => {
      const creator = await createUser('topic-surface');
      const room = await createRoom(creator.accessToken, { name: 'Surfaced Room' });
      await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Transfers'] })
        .expect(200);

      const list = await request(server())
        .get('/banter-rooms')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(
        list.body.items.find((r: { id: string }) => r.id === room.id).topics,
      ).toEqual([{ id: expect.any(String), name: 'Transfers' }]);

      const single = await request(server())
        .get(`/banter-rooms/${room.id}`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(single.body.topics).toEqual([{ id: expect.any(String), name: 'Transfers' }]);

      const mine = await request(server())
        .get('/banter-rooms/mine')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(
        mine.body.items.find((r: { id: string }) => r.id === room.id).topics,
      ).toEqual([{ id: expect.any(String), name: 'Transfers' }]);
    });

    it('attaching the same topic twice is idempotent — no duplicate row, unaffected by casing/whitespace', async () => {
      const creator = await createUser('topic-idempotent');
      const room = await createRoom(creator.accessToken, { name: 'Idempotent Room' });

      const first = await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Transfers'] })
        .expect(200);
      const second = await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['  transfers  '] }) // same normalized name, different case/whitespace
        .expect(200);

      expect(first.body.topics).toHaveLength(1);
      expect(second.body.topics).toHaveLength(1);
      expect(second.body.topics[0].id).toBe(first.body.topics[0].id);

      const prisma = getTestPrismaClient();
      expect(await prisma.topic.count()).toBe(1); // one Topic row, not two
      expect(await prisma.banterRoomTopic.count({ where: { banterRoomId: room.id } })).toBe(1);
    });

    it('filters rooms by topicId (GET /banter-rooms?topicId=)', async () => {
      const creator = await createUser('topic-filter');
      const tagged = await createRoom(creator.accessToken, { name: 'Tagged Room' });
      await createRoom(creator.accessToken, { name: 'Untagged Room' });
      const attach = await request(server())
        .post(`/banter-rooms/${tagged.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Transfers'] })
        .expect(200);
      const topicId = attach.body.topics[0].id as string;

      const filtered = await request(server())
        .get(`/banter-rooms?topicId=${topicId}`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(filtered.body.items.map((r: { name: string }) => r.name)).toEqual(['Tagged Room']);
    });

    it('GET /banter-rooms/topics lists the catalog alphabetically and keyset-paginates', async () => {
      const creator = await createUser('topic-catalog');
      const room = await createRoom(creator.accessToken, { name: 'Catalog Room' });
      await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Zonal Marking', 'Anfield Chat'] })
        .expect(200);

      const page1 = await request(server())
        .get('/banter-rooms/topics?limit=1')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(page1.body.items.map((t: { name: string }) => t.name)).toEqual(['Anfield Chat']);
      expect(page1.body.nextCursor).toEqual(expect.any(String));

      const page2 = await request(server())
        .get(`/banter-rooms/topics?limit=1&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(page2.body.items.map((t: { name: string }) => t.name)).toEqual(['Zonal Marking']);
      expect(page2.body.nextCursor).toBeNull();
    });

    it('two concurrent attaches of the SAME new topic name (from different rooms) produce exactly one Topic row', async () => {
      const creator = await createUser('topic-race-creator');
      const roomA = await createRoom(creator.accessToken, { name: 'Race Room A' });
      const roomB = await createRoom(creator.accessToken, { name: 'Race Room B' });

      const fire = (roomId: string) =>
        request(server())
          .post(`/banter-rooms/${roomId}/topics`)
          .set('Authorization', `Bearer ${creator.accessToken}`)
          .send({ names: ['Deadline Day'] });

      const [r1, r2] = await Promise.all([fire(roomA.id), fire(roomB.id)]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.body.topics[0].id).toBe(r2.body.topics[0].id);

      const prisma = getTestPrismaClient();
      expect(await prisma.topic.count({ where: { nameNormalized: 'deadline day' } })).toBe(1);
    });

    it('a restricted-pending minor cannot attach topics, even to their own room (403 guardian_consent_pending)', async () => {
      const minor = await createRestrictedMinor('topic-guard');
      // A minor cannot create a room either (blocked upstream), so seed
      // one directly via Prisma with the minor as createdBy — proves the
      // guard blocks attachment regardless of "would this minor even be
      // able to own a room in practice."
      const prisma = getTestPrismaClient();
      const seededRoom = await prisma.banterRoom.create({
        data: { name: 'Seeded Room', scopeType: 'topic', createdBy: minor.userId, memberCount: 1 },
      });

      const blocked = await request(server())
        .post(`/banter-rooms/${seededRoom.id}/topics`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .send({ names: ['Transfers'] })
        .expect(403);
      expect(blocked.body.code).toBe('guardian_consent_pending');
      expect(await prisma.topic.count()).toBe(0);
    });

    it('rejects unauthenticated requests (401) and validates the body (400)', async () => {
      const creator = await createUser('topic-validate');
      const room = await createRoom(creator.accessToken, { name: 'Validate Room' });

      await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .send({ names: ['Transfers'] })
        .expect(401);
      await request(server()).get('/banter-rooms/topics').expect(401);

      await request(server())
        .post(`/banter-rooms/${room.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: [] })
        .expect(400);
      await request(server())
        .post(`/banter-rooms/does-not-exist/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Transfers'] })
        .expect(404);
    });
  });

  describe('GET /banter-rooms?tagQuery= (free-text Tag search)', () => {
    it('matches case-insensitively across topic name, creator displayName, and scoped club name, and ANDs with scopeType', async () => {
      const creator = await createUser('tag-creator');
      const prisma = getTestPrismaClient();
      await prisma.user.update({
        where: { id: creator.userId },
        data: { displayName: 'Kwame Asante' },
      });
      const club = await seedClubFor(creator.userId, 'Arsenal Ladies');

      // Matches via the creator's name.
      const byName = await createRoom(creator.accessToken, { name: 'Zeta Room', scopeType: 'topic' });
      // Matches via a topic name.
      const byTopic = await createRoom(creator.accessToken, { name: 'Yak Room', scopeType: 'topic' });
      await request(server())
        .post(`/banter-rooms/${byTopic.id}/topics`)
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ names: ['Deadline Day'] })
        .expect(200);
      // Matches via the scoped club name (club-scoped, so scopeType 'club').
      const byClub = await createRoom(creator.accessToken, {
        name: 'Omega Room',
        scopeType: 'club',
        scopeRef: club.id,
      });
      // Matches nothing.
      await createRoom(creator.accessToken, { name: 'Quiet Room', scopeType: 'topic' });

      const nameHit = await request(server())
        .get('/banter-rooms?tagQuery=KWAME')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      // The creator's displayName matches every room they created, so all
      // four rooms match on the name, not just the one tagged for it.
      const nameHitIds = nameHit.body.items.map((r: { id: string }) => r.id);
      expect(nameHitIds).toHaveLength(4);
      expect(nameHitIds).toEqual(expect.arrayContaining([byName.id, byTopic.id, byClub.id]));

      const topicHit = await request(server())
        .get('/banter-rooms?tagQuery=deadline')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(topicHit.body.items.map((r: { id: string }) => r.id)).toEqual([byTopic.id]);

      const clubHit = await request(server())
        .get('/banter-rooms?tagQuery=arsenal%20lad')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(clubHit.body.items.map((r: { id: string }) => r.id)).toEqual([byClub.id]);

      const andHit = await request(server())
        .get('/banter-rooms?tagQuery=arsenal&scopeType=topic')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(andHit.body.items).toEqual([]);

      const noTerm = await request(server())
        .get('/banter-rooms?tagQuery=%20%20')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .expect(200);
      expect(noTerm.body.items).toHaveLength(4);
    });
  });
});
