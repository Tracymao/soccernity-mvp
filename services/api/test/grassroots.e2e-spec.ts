import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-5/grassroots-records-service — Build Plan Section 4.5. This hits
// test/README.md's e2e triggers: transaction/isolation-level reasoning
// (the "first write is final" result race) and a real permission model
// enforced by joining through teamA/teamB.createdById against real rows.
// The mocked unit suite (src/modules/grassroots/*.spec.ts) covers the
// DTO validation, the state-machine rejections, the 404-vs-403 ordering
// and the fast-path 409s; this file covers the parts a mock can't prove.
//
// Users are seeded directly via Prisma + a real TokenService-minted
// access token (the createUser() helper), not POST /auth/register — the
// same pattern clubs.e2e-spec.ts / feed-reactions.e2e-spec.ts use. None
// of the Grassroots endpoints carry @AuthRateLimit(), so this is a speed
// choice, not a rate-limit workaround: every downstream request still
// exercises the real JwtAuthGuard -> TokenService.verifyAccessToken and
// (for writes) the real GuardianConsentGuard chain.
describe('Grassroots Records Service e2e (Section 4.5)', () => {
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

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-grassroots-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Grassroots ${label}`,
        dateOfBirth: new Date('1994-05-05'), // adult — GuardianConsentGuard passes
        isMinor: false,
      },
    });
    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  function server() {
    return app.getHttpServer();
  }

  async function createTeam(
    token: string,
    over: Partial<{ name: string; city: string; leagueType: string }> = {},
  ): Promise<string> {
    const res = await request(server())
      .post('/teams')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: over.name ?? 'Alpha FC', city: over.city ?? 'London', leagueType: over.leagueType ?? 'informal' })
      .expect(201);
    return res.body.id as string;
  }

  // ---------- Teams ----------

  describe('POST /teams + GET /teams/:id', () => {
    it('creates a team owned by the caller, and GET /teams/:id exposes no organiser PII', async () => {
      const organiser = await createUser('team-owner');

      const create = await request(server())
        .post('/teams')
        .set('Authorization', `Bearer ${organiser.accessToken}`)
        .send({ name: 'Hackney Wick FC', city: 'London', leagueType: 'school' })
        .expect(201);

      expect(create.body).toEqual({
        id: expect.any(String),
        name: 'Hackney Wick FC',
        city: 'London',
        leagueType: 'school',
        createdById: organiser.userId,
        verified: false,
      });

      const get = await request(server())
        .get(`/teams/${create.body.id}`)
        .set('Authorization', `Bearer ${organiser.accessToken}`)
        .expect(200);

      // createdById is fine (an opaque id); no email / nested user.
      expect(get.body.createdById).toBe(organiser.userId);
      expect(get.body).not.toHaveProperty('createdBy');
      expect(JSON.stringify(get.body)).not.toContain('@example.com');
    });

    it('GET /teams/:id 404s for a non-existent id; POST /teams requires auth', async () => {
      const { accessToken } = await createUser('team-404');
      await request(server()).get('/teams/does-not-exist').set('Authorization', `Bearer ${accessToken}`).expect(404);
      await request(server()).post('/teams').send({ name: 'X Y', city: 'Z Z', leagueType: 'informal' }).expect(401);
    });
  });

  describe('GET /teams?city=', () => {
    it('filters by exact city and keyset-paginates alphabetically by name', async () => {
      const owner = await createUser('list-owner');
      await createTeam(owner.accessToken, { name: 'Zulu FC', city: 'Leeds' });
      await createTeam(owner.accessToken, { name: 'Alpha FC', city: 'Leeds' });
      await createTeam(owner.accessToken, { name: 'Bravo FC', city: 'Leeds' });
      await createTeam(owner.accessToken, { name: 'Other FC', city: 'Bristol' });

      const page1 = await request(server())
        .get('/teams?city=Leeds&limit=2')
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(page1.body.items.map((t: { name: string }) => t.name)).toEqual(['Alpha FC', 'Bravo FC']);
      expect(page1.body.nextCursor).toEqual(expect.any(String));

      const page2 = await request(server())
        .get(`/teams?city=Leeds&limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
        .set('Authorization', `Bearer ${owner.accessToken}`)
        .expect(200);
      expect(page2.body.items.map((t: { name: string }) => t.name)).toEqual(['Zulu FC']);
      expect(page2.body.nextCursor).toBeNull();
    });
  });

  // ---------- Fixtures: permission model (Decision Log #255) ----------

  describe('POST /fixtures — permission model', () => {
    it('lets the creator of teamA schedule a fixture (teamB registered, different owner)', async () => {
      const orgA = await createUser('fx-a');
      const orgB = await createUser('fx-b');
      const teamA = await createTeam(orgA.accessToken, { name: 'A FC' });
      const teamB = await createTeam(orgB.accessToken, { name: 'B FC' });

      const res = await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ teamAId: teamA, teamBId: teamB, scheduledAt: '2026-10-01T14:00:00.000Z', venue: 'Hackney Marshes' })
        .expect(201);

      expect(res.body.status).toBe('scheduled');
      expect(res.body.teamA.id).toBe(teamA);
      expect(res.body.teamB.id).toBe(teamB);
      expect(res.body.result).toBeNull();
    });

    it('403s when the caller is not the creator of teamA (even if they own teamB)', async () => {
      const orgA = await createUser('fx-403-a');
      const orgB = await createUser('fx-403-b');
      const teamA = await createTeam(orgA.accessToken, { name: 'A FC' });
      const teamB = await createTeam(orgB.accessToken, { name: 'B FC' });

      await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${orgB.accessToken}`)
        .send({ teamAId: teamA, teamBId: teamB, scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(403);
    });

    it('404s (not 403) when teamA does not exist, before the authz check', async () => {
      const org = await createUser('fx-404');
      await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ teamAId: '11111111-1111-4111-8111-111111111111', scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(404);
    });

    it('400s when teamB === teamA', async () => {
      const org = await createUser('fx-same');
      const teamA = await createTeam(org.accessToken);
      await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ teamAId: teamA, teamBId: teamA, scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(400);
    });

    it('stores teamBId = null AND opponentName = null for the fully-TBD "Opponent TBC" state (Decision Log #256)', async () => {
      const org = await createUser('fx-tbc');
      const teamA = await createTeam(org.accessToken);

      const res = await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ teamAId: teamA, scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(201);
      expect(res.body.teamBId).toBeNull();
      expect(res.body.teamB).toBeNull();
      expect(res.body.opponentName).toBeNull();

      const prisma = getTestPrismaClient();
      const row = await prisma.fixture.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row.teamBId).toBeNull();
      expect(row.opponentName).toBeNull();
    });
  });

  // ---------- Free-text opponent name (Decision Log #256, backend half) ----------

  describe('POST /fixtures — free-text opponentName', () => {
    it('persists a trimmed opponentName (teamBId null) and round-trips it through both fixture reads', async () => {
      const org = await createUser('fx-opp-name');
      const teamA = await createTeam(org.accessToken, { name: 'Home FC' });

      const created = await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ teamAId: teamA, opponentName: '  Riverside FC  ', scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(201);
      expect(created.body.teamBId).toBeNull();
      expect(created.body.teamB).toBeNull();
      expect(created.body.opponentName).toBe('Riverside FC');

      const prisma = getTestPrismaClient();
      const row = await prisma.fixture.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.opponentName).toBe('Riverside FC');

      const byId = await request(server())
        .get(`/fixtures/${created.body.id}`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(200);
      expect(byId.body.opponentName).toBe('Riverside FC');

      const teamFixtures = await request(server())
        .get(`/teams/${teamA}/fixtures`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(200);
      expect(teamFixtures.body.items[0].opponentName).toBe('Riverside FC');
    });

    it('400s when both teamBId and opponentName are supplied', async () => {
      const orgA = await createUser('fx-both-a');
      const orgB = await createUser('fx-both-b');
      const teamA = await createTeam(orgA.accessToken, { name: 'A FC' });
      const teamB = await createTeam(orgB.accessToken, { name: 'B FC' });

      await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ teamAId: teamA, teamBId: teamB, opponentName: 'Riverside FC', scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(400);

      const prisma = getTestPrismaClient();
      expect(await prisma.fixture.count()).toBe(0);
    });
  });

  // ---------- The status machine (Decision Log #254) ----------

  describe('PATCH /fixtures/:id/status + the full scheduled -> live -> result -> full_time machine', () => {
    async function scheduledFixture() {
      const orgA = await createUser('m-a');
      const orgB = await createUser('m-b');
      const teamA = await createTeam(orgA.accessToken, { name: 'A FC' });
      const teamB = await createTeam(orgB.accessToken, { name: 'B FC' });
      const res = await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ teamAId: teamA, teamBId: teamB, scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(201);
      return { fixtureId: res.body.id as string, orgA, orgB };
    }

    it('scheduled -> live (PATCH) -> full_time (POST result), each verified against Postgres', async () => {
      const { fixtureId, orgA } = await scheduledFixture();
      const prisma = getTestPrismaClient();

      const live = await request(server())
        .patch(`/fixtures/${fixtureId}/status`)
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ status: 'live' })
        .expect(200);
      expect(live.body.status).toBe('live');
      expect((await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } })).status).toBe('live');

      const result = await request(server())
        .post(`/fixtures/${fixtureId}/result`)
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ scoreA: 3, scoreB: 2 })
        .expect(200);
      expect(result.body.status).toBe('full_time');
      expect(result.body.result).toMatchObject({ scoreA: 3, scoreB: 2 });

      const fixtureRow = await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId }, include: { result: true } });
      expect(fixtureRow.status).toBe('full_time');
      expect(fixtureRow.result).toMatchObject({ scoreA: 3, scoreB: 2, enteredById: orgA.userId });
    });

    it('the creator of teamB (not just teamA) can drive the machine', async () => {
      const { fixtureId, orgB } = await scheduledFixture();
      await request(server())
        .patch(`/fixtures/${fixtureId}/status`)
        .set('Authorization', `Bearer ${orgB.accessToken}`)
        .send({ status: 'live' })
        .expect(200);
      await request(server())
        .post(`/fixtures/${fixtureId}/result`)
        .set('Authorization', `Bearer ${orgB.accessToken}`)
        .send({ scoreA: 0, scoreB: 0 })
        .expect(200);
    });

    it('a stranger cannot PATCH status or log a result (403), and nothing changes', async () => {
      const { fixtureId } = await scheduledFixture();
      const stranger = await createUser('m-stranger');
      const prisma = getTestPrismaClient();

      await request(server())
        .patch(`/fixtures/${fixtureId}/status`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ status: 'live' })
        .expect(403);
      await request(server())
        .post(`/fixtures/${fixtureId}/result`)
        .set('Authorization', `Bearer ${stranger.accessToken}`)
        .send({ scoreA: 9, scoreB: 9 })
        .expect(403);

      expect((await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } })).status).toBe('scheduled');
      expect(await prisma.result.count({ where: { fixtureId } })).toBe(0);
    });

    it('rejects illegal transitions with 409, naming current + requested status', async () => {
      const { fixtureId, orgA } = await scheduledFixture();

      // scheduled -> full_time via PATCH is not allowed (that path is result-only)
      const badJump = await request(server())
        .patch(`/fixtures/${fixtureId}/status`)
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ status: 'full_time' })
        .expect(409);
      expect(badJump.body.message).toMatch(/"scheduled" to "full_time"/);

      // reach full_time, then any further PATCH is 409
      await request(server())
        .post(`/fixtures/${fixtureId}/result`)
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ scoreA: 1, scoreB: 1 })
        .expect(200);
      await request(server())
        .patch(`/fixtures/${fixtureId}/status`)
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ status: 'live' })
        .expect(409);
    });

    it('rejects PATCH status: "scheduled" at the DTO layer (400, not 409)', async () => {
      const { fixtureId, orgA } = await scheduledFixture();
      await request(server())
        .patch(`/fixtures/${fixtureId}/status`)
        .set('Authorization', `Bearer ${orgA.accessToken}`)
        .send({ status: 'scheduled' })
        .expect(400);
    });
  });

  // ---------- "First write is final" + the genuine race (Decision Log #255) ----------

  describe('POST /fixtures/:id/result — first write is final', () => {
    async function scheduledFixtureOwnedBy(): Promise<{ fixtureId: string; org: { userId: string; accessToken: string } }> {
      const org = await createUser('race-owner');
      const teamA = await createTeam(org.accessToken, { name: 'A FC' });
      const res = await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ teamAId: teamA, scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(201);
      return { fixtureId: res.body.id, org };
    }

    it('a second sequential submission is a 409, and the original score is untouched', async () => {
      const { fixtureId, org } = await scheduledFixtureOwnedBy();
      const prisma = getTestPrismaClient();

      await request(server())
        .post(`/fixtures/${fixtureId}/result`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ scoreA: 2, scoreB: 1 })
        .expect(200);

      const second = await request(server())
        .post(`/fixtures/${fixtureId}/result`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ scoreA: 5, scoreB: 5 })
        .expect(409);
      expect(second.body.message).toMatch(/already been recorded/i);

      const row = await prisma.result.findUniqueOrThrow({ where: { fixtureId } });
      expect(row).toMatchObject({ scoreA: 2, scoreB: 1 });
    });

    it('two concurrent submissions: exactly one 200 and one 409, and Postgres holds exactly one consistent Result', async () => {
      const { fixtureId, org } = await scheduledFixtureOwnedBy();
      const prisma = getTestPrismaClient();

      const fire = (scoreA: number, scoreB: number) =>
        request(server())
          .post(`/fixtures/${fixtureId}/result`)
          .set('Authorization', `Bearer ${org.accessToken}`)
          .send({ scoreA, scoreB });

      const [r1, r2] = await Promise.all([fire(1, 0), fire(0, 1)]);
      const statuses = [r1.status, r2.status].sort();
      expect(statuses).toEqual([200, 409]);

      const results = await prisma.result.findMany({ where: { fixtureId } });
      expect(results).toHaveLength(1);
      // The single stored result must match whichever request won.
      const winner = r1.status === 200 ? r1 : r2;
      expect(results[0]).toMatchObject({
        scoreA: winner.body.result.scoreA,
        scoreB: winner.body.result.scoreB,
      });
      expect((await prisma.fixture.findUniqueOrThrow({ where: { id: fixtureId } })).status).toBe('full_time');
    });
  });

  // ---------- GET /fixtures/:id + GET /teams/:id/fixtures ----------

  describe('GET /fixtures/:id + GET /teams/:id/fixtures', () => {
    it('GET /fixtures/:id 404s for a missing id and includes status + teams + result', async () => {
      const org = await createUser('get-fx');
      const teamA = await createTeam(org.accessToken);
      const created = await request(server())
        .post('/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .send({ teamAId: teamA, scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(201);

      await request(server()).get('/fixtures/missing').set('Authorization', `Bearer ${org.accessToken}`).expect(404);

      const got = await request(server())
        .get(`/fixtures/${created.body.id}`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(200);
      expect(got.body).toMatchObject({ status: 'scheduled', result: null });
      expect(got.body.teamA).toMatchObject({ id: teamA });
    });

    it('GET /teams/:id/fixtures lists fixtures the team is in (as A or B), newest-scheduled-first, keyset-paginated', async () => {
      const org = await createUser('teamfx-owner');
      const opponentOrg = await createUser('teamfx-opp');
      const home = await createTeam(org.accessToken, { name: 'Home FC' });
      const away = await createTeam(opponentOrg.accessToken, { name: 'Away FC' });

      // home as teamA in two fixtures, home as teamB in one (created by the opponent)
      const mk = (token: string, teamAId: string, teamBId: string, when: string) =>
        request(server())
          .post('/fixtures')
          .set('Authorization', `Bearer ${token}`)
          .send({ teamAId, teamBId, scheduledAt: when })
          .expect(201);

      const f1 = await mk(org.accessToken, home, away, '2026-09-01T14:00:00.000Z');
      const f2 = await mk(org.accessToken, home, away, '2026-10-01T14:00:00.000Z');
      const f3 = await mk(opponentOrg.accessToken, away, home, '2026-11-01T14:00:00.000Z');

      const page1 = await request(server())
        .get(`/teams/${home}/fixtures?limit=2`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(200);
      expect(page1.body.items.map((f: { id: string }) => f.id)).toEqual([f3.body.id, f2.body.id]);
      expect(page1.body.nextCursor).toEqual(expect.any(String));

      const page2 = await request(server())
        .get(`/teams/${home}/fixtures?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor)}`)
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(200);
      expect(page2.body.items.map((f: { id: string }) => f.id)).toEqual([f1.body.id]);
      expect(page2.body.nextCursor).toBeNull();

      await request(server())
        .get('/teams/does-not-exist/fixtures')
        .set('Authorization', `Bearer ${org.accessToken}`)
        .expect(404);
    });
  });
});
