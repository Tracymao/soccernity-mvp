import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-3/community-groups-backend — Build Plan Sprint 3, Decision Log
// #281. Hits test/README.md's e2e triggers:
//   - a genuinely NEW Prisma relation/constraint: CommunityGroupMember,
//     its @@unique([userId, communityGroupId]), CommunityGroup's own
//     nameNormalized @@unique constraint, and the onDelete: Cascade FKs —
//     never exercised against a real Postgres before this PR.
//   - transaction reasoning: CommunityGroup.memberCount incremented/
//     decremented transactionally alongside the member row, proven never
//     to drift or go negative across a real operation sequence, and a
//     genuine concurrent double-join.
// The mocked unit suite (src/modules/community-groups/*.spec.ts) covers
// DTO validation (including the IsAtLeastOneDimensionPresent cross-field
// rule), guard wiring, the branching logic, and the P2002/P2025
// idempotency paths a mock can prove.
//
// Users are seeded directly via Prisma + a real TokenService-minted
// access token (createUser), not POST /auth/register — the same pattern
// banter.e2e-spec.ts / clubs.e2e-spec.ts / grassroots.e2e-spec.ts use.
// None of the Community Groups endpoints carry @AuthRateLimit(), so this
// is a speed choice, not a rate-limit workaround: every downstream
// request still exercises the real JwtAuthGuard -> TokenService.verifyAccessToken
// and (for writes) the real GuardianConsentGuard chain.
describe('Community Groups e2e (Build Plan Sprint 3, Decision Log #281)', () => {
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
        email: `e2e-cg-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E CG ${label}`,
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
  async function createRestrictedMinor(
    label: string,
  ): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-cg-minor-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused',
        displayName: `E2E CG Minor ${label}`,
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

  async function createGroup(
    token: string,
    over: Partial<{ name: string; city: string; positionPlayed: string; careerTrack: string }> = {},
  ): Promise<{ id: string; memberCount: number }> {
    // Only fall back to `city: 'Lagos'` when the caller supplied NO
    // dimension at all (the DTO requires at least one — most callers of
    // this helper don't care which). If the caller explicitly supplied
    // ANY dimension (city, positionPlayed, or careerTrack), send exactly
    // what they asked for — do NOT silently inject `city: 'Lagos'` on top
    // (a real bug this file's own filter test caught: a group meant to
    // have no city at all was getting one anyway, corrupting the
    // city-filter assertions).
    const noDimensionGiven =
      over.city === undefined && over.positionPlayed === undefined && over.careerTrack === undefined;
    const res = await request(server())
      .post('/community-groups')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: over.name ?? 'Lagos Strikers',
        city: over.city ?? (noDimensionGiven ? 'Lagos' : undefined),
        positionPlayed: over.positionPlayed,
        careerTrack: over.careerTrack,
      })
      .expect(201);
    return { id: res.body.id as string, memberCount: res.body.memberCount as number };
  }

  async function realMemberRowCount(groupId: string): Promise<number> {
    const prisma = getTestPrismaClient();
    return prisma.communityGroupMember.count({ where: { communityGroupId: groupId } });
  }
  async function cachedMemberCount(groupId: string): Promise<number> {
    const prisma = getTestPrismaClient();
    const row = await prisma.communityGroup.findUniqueOrThrow({ where: { id: groupId } });
    return row.memberCount;
  }

  // ---------- Create + auto-join ----------

  describe('POST /community-groups', () => {
    it('creates a group owned by the caller, auto-joins them (memberCount 1, one real CommunityGroupMember row)', async () => {
      const creator = await createUser('creator');

      const create = await request(server())
        .post('/community-groups')
        .set('Authorization', `Bearer ${creator.accessToken}`)
        .send({ name: 'Lagos Strikers', city: 'Lagos' })
        .expect(201);

      expect(create.body).toEqual({
        id: expect.any(String),
        name: 'Lagos Strikers',
        city: 'Lagos',
        positionPlayed: null,
        careerTrack: null,
        createdById: creator.userId,
        memberCount: 1,
        createdAt: expect.any(String),
        joined: true,
      });

      expect(await realMemberRowCount(create.body.id)).toBe(1);
      expect(await cachedMemberCount(create.body.id)).toBe(1);
    });

    it('rejects a group with none of city/positionPlayed/careerTrack set (400) and requires auth (401)', async () => {
      const { accessToken } = await createUser('validate');
      await request(server())
        .post('/community-groups')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No Dimensions' })
        .expect(400);
      await request(server()).post('/community-groups').send({ name: 'X Y', city: 'Lagos' }).expect(401);
    });

    it('rejects a duplicate name (case-insensitive, whitespace-insensitive) with a real 409, and creates nothing', async () => {
      const owner = await createUser('dup-owner');
      const other = await createUser('dup-other');
      await createGroup(owner.accessToken, { name: 'Lagos Strikers' });

      const dup = await request(server())
        .post('/community-groups')
        .set('Authorization', `Bearer ${other.accessToken}`)
        .send({ name: '  LAGOS STRIKERS  ', city: 'Lagos' })
        .expect(409);
      expect(dup.body.message).toEqual(expect.stringContaining('already exists'));

      const prisma = getTestPrismaClient();
      expect(await prisma.communityGroup.count()).toBe(1);
    });

    it('two concurrent creates of the same normalized name produce exactly one CommunityGroup row', async () => {
      const owner = await createUser('conc-create-owner');

      const fire = () =>
        request(server())
          .post('/community-groups')
          .set('Authorization', `Bearer ${owner.accessToken}`)
          .send({ name: 'Concurrent Group', city: 'Lagos' });

      const [r1, r2] = await Promise.all([fire(), fire()]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([201, 409]);

      const prisma = getTestPrismaClient();
      expect(await prisma.communityGroup.count()).toBe(1);
    });
  });

  // ---------- Join / leave: memberCount discipline (transaction reasoning) ----------

  describe('POST/DELETE /community-groups/:id/join', () => {
    it('a full join -> join -> leave -> leave -> join cycle keeps memberCount and the real row count in lockstep, never drifting, never negative', async () => {
      const creator = await createUser('cycle-creator'); // auto-joined, count 1
      const joiner = await createUser('cycle-joiner');
      const group = await createGroup(creator.accessToken);
      expect(group.memberCount).toBe(1);

      const hit = (method: 'post' | 'delete') =>
        request(server())
          [method](`/community-groups/${group.id}/join`)
          .set('Authorization', `Bearer ${joiner.accessToken}`)
          .expect(200);

      const j1 = await hit('post');
      expect(j1.body).toEqual({ groupId: group.id, joined: true, memberCount: 2 });
      expect(await realMemberRowCount(group.id)).toBe(2);
      expect(await cachedMemberCount(group.id)).toBe(2);

      // Duplicate join — idempotent, must NOT double-increment.
      const j2 = await hit('post');
      expect(j2.body).toEqual({ groupId: group.id, joined: true, memberCount: 2 });
      expect(await realMemberRowCount(group.id)).toBe(2);

      const l1 = await hit('delete');
      expect(l1.body).toEqual({ groupId: group.id, joined: false, memberCount: 1 });
      expect(await realMemberRowCount(group.id)).toBe(1);
      expect(await cachedMemberCount(group.id)).toBe(1);

      // Leaving again when not a member — idempotent, memberCount unchanged.
      const l2 = await hit('delete');
      expect(l2.body).toEqual({ groupId: group.id, joined: false, memberCount: 1 });
      expect(await cachedMemberCount(group.id)).toBe(1);

      // Rejoin — proves leaving left no poisoned unique-index/row state.
      const j3 = await hit('post');
      expect(j3.body).toEqual({ groupId: group.id, joined: true, memberCount: 2 });
      expect(await realMemberRowCount(group.id)).toBe(2);
      expect(await cachedMemberCount(group.id)).toBe(2);
    });

    it('two concurrent joins by the same user produce exactly one CommunityGroupMember row and memberCount incremented exactly once', async () => {
      const creator = await createUser('conc-creator'); // count 1
      const joiner = await createUser('conc-joiner');
      const group = await createGroup(creator.accessToken);

      const fire = () =>
        request(server())
          .post(`/community-groups/${group.id}/join`)
          .set('Authorization', `Bearer ${joiner.accessToken}`);

      const [r1, r2] = await Promise.all([fire(), fire()]);
      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
      expect(r1.body.joined).toBe(true);
      expect(r2.body.joined).toBe(true);

      // The whole point: exactly one row, count went 1 -> 2, not 1 -> 3.
      expect(await realMemberRowCount(group.id)).toBe(2);
      expect(await cachedMemberCount(group.id)).toBe(2);
    });

    it('leaving a non-existent group is a 404; join/leave require auth', async () => {
      const { accessToken } = await createUser('jl-404');
      await request(server())
        .post('/community-groups/does-not-exist/join')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(server())
        .delete('/community-groups/does-not-exist/join')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
      await request(server()).post('/community-groups/x/join').expect(401);
    });
  });

  // ---------- List filters + pagination + per-caller joined ----------

  describe('GET /community-groups', () => {
    it('filters by city/positionPlayed/careerTrack (combinable) and keyset-paginates newest-first', async () => {
      const owner = await createUser('list-owner');
      await createGroup(owner.accessToken, { name: 'Lagos Strikers', city: 'Lagos' });
      await createGroup(owner.accessToken, { name: 'Lagos Midfielders', city: 'Lagos', positionPlayed: 'Midfielder' });
      await createGroup(owner.accessToken, { name: 'Abuja United', city: 'Abuja' });
      await createGroup(owner.accessToken, { name: 'Coaches Corner', careerTrack: 'Coaching' });

      const lagosOnly = await request(server())
        .get('/community-groups?city=Lagos&limit=1')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      // Newest-first: "Lagos Midfielders" was created after "Lagos Strikers".
      expect(lagosOnly.body.items.map((g: { name: string }) => g.name)).toEqual([
        'Lagos Midfielders',
      ]);
      expect(lagosOnly.body.nextCursor).toEqual(expect.any(String));

      const lagosPage2 = await request(server())
        .get(`/community-groups?city=Lagos&limit=1&cursor=${encodeURIComponent(lagosOnly.body.nextCursor)}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(lagosPage2.body.items.map((g: { name: string }) => g.name)).toEqual([
        'Lagos Strikers',
      ]);
      expect(lagosPage2.body.nextCursor).toBeNull();

      const combined = await request(server())
        .get('/community-groups?city=Lagos&positionPlayed=Midfielder')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(combined.body.items.map((g: { name: string }) => g.name)).toEqual([
        'Lagos Midfielders',
      ]);

      const byCareer = await request(server())
        .get('/community-groups?careerTrack=Coaching')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(byCareer.body.items.map((g: { name: string }) => g.name)).toEqual([
        'Coaches Corner',
      ]);
    });

    it('reports per-caller joined correctly, scoped to the calling user', async () => {
      const owner = await createUser('joined-owner');
      const other = await createUser('joined-other');
      const group = await createGroup(owner.accessToken, { name: 'Shared Group' });

      await request(server())
        .post(`/community-groups/${group.id}/join`)
        .set('Authorization', `Bearer ${other.accessToken}`)
        .expect(200);

      const asOwner = await request(server())
        .get('/community-groups')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      const stranger = await createUser('joined-stranger');
      const asStranger = await request(server())
        .get('/community-groups')
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .expect(200);

      expect(asOwner.body.items.find((g: { id: string }) => g.id === group.id).joined).toBe(true);
      expect(asStranger.body.items.find((g: { id: string }) => g.id === group.id).joined).toBe(
        false,
      );
    });
  });

  // ---------- GuardianConsentGuard: read yes, write no ----------

  describe('a restricted-pending minor', () => {
    it('can browse and read Community Groups, but cannot create, join, or leave (403 guardian_consent_pending)', async () => {
      const adult = await createUser('guard-adult');
      const minor = await createRestrictedMinor('guard');
      const group = await createGroup(adult.accessToken, { name: 'Adults Only' });

      // Reads are fine.
      await request(server())
        .get('/community-groups')
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(200);
      await request(server())
        .get(`/community-groups/${group.id}`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(200);
      await request(server())
        .get(`/community-groups/${group.id}/members`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(200);

      // Writes are blocked, and nothing changes.
      const createBlocked = await request(server())
        .post('/community-groups')
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .send({ name: 'Minor Group', city: 'Lagos' })
        .expect(403);
      expect(createBlocked.body.code).toBe('guardian_consent_pending');

      await request(server())
        .post(`/community-groups/${group.id}/join`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(403);
      await request(server())
        .delete(`/community-groups/${group.id}/join`)
        .set('Authorization', `Bearer ${minor.accessToken}`)
        .expect(403);

      const prisma = getTestPrismaClient();
      expect(await prisma.communityGroup.count()).toBe(1); // only the adult's
      expect(await cachedMemberCount(group.id)).toBe(1); // only the adult
    });
  });

  // ---------- Roster: alphabetical pagination + restricted-pending exclusion ----------

  describe('GET /community-groups/:id/members', () => {
    it('paginates alphabetically by displayName and 404s for an unknown group', async () => {
      const owner = await createUser('roster-owner'); // "E2E CG roster-owner" -> auto-joined
      const bob = await createUser('roster-Bob');
      const group = await createGroup(owner.accessToken, { name: 'Roster Group' });
      await request(server())
        .post(`/community-groups/${group.id}/join`)
        .set('Authorization', `Bearer ${bob.accessToken}`)
        .expect(200);

      const page = await request(server())
        .get(`/community-groups/${group.id}/members?limit=1`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(page.body.items).toHaveLength(1);
      expect(page.body.nextCursor).toEqual(expect.any(String));

      const page2 = await request(server())
        .get(`/community-groups/${group.id}/members?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(page2.body.items).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();

      const allNames = [...page.body.items, ...page2.body.items].map(
        (m: { displayName: string }) => m.displayName,
      );
      expect(allNames).toEqual([...allNames].sort());

      await request(server())
        .get('/community-groups/does-not-exist/members')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(404);
    });

    it('excludes a restricted-pending minor member from the visible roster (defence-in-depth — seeded directly, since the real join path is consent-gated)', async () => {
      const owner = await createUser('roster-exclusion-owner');
      const group = await createGroup(owner.accessToken, { name: 'Exclusion Group' });

      // The real POST /community-groups/:id/join path is GuardianConsentGuard
      // -gated, so a restricted-pending minor can never actually reach
      // membership through the API — this seeds the row directly via
      // Prisma to prove the roster's own visibility filter (defence-in-depth,
      // mirroring VISIBLE_CLUB_MEMBER_FILTER's own precedent) genuinely
      // excludes them if that state were ever reached (e.g. a future data
      // migration, or a bug elsewhere).
      const prisma = getTestPrismaClient();
      const minor = await prisma.user.create({
        data: {
          email: `e2e-cg-roster-minor-${Date.now()}@example.com`,
          passwordHash: 'unused',
          displayName: 'A Restricted Minor',
          dateOfBirth: new Date('2014-01-01'),
          isMinor: true,
          guardian: {
            create: {
              name: 'Guardian Name',
              email: `guardian-roster-${Date.now()}@example.com`,
              relationship: 'Parent',
              consentStatus: 'pending',
              consentToken: `tok-roster-${Date.now()}`,
              consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
            },
          },
        },
      });
      await prisma.communityGroupMember.create({
        data: { userId: minor.id, communityGroupId: group.id },
      });
      // memberCount left at its post-createGroup value on purpose — this
      // is exactly the "memberCount is not authoritative in isolation"
      // scenario the roster filter's own comment documents.

      const roster = await request(server())
        .get(`/community-groups/${group.id}/members`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);

      expect(
        roster.body.items.some((m: { id: string }) => m.id === minor.id),
      ).toBe(false);
      // The owner (a real, non-minor member) is still visible.
      expect(roster.body.items.some((m: { id: string }) => m.id === owner.userId)).toBe(true);
      // The real row exists in Postgres even though it's excluded from the
      // rendered roster.
      expect(
        await prisma.communityGroupMember.count({ where: { userId: minor.id } }),
      ).toBe(1);
    });
  });

  // ---------- Cascade on User delete ----------

  describe('account deletion cascade (Decision Log #44)', () => {
    it('hard-deleting a User cascades their CommunityGroupMember rows away, leaving the group and other members intact', async () => {
      const prisma = getTestPrismaClient();
      const creator = await createUser('cascade-creator');
      const leaver = await createUser('cascade-leaver');
      const group = await createGroup(creator.accessToken); // creator auto-joined

      await request(server())
        .post(`/community-groups/${group.id}/join`)
        .set('Authorization', `Bearer ${leaver.accessToken}`)
        .expect(200);
      expect(await realMemberRowCount(group.id)).toBe(2);

      // A real hard delete, the same operation AccountDeletionSweepService
      // performs after the 30-day grace period.
      await prisma.user.delete({ where: { id: leaver.userId } });

      // The membership row is gone; the group and the creator's own
      // membership survive. (memberCount is a denormalized cache — the
      // cascade doesn't touch it, matching how a raw hard delete behaves;
      // the real row count is the source of truth.)
      expect(await realMemberRowCount(group.id)).toBe(1);
      expect(
        await prisma.communityGroupMember.count({ where: { userId: creator.userId } }),
      ).toBe(1);
      await prisma.communityGroup.findUniqueOrThrow({ where: { id: group.id } });
    });
  });
});
