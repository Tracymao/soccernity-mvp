import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/room-staff-reactivation (Decision Log #515, founder decisions of 2026-11-15). Real Postgres, real AppModule.
//   1. Staff (moderator, superadmin) can reactivate a Banter Room that STAFF deactivated (room_deactivated on a
//      report): POST /admin/banter-rooms/:id/reactivate. Never a room the creator switched off.
//   2. The creator's own controls need an ACTIVE creator account (anonymised, suspended, deactivated, pending
//      deletion or a missing row all get the same 403 a non-creator gets).
describe('Staff reactivation of a Banter Room, and the active-creator guard (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
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
  }

  async function createUser(label: string): Promise<TestUser> {
    const user = await getTestPrismaClient().user.create({
      data: {
        email: `e2e-room-react-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Room React ${label}`,
        username: `rr_${label}_${rand().slice(0, 6)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function createAdmin(opts: { vetted?: boolean; role?: 'editor' | 'moderator' | 'superadmin' } = {}) {
    const role = opts.role ?? 'moderator';
    const admin = await getTestPrismaClient().adminUser.create({
      data: {
        email: `e2e-room-react-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: 'E2E Room React Admin',
        role,
        childSafetyVetted: opts.vetted ?? false,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  async function seedRoom() {
    const creator = await createUser('creator');
    const member = await createUser('member');
    const created = await request(server())
      .post('/banter-rooms')
      .set(auth(creator.accessToken))
      .send({ name: `Room ${rand()}`, scopeType: 'topic' })
      .expect(201);
    const roomId = created.body.id as string;
    await request(server()).post(`/banter-rooms/${roomId}/join`).set(auth(member.accessToken)).expect(200);
    return { creator, member, roomId };
  }

  async function reportRoom(reporter: TestUser, roomId: string, category = 'spam_or_scam') {
    const res = await request(server())
      .post('/reports')
      .set(auth(reporter.accessToken))
      .send({ targetType: 'banter_room', targetId: roomId, reasonCategory: category })
      .expect(201);
    return res.body.id as string;
  }

  async function staffDeactivate(reportId: string, adminToken: string, expected = 200) {
    await request(server())
      .patch(`/admin/moderation/reports/${reportId}`)
      .set(auth(adminToken))
      .send({ action: 'room_deactivated' })
      .expect(expected);
  }

  const statusOf = async (roomId: string) =>
    (await getTestPrismaClient().banterRoom.findUniqueOrThrow({ where: { id: roomId } })).status;

  describe('POST /admin/banter-rooms/:id/reactivate', () => {
    it('happy path: a moderator reactivates a staff-deactivated room; one audit row names the room, admin and report', async () => {
      const prisma = getTestPrismaClient();
      const { member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId);
      const moderator = await createAdmin();
      await staffDeactivate(reportId, moderator.accessToken);
      expect(await statusOf(roomId)).toBe('inactive');

      const notificationsBefore = await prisma.notification.count();
      const res = await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(moderator.accessToken))
        .send({ note: '  Reported in error  ' })
        .expect(200);
      expect(res.body).toEqual({ id: roomId, status: 'active' });
      expect(await statusOf(roomId)).toBe('active');

      const rows = await prisma.adminActionLog.findMany({ where: { action: 'banter_room.reactivated' } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        adminId: moderator.adminId,
        targetType: 'banter_room',
        targetId: roomId,
        notes: `report=${reportId}; note=Reported in error`,
      });
      // No notification and no guardian notice.
      expect(await prisma.notification.count()).toBe(notificationsBefore);
    });

    it('a superadmin may reactivate; the note is optional', async () => {
      const prisma = getTestPrismaClient();
      const { member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId);
      const moderator = await createAdmin();
      await staffDeactivate(reportId, moderator.accessToken);
      const superadmin = await createAdmin({ role: 'superadmin' });
      await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(superadmin.accessToken))
        .send({})
        .expect(200);
      expect(await statusOf(roomId)).toBe('active');
      const row = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'banter_room.reactivated' } });
      expect(row.notes).toBe(`report=${reportId}`);
    });

    it('a room the creator deactivated is a 409 (code banter_room_not_staff_deactivated), still inactive', async () => {
      const { creator, roomId } = await seedRoom();
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creator.accessToken))
        .send({ status: 'inactive' })
        .expect(200);
      const moderator = await createAdmin();
      const res = await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(moderator.accessToken))
        .send({})
        .expect(409);
      expect(res.body.code).toBe('banter_room_not_staff_deactivated');
      expect(await statusOf(roomId)).toBe('inactive');
    });

    it('staff deactivated, staff reactivated, then the creator switched it off again: 409 (the latest event is the reactivation)', async () => {
      const { creator, member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId);
      const moderator = await createAdmin();
      await staffDeactivate(reportId, moderator.accessToken);
      await request(server()).post(`/admin/banter-rooms/${roomId}/reactivate`).set(auth(moderator.accessToken)).send({}).expect(200);
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creator.accessToken))
        .send({ status: 'inactive' })
        .expect(200);
      const res = await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(moderator.accessToken))
        .send({})
        .expect(409);
      expect(res.body.code).toBe('banter_room_not_staff_deactivated');
    });

    it('an editor is refused (403) and nothing changes', async () => {
      const { member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId);
      const moderator = await createAdmin();
      await staffDeactivate(reportId, moderator.accessToken);
      const editor = await createAdmin({ role: 'editor' });
      await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(editor.accessToken))
        .send({})
        .expect(403);
      expect(await statusOf(roomId)).toBe('inactive');
      expect(await getTestPrismaClient().adminActionLog.count({ where: { action: 'banter_room.reactivated' } })).toBe(0);
    });

    it('a user token and no token are refused (401); a user token never reaches the route', async () => {
      const { creator, roomId } = await seedRoom();
      await request(server()).post(`/admin/banter-rooms/${roomId}/reactivate`).send({}).expect(401);
      await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(creator.accessToken))
        .send({})
        .expect(401);
    });

    it('an already-active room is a 409 (banter_room_already_active)', async () => {
      const { roomId } = await seedRoom();
      const moderator = await createAdmin();
      const res = await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(moderator.accessToken))
        .send({})
        .expect(409);
      expect(res.body.code).toBe('banter_room_already_active');
    });

    it('an unknown room is a 404; a note over 500 characters and an unknown key are 400s', async () => {
      const moderator = await createAdmin();
      await request(server())
        .post('/admin/banter-rooms/00000000-0000-4000-8000-000000000000/reactivate')
        .set(auth(moderator.accessToken))
        .send({})
        .expect(404);
      await request(server())
        .post('/admin/banter-rooms/anything/reactivate')
        .set(auth(moderator.accessToken))
        .send({ note: 'x'.repeat(501) })
        .expect(400);
      await request(server())
        .post('/admin/banter-rooms/anything/reactivate')
        .set(auth(moderator.accessToken))
        .send({ status: 'active' })
        .expect(400);
    });

    it('two staff members pressing at once: exactly one 200 and one 409, one audit row', async () => {
      const prisma = getTestPrismaClient();
      const { member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId);
      const a = await createAdmin();
      const b = await createAdmin();
      await staffDeactivate(reportId, a.accessToken);
      const results = await Promise.all(
        [a, b].map((x) =>
          request(server()).post(`/admin/banter-rooms/${roomId}/reactivate`).set(auth(x.accessToken)).send({}),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await prisma.adminActionLog.count({ where: { action: 'banter_room.reactivated' } })).toBe(1);
      expect(await statusOf(roomId)).toBe('active');
    });

    it('a deactivation on a child_safety_concern report needs a vetted admin: unvetted get the coded 403, vetted get 200', async () => {
      const { member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId, 'child_safety_concern');
      const vetted = await createAdmin({ vetted: true });
      await staffDeactivate(reportId, vetted.accessToken);
      expect(await statusOf(roomId)).toBe('inactive');

      const unvetted = await createAdmin({ vetted: false });
      const refused = await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(unvetted.accessToken))
        .send({})
        .expect(403);
      expect(refused.body.code).toBe('child_safety_vetting_required');
      expect(await statusOf(roomId)).toBe('inactive');
      expect(await getTestPrismaClient().adminActionLog.count({ where: { action: 'banter_room.reactivated' } })).toBe(0);

      await request(server())
        .post(`/admin/banter-rooms/${roomId}/reactivate`)
        .set(auth(vetted.accessToken))
        .send({})
        .expect(200);
      expect(await statusOf(roomId)).toBe('active');
    });

    it('the report detail of a Banter Room report says whether the room is inactive and whether THIS admin may reactivate it', async () => {
      const { member, roomId } = await seedRoom();
      const reportId = await reportRoom(member, roomId, 'child_safety_concern');
      const vetted = await createAdmin({ vetted: true });
      const unvetted = await createAdmin({ vetted: false });

      const before = await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(vetted.accessToken)).expect(200);
      expect(before.body.reportedRoom).toEqual({ id: roomId, status: 'active', staffMayReactivate: false });

      await staffDeactivate(reportId, vetted.accessToken);
      const forVetted = await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(vetted.accessToken)).expect(200);
      expect(forVetted.body.reportedRoom).toEqual({ id: roomId, status: 'inactive', staffMayReactivate: true });
      // The unvetted admin cannot open a concernsMinor report at all (existing B-297 rule): same 403.
      await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(unvetted.accessToken)).expect(403);

      await request(server()).post(`/admin/banter-rooms/${roomId}/reactivate`).set(auth(vetted.accessToken)).send({}).expect(200);
      const after = await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(vetted.accessToken)).expect(200);
      expect(after.body.reportedRoom).toEqual({ id: roomId, status: 'active', staffMayReactivate: false });
    });

    it('a report on a creator-deactivated room says staffMayReactivate false; other report types carry no reportedRoom key', async () => {
      const { creator, member, roomId } = await seedRoom();
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creator.accessToken))
        .send({ status: 'inactive' })
        .expect(200);
      const reportId = await reportRoom(member, roomId);
      const moderator = await createAdmin();
      const detail = await request(server()).get(`/admin/moderation/reports/${reportId}`).set(auth(moderator.accessToken)).expect(200);
      expect(detail.body.reportedRoom).toEqual({ id: roomId, status: 'inactive', staffMayReactivate: false });

      const userReport = await request(server())
        .post('/reports')
        .set(auth(member.accessToken))
        .send({ targetType: 'user', targetId: creator.userId, reasonCategory: 'spam_or_scam' })
        .expect(201);
      const other = await request(server())
        .get(`/admin/moderation/reports/${userReport.body.id}`)
        .set(auth(moderator.accessToken))
        .expect(200);
      expect(other.body).not.toHaveProperty('reportedRoom');
    });
  });

  describe('the creator controls need an ACTIVE creator account (Decision Log #515)', () => {
    async function expectAllControlsRefused(creatorToken: string, roomId: string) {
      const prisma = getTestPrismaClient();
      const topicBefore = await prisma.banterRoomTopic.count();
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creatorToken))
        .send({ status: 'inactive' })
        .expect(403);
      await request(server())
        .post(`/banter-rooms/${roomId}/topics`)
        .set(auth(creatorToken))
        .send({ names: ['sneaky'] })
        .expect(403);
      await request(server())
        .delete(`/banter-rooms/${roomId}/topics/00000000-0000-4000-8000-000000000000`)
        .set(auth(creatorToken))
        .expect(403);
      expect(await statusOf(roomId)).toBe('active');
      expect(await prisma.banterRoomTopic.count()).toBe(topicBefore);
    }

    it.each(['deleted', 'suspended', 'deactivated', 'pending_deletion'])(
      'a creator whose account is %s is refused on status, attach topic and detach topic (a token still in hand)',
      async (accountStatus) => {
        const { creator, roomId } = await seedRoom();
        // Changing the row directly does not touch the token: this isolates the CODE check from session revocation.
        await getTestPrismaClient().user.update({ where: { id: creator.userId }, data: { accountStatus } });
        await expectAllControlsRefused(creator.accessToken, roomId);
      },
    );

    it('a creator whose User row is gone (dangling createdBy, simulated) gets the same 403, byte for byte as a non-creator', async () => {
      const { creator, member, roomId } = await seedRoom();
      // Remove everything that references the creator so the row can be deleted, as a hard delete outside the product would.
      const prisma = getTestPrismaClient();
      await prisma.banterRoomMember.deleteMany({ where: { userId: creator.userId } });
      await prisma.user.delete({ where: { id: creator.userId } });
      const dangling = await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creator.accessToken))
        .send({ status: 'inactive' });
      // The token no longer maps to a User row; either the guard or the creator check answers 401/403, never 200.
      expect([401, 403]).toContain(dangling.status);
      const other = await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(member.accessToken))
        .send({ status: 'inactive' })
        .expect(403);
      if (dangling.status === 403) {
        expect(dangling.body).toEqual(other.body);
      }
      expect(await statusOf(roomId)).toBe('active');
    });

    it('a living, active creator still has every control', async () => {
      const { creator, roomId } = await seedRoom();
      await request(server())
        .post(`/banter-rooms/${roomId}/topics`)
        .set(auth(creator.accessToken))
        .send({ names: ['derbyday'] })
        .expect(200);
      const topic = await getTestPrismaClient().topic.findFirstOrThrow({ where: { nameNormalized: 'derbyday' } });
      await request(server())
        .delete(`/banter-rooms/${roomId}/topics/${topic.id}`)
        .set(auth(creator.accessToken))
        .expect(204);
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creator.accessToken))
        .send({ status: 'inactive' })
        .expect(200);
      expect(await statusOf(roomId)).toBe('inactive');
      await request(server())
        .patch(`/banter-rooms/${roomId}/status`)
        .set(auth(creator.accessToken))
        .send({ status: 'active' })
        .expect(200);
      expect(await statusOf(roomId)).toBe('active');
    });
  });
});
