import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { AuthService } from '../src/modules/auth/auth.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { resolveReportedUserId } from '../src/modules/moderation/report-target.util';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/room-with-purged-creator-test. Founder decision (2026-11-14): a Bants room CONTINUES after its creator
// is anonymised or purged. Staff moderate it; the creator's own controls simply lapse; there is no ownership
// transfer. Until now this was only claimed in comments (BanterRoom.createdBy is a bare string with no foreign key,
// resolveReportedUserId returns null for a dangling creator, room_deactivated is the moderator's room action, and
// anonymized-row-purge.references.ts classifies the room as surviving its creator). This file tests the whole path
// against real Postgres, with the REAL deletion machinery (AuthService.startPendingDeletion, the 30-day sweep, the
// purge job) wherever the product can reach the state, and a clearly labelled simulation where it cannot.
//
// FINDING about "purged": the purge job REFUSES to purge a creator whose room still exists ('BanterRoom.createdBy' is
// a 'content' blocker in anonymized-row-purge.references.ts), and nothing deletes a room, so the real product can
// only reach the ANONYMISED state. A dangling createdBy is therefore simulated here by deleting the User row of a
// creator who has nothing else referencing them (describe 'dangling creator').
describe('A Bants room continues after its creator is anonymised or gone (e2e)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  let app: INestApplication;
  let sweep: AccountDeletionSweepService;
  let purge: AnonymizedRowPurgeService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    sweep = app.get(AccountDeletionSweepService);
    purge = app.get(AnonymizedRowPurgeService);
  });

  beforeEach(async () => {
    await resetDatabase();
  }, 300_000);

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  interface TestUser {
    userId: string;
    accessToken: string;
    email: string;
    displayName: string;
    username: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const prisma = getTestPrismaClient();
    const email = `e2e-room-purge-${label}-${Date.now()}-${rand()}@example.com`;
    const displayName = `Secret Real Name ${label}`;
    const username = `rp_${label}_${rand().slice(0, 6)}`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName,
        username,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token, email, displayName, username };
  }

  async function createAdmin(childSafetyVetted: boolean) {
    const admin = await getTestPrismaClient().adminUser.create({
      data: {
        email: `e2e-room-purge-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: 'E2E Room Purge Admin',
        role: 'moderator',
        childSafetyVetted,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  const ROOM_NAME = 'Keep Talking After The Creator';
  const ROOM_DESCRIPTION = 'A room description that must survive its creator.';
  const TOPIC = 'derbyday';

  /** A room with a creator, two other members, one topic, a description and a post from everyone. */
  async function seedRoomWithMembers() {
    const creator = await createUser('creator');
    const m1 = await createUser('m1');
    const m2 = await createUser('m2');
    const created = await request(server())
      .post('/banter-rooms')
      .set(auth(creator.accessToken))
      .send({ name: ROOM_NAME, description: ROOM_DESCRIPTION, scopeType: 'topic' })
      .expect(201);
    const roomId = created.body.id as string;
    await request(server())
      .post(`/banter-rooms/${roomId}/topics`)
      .set(auth(creator.accessToken))
      .send({ names: [TOPIC] })
      .expect(200);
    for (const m of [m1, m2]) {
      await request(server()).post(`/banter-rooms/${roomId}/join`).set(auth(m.accessToken)).expect(200);
    }
    const posts: Record<string, string> = {};
    for (const [label, u] of [
      ['creator', creator],
      ['m1', m1],
      ['m2', m2],
    ] as const) {
      const res = await request(server())
        .post(`/banter-rooms/${roomId}/posts`)
        .set(auth(u.accessToken))
        .send({ contentText: `post by ${label}` })
        .expect(201);
      posts[label] = res.body.id as string;
    }
    return { creator, m1, m2, roomId, posts };
  }

  /** The REAL deletion path: the self-service request (ends sessions), the 31-day wait, the sweep. */
  async function anonymiseThroughRealSweep(userId: string) {
    const prisma = getTestPrismaClient();
    // The B-305 session-revocation marker is whole seconds and accepts a token issued in the same second as the
    // revocation (a known, accepted edge). Seeding is fast on CI, so wait past the second boundary first; otherwise
    // the creator's pre-deletion token can still be valid and the lapse assertions become timing-dependent.
    await new Promise((r) => setTimeout(r, 1100));
    await app.get(AuthService).startPendingDeletion(userId);
    await prisma.user.update({ where: { id: userId }, data: { pendingDeletionAt: new Date(Date.now() - 31 * DAY) } });
    const result = await sweep.sweepPendingDeletions(new Date());
    expect(result.anonymizedUserIds).toContain(userId);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.accountStatus).toBe('deleted');
    return row;
  }

  /** Every personal string the creator ever had; none may appear in any response afterwards. */
  function expectNoPersonalData(body: unknown, c: TestUser) {
    const text = JSON.stringify(body);
    expect(text).not.toContain(c.email);
    expect(text).not.toContain(c.displayName);
    expect(text).not.toContain(c.username);
  }

  describe('anonymised creator (real sweep)', () => {
    it('the room stays in the list, search, by id, My Bants and the feed; members read and post; nothing personal leaks', async () => {
      const { creator, m1, m2, roomId, posts } = await seedRoomWithMembers();
      expect((await getTestPrismaClient().banterRoom.findUniqueOrThrow({ where: { id: roomId } })).memberCount).toBe(3);

      await anonymiseThroughRealSweep(creator.userId);

      const list = await request(server()).get('/banter-rooms').set(auth(m1.accessToken)).expect(200);
      expect(list.body.items.map((r: { id: string }) => r.id)).toContain(roomId);
      expectNoPersonalData(list.body, creator);

      const search = await request(server())
        .get('/banter-rooms/search')
        .query({ q: 'Keep Talking' })
        .set(auth(m1.accessToken))
        .expect(200);
      expect(search.body.items.map((r: { id: string }) => r.id)).toContain(roomId);

      // The tag search joins "User" on createdBy: the anonymised row must not break it or match the old username.
      const byTopic = await request(server())
        .get('/banter-rooms')
        .query({ tagQuery: TOPIC })
        .set(auth(m1.accessToken))
        .expect(200);
      expect(byTopic.body.items.map((r: { id: string }) => r.id)).toContain(roomId);
      const byOldUsername = await request(server())
        .get('/banter-rooms')
        .query({ tagQuery: creator.username })
        .set(auth(m1.accessToken))
        .expect(200);
      expect(byOldUsername.body.items).toEqual([]);

      const one = await request(server()).get(`/banter-rooms/${roomId}`).set(auth(m1.accessToken)).expect(200);
      expect(one.body).toMatchObject({ id: roomId, joined: true, status: 'active' });
      expectNoPersonalData(one.body, creator);
      // The creator's membership row went with the anonymisation; the count follows (3 -> 2).
      expect(one.body.memberCount).toBe(2);

      const mine = await request(server()).get('/banter-rooms/mine').set(auth(m2.accessToken)).expect(200);
      expect(mine.body.items.map((r: { id: string }) => r.id)).toContain(roomId);

      const feed = await request(server()).get(`/banter-rooms/${roomId}/posts`).set(auth(m1.accessToken)).expect(200);
      const ids = feed.body.items.map((p: { id: string }) => p.id);
      expect(ids).toEqual(expect.arrayContaining([posts.creator, posts.m1, posts.m2]));
      expectNoPersonalData(feed.body, creator);
      const creatorsPost = feed.body.items.find((p: { id: string }) => p.id === posts.creator);
      expect(creatorsPost.author.publicName).toBe('[deleted user]');

      // Other members continue: a new post, a comment on the departed creator's post, a leave and a re-join.
      await request(server())
        .post(`/banter-rooms/${roomId}/posts`)
        .set(auth(m1.accessToken))
        .send({ contentText: 'still here' })
        .expect(201);
      await request(server())
        .post(`/posts/${posts.creator}/comments`)
        .set(auth(m2.accessToken))
        .send({ contentText: 'replying to a departed creator' })
        .expect(201);
      await request(server()).delete(`/banter-rooms/${roomId}/join`).set(auth(m2.accessToken)).expect(200);
      await request(server()).post(`/banter-rooms/${roomId}/join`).set(auth(m2.accessToken)).expect(200);
    });

    it("the creator's own controls lapse: the pre-deletion session is dead and no other member can use them", async () => {
      const { creator, m1, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);

      // The creator's old token: sessions were ended when the deletion started (B-305).
      for (const call of [
        () => request(server()).patch(`/banter-rooms/${roomId}/status`).set(auth(creator.accessToken)).send({ status: 'inactive' }),
        () => request(server()).post(`/banter-rooms/${roomId}/topics`).set(auth(creator.accessToken)).send({ names: ['x1'] }),
      ]) {
        await call().expect(401);
      }

      // Everyone else, including a member, is refused with the ordinary creator-only message and nothing changes.
      const status = await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(m1.accessToken))
        .send({ status: 'inactive' })
        .expect(403);
      const attach = await request(server())
        .post(`/banter-rooms/${roomId}/topics`)
        .set(auth(m1.accessToken))
        .send({ names: ['sneaky'] })
        .expect(403);
      const topic = await getTestPrismaClient().topic.findFirstOrThrow({ where: { nameNormalized: TOPIC } });
      const detach = await request(server())
        .delete(`/banter-rooms/${roomId}/topics/${topic.id}`)
        .set(auth(m1.accessToken))
        .expect(403);
      for (const res of [status, attach, detach]) {
        expect(JSON.stringify(res.body)).not.toMatch(/Secret Real Name|@example\.com/);
      }
      const room = await getTestPrismaClient().banterRoom.findUniqueOrThrow({
        where: { id: roomId },
        include: { topics: true },
      });
      expect(room.status).toBe('active');
      expect(room.topics).toHaveLength(1);
    });

    it('FORMER FINDING PROBE, NOW A GUARD (Decision Log #515): a token issued AFTER anonymisation is refused by the code, not only by the dead session', async () => {
      const { creator, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      // A real person cannot get this token (login refuses a 'deleted' account); it is minted here directly to prove
      // that the CODE (BanterService.assertRoomCreator needs an ACTIVE creator account), not only the dead session,
      // refuses the anonymised creator. Before backend/room-staff-reactivation this probe returned 200 or 403 and
      // only logged it (PR #788 finding 2).
      await new Promise((r) => setTimeout(r, 1100)); // B-305 marker is whole seconds
      const { accessToken } = await app.get(TokenService).issueTokenPair(creator.userId, 'user');
      const res = await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(accessToken.token))
        .send({ status: 'inactive' });
      expect(res.status).toBe(403);
      expect((await getTestPrismaClient().banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('active');
    });

    it('the purge job keeps the anonymised creator row for as long as the room exists, so the creator is never purged', async () => {
      // (a) a creator who posted: kept (the first blocker found is their own post).
      const { creator, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      const result = await purge.purgeAnonymizedRows(new Date(Date.now() + 31 * DAY));
      expect(result.purgedUserIds).not.toContain(creator.userId);
      expect(result.keptUserIds).toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: creator.userId, kind: 'content' })]),
      );
      expect(await getTestPrismaClient().user.findUnique({ where: { id: creator.userId } })).not.toBeNull();
      expect(await getTestPrismaClient().banterRoom.findUnique({ where: { id: roomId } })).not.toBeNull();

      // (b) a creator who never posted: the ROOM alone is what keeps the row (blocker BanterRoom.createdBy).
      const quiet = await createUser('quiet');
      const quietRoom = await getTestPrismaClient().banterRoom.create({
        data: { name: `quiet-room-${rand()}`, scopeType: 'topic', createdBy: quiet.userId, memberCount: 0 },
      });
      await anonymiseThroughRealSweep(quiet.userId);
      const result2 = await purge.purgeAnonymizedRows(new Date(Date.now() + 31 * DAY));
      expect(result2.purgedUserIds).not.toContain(quiet.userId);
      expect(result2.keptUserIds).toEqual(
        expect.arrayContaining([expect.objectContaining({ userId: quiet.userId, blocker: 'BanterRoom.createdBy' })]),
      );
      expect(await getTestPrismaClient().banterRoom.findUnique({ where: { id: quietRoom.id } })).not.toBeNull();
    });

    it('the room name, description and topic are unchanged by the anonymisation and by the purge run', async () => {
      const { creator, m1, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      await purge.purgeAnonymizedRows(new Date(Date.now() + 31 * DAY));
      const one = await request(server()).get(`/banter-rooms/${roomId}`).set(auth(m1.accessToken)).expect(200);
      expect(one.body.name).toBe(ROOM_NAME);
      expect(one.body.description).toBe(ROOM_DESCRIPTION);
      expect(one.body.topics.map((t: { name: string }) => t.name)).toEqual([TOPIC]);
      // createdBy stays as an opaque id of the anonymised account (a finding, see the report).
      expect(one.body.createdBy).toBe(creator.userId);
    });
  });

  describe('moderation of a room whose creator is anonymised (real sweep)', () => {
    async function reportRoom(reporter: TestUser, roomId: string, category = 'spam_or_scam') {
      const res = await request(server())
        .post('/reports')
        .set(auth(reporter.accessToken))
        .send({ targetType: 'banter_room', targetId: roomId, reasonCategory: category })
        .expect(201);
      return res.body.id as string;
    }

    it('a member can report the room; a moderator reviews it and room_deactivated makes the room inactive, audited', async () => {
      const prisma = getTestPrismaClient();
      const { creator, m1, m2, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      const reportId = await reportRoom(m1, roomId);

      const moderator = await createAdmin(false);
      const detail = await request(server())
        .get(`/admin/moderation/reports/${reportId}`)
        .set(auth(moderator.accessToken))
        .expect(200);
      expect(detail.body).toMatchObject({ id: reportId, targetType: 'banter_room', targetId: roomId, status: 'open' });

      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(moderator.accessToken))
        .send({ action: 'room_deactivated' })
        .expect(200);

      const report = await prisma.report.findUniqueOrThrow({ where: { id: reportId } });
      expect(report).toMatchObject({ status: 'actioned', actionTaken: 'room_deactivated', reviewedByAdminId: moderator.adminId });
      const log = await prisma.adminActionLog.findFirst({
        where: { targetId: reportId, adminId: moderator.adminId },
        orderBy: { createdAt: 'desc' },
      });
      expect(log).not.toBeNull();
      expect(log!.notes).toContain('room_deactivated');

      // The room now behaves as an inactive room does for members: still listed and readable, status 'inactive'.
      const one = await request(server()).get(`/banter-rooms/${roomId}`).set(auth(m2.accessToken)).expect(200);
      expect(one.body.status).toBe('inactive');
      const list = await request(server()).get('/banter-rooms').set(auth(m2.accessToken)).expect(200);
      expect(list.body.items.find((r: { id: string }) => r.id === roomId).status).toBe('inactive');
      // Nothing else reads the status today (Decision Log #357): members can still read and post. Pinned as built.
      await request(server()).get(`/banter-rooms/${roomId}/posts`).set(auth(m2.accessToken)).expect(200);
      await request(server())
        .post(`/banter-rooms/${roomId}/posts`)
        .set(auth(m2.accessToken))
        .send({ contentText: 'posting in an inactive room' })
        .expect(201);

      expectNoPersonalData(one.body, creator);
    });

    it('an inactive room whose creator is gone: no member, no creator route and no appeal can reactivate it; STAFF can, through the staff route (Decision Log #515)', async () => {
      const prisma = getTestPrismaClient();
      const { creator, m1, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      const reportId = await reportRoom(m1, roomId);
      const moderator = await createAdmin(false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(moderator.accessToken))
        .send({ action: 'room_deactivated' })
        .expect(200);

      // A member cannot reactivate (creator-only).
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(m1.accessToken))
        .send({ status: 'active' })
        .expect(403);
      // The admin token is still not accepted by the user-facing (creator) route.
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(moderator.accessToken))
        .send({ status: 'active' })
        .expect(401);
      // The reporter cannot "appeal" it as the reported user, and the anonymised creator cannot sign in to.
      await request(server())
        .post(`/reports/${reportId}/appeal`)
        .set(auth(m1.accessToken))
        .send({ reason: 'I disagree with this' })
        .expect(403);
      expect((await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('inactive');

      // The staff route (POST /admin/banter-rooms/:id/reactivate) is the way back.
      await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(moderator.accessToken))
        .send({})
        .expect(200);
      expect((await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('active');
    });

    it("FINDING: the room report notifies the anonymised creator's account (a row for an account nobody can read)", async () => {
      const prisma = getTestPrismaClient();
      const { creator, m1, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      const reportId = await reportRoom(m1, roomId);
      const moderator = await createAdmin(false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(moderator.accessToken))
        .send({ action: 'room_deactivated' })
        .expect(200);
      const rows = await prisma.notification.findMany({ where: { userId: creator.userId } });
      console.log(`[room-with-purged-creator] notifications created for the anonymised creator: ${rows.length}`);
      expect(rows.every((n) => n.type === 'moderation_decision' && n.payloadRefId === reportId)).toBe(true);
      expect(await prisma.notification.count({ where: { userId: m1.userId } })).toBe(1);
    });

    it('a child_safety_concern room report needs a vetted moderator to act; an unvetted one is refused and the room stays active', async () => {
      const prisma = getTestPrismaClient();
      const { creator, m1, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      const reportId = await reportRoom(m1, roomId, 'child_safety_concern');
      const unvetted = await createAdmin(false);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(unvetted.accessToken))
        .send({ action: 'room_deactivated' })
        .expect(403);
      expect((await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('active');
      const vetted = await createAdmin(true);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(vetted.accessToken))
        .send({ action: 'room_deactivated' })
        .expect(200);
      expect((await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('inactive');
    });

    it('reporting the room does not need, and does not remove, its name or description', async () => {
      const { creator, m1, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      await reportRoom(m1, roomId);
      const room = await getTestPrismaClient().banterRoom.findUniqueOrThrow({ where: { id: roomId } });
      expect(room.name).toBe(ROOM_NAME);
      expect(room.description).toBe(ROOM_DESCRIPTION);
    });

    it('the anonymised creator still resolves as the reported user (the row exists), the dangling one does not', async () => {
      const { creator, roomId } = await seedRoomWithMembers();
      await anonymiseThroughRealSweep(creator.userId);
      const prisma = getTestPrismaClient();
      expect(await resolveReportedUserId(prisma, 'banter_room', roomId)).toBe(creator.userId);
    });
  });

  describe('dangling creator (SIMULATED: the creator User row is deleted outright)', () => {
    // The real product cannot reach this state (the purge refuses a creator whose room exists). A creator with no
    // other record (no post, so no RESTRICT key) has their row deleted directly, as a hard delete outside the
    // product would. The creator's BanterRoomMember row cascades away without the count following; that is an
    // artefact of the simulation and is not asserted on.
    async function seedDangling() {
      const creator = await createUser('dangling');
      const m1 = await createUser('dm1');
      const m2 = await createUser('dm2');
      const created = await request(server())
        .post('/banter-rooms')
        .set(auth(creator.accessToken))
        .send({ name: ROOM_NAME, description: ROOM_DESCRIPTION, scopeType: 'topic' })
        .expect(201);
      const roomId = created.body.id as string;
      await request(server())
        .post(`/banter-rooms/${roomId}/topics`)
        .set(auth(creator.accessToken))
        .send({ names: [TOPIC] })
        .expect(200);
      for (const m of [m1, m2]) {
        await request(server()).post(`/banter-rooms/${roomId}/join`).set(auth(m.accessToken)).expect(200);
      }
      await getTestPrismaClient().user.delete({ where: { id: creator.userId } });
      return { creator, m1, m2, roomId };
    }

    it('the room is still in the list, search, by id and My Bants; no 500, no join error; members keep reading and posting', async () => {
      const { creator, m1, m2, roomId } = await seedDangling();
      const list = await request(server()).get('/banter-rooms').set(auth(m1.accessToken)).expect(200);
      expect(list.body.items.map((r: { id: string }) => r.id)).toContain(roomId);
      const search = await request(server())
        .get('/banter-rooms/search')
        .query({ q: 'Keep Talking' })
        .set(auth(m1.accessToken))
        .expect(200);
      expect(search.body.items.map((r: { id: string }) => r.id)).toContain(roomId);
      // The raw tag search LEFT JOINs "User" on createdBy: a dangling creator must give no row, not an error.
      const byTopic = await request(server())
        .get('/banter-rooms')
        .query({ tagQuery: TOPIC })
        .set(auth(m1.accessToken))
        .expect(200);
      expect(byTopic.body.items.map((r: { id: string }) => r.id)).toContain(roomId);
      const one = await request(server()).get(`/banter-rooms/${roomId}`).set(auth(m1.accessToken)).expect(200);
      expect(one.body).toMatchObject({ id: roomId, name: ROOM_NAME, description: ROOM_DESCRIPTION });
      expectNoPersonalData(one.body, creator);
      const mine = await request(server()).get('/banter-rooms/mine').set(auth(m2.accessToken)).expect(200);
      expect(mine.body.items.map((r: { id: string }) => r.id)).toContain(roomId);
      await request(server())
        .post(`/banter-rooms/${roomId}/posts`)
        .set(auth(m1.accessToken))
        .send({ contentText: 'carrying on' })
        .expect(201);
      const feed = await request(server()).get(`/banter-rooms/${roomId}/posts`).set(auth(m2.accessToken)).expect(200);
      expect(feed.body.items).toHaveLength(1);
    });

    it('the creator controls are refused for every member; the reported user resolves to null; a report is accepted and actionable', async () => {
      const prisma = getTestPrismaClient();
      const { m1, m2, roomId } = await seedDangling();
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(m1.accessToken))
        .send({ status: 'inactive' })
        .expect(403);
      await request(server())
        .post(`/banter-rooms/${roomId}/topics`)
        .set(auth(m1.accessToken))
        .send({ names: ['sneaky'] })
        .expect(403);

      expect(await resolveReportedUserId(prisma, 'banter_room', roomId)).toBeNull();

      const reportRes = await request(server())
        .post('/reports')
        .set(auth(m2.accessToken))
        .send({ targetType: 'banter_room', targetId: roomId, reasonCategory: 'harassment_or_bullying' })
        .expect(201);
      const reportId = reportRes.body.id as string;
      const moderator = await createAdmin(false);
      await request(server())
        .get(`/admin/moderation/reports/${reportId}`)
        .set(auth(moderator.accessToken))
        .expect(200);
      await request(server())
        .patch(`/admin/moderation/reports/${reportId}`)
        .set(auth(moderator.accessToken))
        .send({ action: 'room_deactivated' })
        .expect(200);
      expect((await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('inactive');
      // Only the reporter is notified: there is no reported user to notify.
      expect(await prisma.notification.count({ where: { type: 'moderation_decision' } })).toBe(1);
      expect(await prisma.notification.count({ where: { userId: m2.userId, type: 'moderation_decision' } })).toBe(1);

      // Nobody can appeal it (no reported user), and no member can reactivate it (staff can: see
      // room-staff-reactivation.e2e-spec.ts).
      await request(server())
        .post(`/reports/${reportId}/appeal`)
        .set(auth(m2.accessToken))
        .send({ reason: 'please' })
        .expect(403);
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(m1.accessToken))
        .send({ status: 'active' })
        .expect(403);
      expect((await prisma.banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status).toBe('inactive');
    });
  });
});
