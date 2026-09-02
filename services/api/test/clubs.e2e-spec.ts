import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// This is the exact gap that motivated this whole PR: ClubsService.joinClub
// (see src/modules/clubs/clubs.service.ts) issues a raw, parameterized
// $executeRaw INSERT ... ON CONFLICT DO NOTHING directly against the real
// "_ClubMembership" implicit join table (created by migration
// 20260819204443_fix_club_membership_relation). Before this PR, every test
// touching joinClub mocked PrismaService/ClubsService entirely — nothing
// had ever run that SQL against a real Postgres instance, so its
// ON CONFLICT DO NOTHING idempotency (0 vs 1 affected rows) and the
// transactional memberCount increment paired with it had only ever been
// exercised by a mock returning whatever number the test told it to.
//
// sprint-2/club-leave adds the symmetric DELETE :id/join (leaveClub)
// coverage below, in the same file rather than a new one — same raw-SQL-
// against-"_ClubMembership" risk profile as joinClub, just the DELETE
// direction, so it belongs alongside the join proof rather than in a
// separate spec file.
describe('Clubs e2e: POST/DELETE /clubs/:id/join against the real "_ClubMembership" table', () => {
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

  function uniqueEmail(): string {
    return `e2e-clubs-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // No POST /clubs endpoint exists in Section 4.4 to create a ClubPage
  // through the API — seeded directly via Prisma, the same "seed directly
  // via Prisma" pattern clubs/README.md already documents for its own
  // (mocked-Prisma) HTTP-layer verification.
  async function seedClub(memberCount = 0) {
    const prisma = getTestPrismaClient();
    return prisma.clubPage.create({
      data: { name: 'Alpha FC', league: 'Sunday League', country: 'England', memberCount },
    });
  }

  async function registerAndLogin(): Promise<{ userId: string; accessToken: string }> {
    const email = uniqueEmail();
    const password = 'a-real-password-123';

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        displayName: 'E2E Clubs Test User',
        dateOfBirth: '1998-07-04', // adult, no guardian branch
      })
      .expect(201);

    // POST /auth/register now returns the token pair in the same flat
    // shape POST /auth/login does (sprint-2/auth-response-shape-
    // reconciliation) -- see auth.e2e-spec.ts's note and auth/README.md.
    return {
      userId: registerResponse.body.user.id as string,
      accessToken: registerResponse.body.accessToken as string,
    };
  }

  // sprint-2/club-leave: the DELETE :id/join tests below (four scenarios,
  // several needing their own distinct user) pushed this file's total
  // real POST /auth/register calls past real AuthThrottlerGuard's
  // hardcoded 5-requests/60s limit when combined with the existing
  // registerAndLogin() calls above — the exact same real, discovered gap
  // feed-reactions.e2e-spec.ts/follow.e2e-spec.ts/counters.e2e-spec.ts
  // already hit and worked around (see test/README.md's matching entry
  // for the full story, including that the underlying rate-limit
  // config-wiring bug is now fixed but the workaround itself is
  // deliberately kept). Rather than retrofit every existing test above to
  // this pattern too (registerAndLogin's own 4 calls stay comfortably
  // under the limit on their own), only the new DELETE :id/join tests
  // below use this helper: seeds the User row directly via Prisma and
  // mints a real access token via the real, unmocked TokenService pulled
  // from this test's own DI container — every downstream request still
  // exercises the real JwtAuthGuard -> TokenService.verifyAccessToken
  // chain; only register's own HTTP/rate-limiter/argon2id path is
  // bypassed, and that path is already fully covered by
  // auth.e2e-spec.ts (and by this file's own registerAndLogin-based tests
  // above).
  function uniqueLeaveEmail(label: string): string {
    return `e2e-clubs-leave-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  async function createUser(label: string): Promise<{ userId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: uniqueLeaveEmail(label),
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Clubs Leave User ${label}`,
        dateOfBirth: new Date('1998-07-04'), // adult, no guardian-consent branch
        isMinor: false,
      },
    });

    const tokenService = app.get(TokenService);
    const { accessToken } = await tokenService.issueTokenPair(user.id, user.role);

    return { userId: user.id, accessToken: accessToken.token };
  }

  it('joining twice creates exactly one "_ClubMembership" row and increments ClubPage.memberCount by exactly 1, not 2', async () => {
    const club = await seedClub(0);
    const { userId, accessToken } = await registerAndLogin();

    const firstJoin = await request(app.getHttpServer())
      .post(`/clubs/${club.id}/join`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(firstJoin.body).toEqual({ clubId: club.id, joined: true, memberCount: 1 });

    const secondJoin = await request(app.getHttpServer())
      .post(`/clubs/${club.id}/join`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // The bug this PR guards against: a naive (non-atomic, or
    // incorrectly-mocked) implementation would double-increment
    // memberCount to 2 on the second call instead of staying at 1.
    expect(secondJoin.body).toEqual({ clubId: club.id, joined: true, memberCount: 1 });

    // Query the real "_ClubMembership" table directly — not through
    // ClubsService, not through any mock — to confirm exactly one row
    // exists for this (club, user) pair. "A" = ClubPage.id, "B" = User.id,
    // per schema.prisma's @relation("ClubMembership") comment and the
    // migration that created this table.
    const prisma = getTestPrismaClient();
    const membershipRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id} AND "B" = ${userId}
    `;
    expect(Number(membershipRows[0]!.count)).toBe(1);

    // And confirm ClubPage.memberCount in the real database matches the
    // HTTP response — the denormalized cache and the real join-table row
    // count must agree: starting count (0) + exactly 1, not 2.
    const clubRow = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
    expect(clubRow.memberCount).toBe(1);
  });

  it('two different users joining the same club each get their own real "_ClubMembership" row', async () => {
    const club = await seedClub(0);
    const userA = await registerAndLogin();
    const userB = await registerAndLogin();

    await request(app.getHttpServer())
      .post(`/clubs/${club.id}/join`)
      .set('Authorization', `Bearer ${userA.accessToken}`)
      .expect(200);

    const secondUserJoin = await request(app.getHttpServer())
      .post(`/clubs/${club.id}/join`)
      .set('Authorization', `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(secondUserJoin.body).toEqual({ clubId: club.id, joined: true, memberCount: 2 });

    const prisma = getTestPrismaClient();
    const membershipRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id}
    `;
    expect(Number(membershipRows[0]!.count)).toBe(2);
  });

  it('requires authentication (real JwtAuthGuard, no override) — 401 with no bearer token', async () => {
    const club = await seedClub(0);

    await request(app.getHttpServer()).post(`/clubs/${club.id}/join`).expect(401);

    const prisma = getTestPrismaClient();
    const clubRow = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
    expect(clubRow.memberCount).toBe(0);
  });

  it('404s for a club id that does not exist, and writes nothing', async () => {
    const { accessToken } = await registerAndLogin();

    await request(app.getHttpServer())
      .post('/clubs/does-not-exist/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  describe('DELETE /clubs/:id/join (leaveClub)', () => {
    it('leaving a club you are a member of removes the real "_ClubMembership" row and decrements memberCount by exactly 1', async () => {
      const club = await seedClub(0);
      const { userId, accessToken } = await createUser('1');

      await request(app.getHttpServer())
        .post(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const prisma = getTestPrismaClient();
      const beforeLeave = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id} AND "B" = ${userId}
      `;
      expect(Number(beforeLeave[0]!.count)).toBe(1);

      const leaveResponse = await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(leaveResponse.body).toEqual({ clubId: club.id, joined: false, memberCount: 0 });

      // Query the real "_ClubMembership" table directly — not through
      // ClubsService — to confirm the row is genuinely gone, not just
      // that the HTTP response claims it is.
      const afterLeave = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id} AND "B" = ${userId}
      `;
      expect(Number(afterLeave[0]!.count)).toBe(0);

      const clubRow = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
      expect(clubRow.memberCount).toBe(0);
    });

    it('leaving a club you are NOT a member of is an idempotent 200, memberCount stays unchanged, and never goes negative even called repeatedly on a club already at 0', async () => {
      const club = await seedClub(0);
      const { accessToken } = await createUser('2');

      // Never joined this club at all.
      const firstLeave = await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(firstLeave.body).toEqual({ clubId: club.id, joined: false, memberCount: 0 });

      // Call it again — and again — on a club whose memberCount is
      // already 0. This is the exact boundary case the updateMany
      // `memberCount: { gt: 0 }` guard in ClubsService.leaveClub exists
      // for: repeated leave calls must never push memberCount below 0.
      const secondLeave = await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(secondLeave.body).toEqual({ clubId: club.id, joined: false, memberCount: 0 });

      const thirdLeave = await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(thirdLeave.body).toEqual({ clubId: club.id, joined: false, memberCount: 0 });

      // Confirmed directly against Postgres, not just the HTTP responses:
      // memberCount is still exactly 0, never negative.
      const prisma = getTestPrismaClient();
      const clubRow = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
      expect(clubRow.memberCount).toBe(0);
      expect(clubRow.memberCount).toBeGreaterThanOrEqual(0);

      // And no "_ClubMembership" row was ever created for this pair.
      const membershipRows = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id}
      `;
      expect(Number(membershipRows[0]!.count)).toBe(0);
    });

    it('404s for a club id that does not exist, same as POST :id/join', async () => {
      const { accessToken } = await createUser('3');

      await request(app.getHttpServer())
        .delete('/clubs/does-not-exist/join')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('requires authentication (real JwtAuthGuard, no override) — 401 with no bearer token', async () => {
      const club = await seedClub(0);

      await request(app.getHttpServer()).delete(`/clubs/${club.id}/join`).expect(401);
    });

    it('a full join -> leave -> join -> leave cycle lands memberCount and the "_ClubMembership" row count back at their exact starting values after each full cycle, not just at the end', async () => {
      const club = await seedClub(0);
      const { userId, accessToken } = await createUser('4');
      const prisma = getTestPrismaClient();

      async function membershipRowCount(): Promise<number> {
        const rows = await prisma.$queryRaw<{ count: bigint }[]>`
          SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id} AND "B" = ${userId}
        `;
        return Number(rows[0]!.count);
      }

      async function currentMemberCount(): Promise<number> {
        const row = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
        return row.memberCount;
      }

      // Baseline: clean slate.
      expect(await membershipRowCount()).toBe(0);
      expect(await currentMemberCount()).toBe(0);

      // Cycle 1: join.
      const join1 = await request(app.getHttpServer())
        .post(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(join1.body).toEqual({ clubId: club.id, joined: true, memberCount: 1 });
      expect(await membershipRowCount()).toBe(1);
      expect(await currentMemberCount()).toBe(1);

      // Cycle 1: leave. Back to the exact starting values.
      const leave1 = await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(leave1.body).toEqual({ clubId: club.id, joined: false, memberCount: 0 });
      expect(await membershipRowCount()).toBe(0);
      expect(await currentMemberCount()).toBe(0);

      // Cycle 2: join again — proves leaving doesn't leave any residue
      // (e.g. a stale join-table row, or a poisoned unique index state)
      // that would prevent rejoining the same club a second time.
      const join2 = await request(app.getHttpServer())
        .post(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(join2.body).toEqual({ clubId: club.id, joined: true, memberCount: 1 });
      expect(await membershipRowCount()).toBe(1);
      expect(await currentMemberCount()).toBe(1);

      // Cycle 2: leave again. Back to the exact starting values a second
      // time — no drift accumulated across the full two-cycle sequence.
      const leave2 = await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(leave2.body).toEqual({ clubId: club.id, joined: false, memberCount: 0 });
      expect(await membershipRowCount()).toBe(0);
      expect(await currentMemberCount()).toBe(0);
    });
  });

  // Decision Log #154: GET /clubs and GET /clubs/:id now return a
  // per-caller `joined` boolean, computed via a plain Prisma relation
  // filter (members: { some: { id: userId } }) against the same real
  // "_ClubMembership" table joinClub/leaveClub write to. These prove it
  // against a live database, and that the filter is scoped to the CALLING
  // user (not leaking another user's membership).
  describe('GET /clubs + GET /clubs/:id per-caller `joined` flag (Decision Log #154)', () => {
    async function seedNamedClub(name: string) {
      const prisma = getTestPrismaClient();
      return prisma.clubPage.create({
        data: { name, league: 'Sunday League', country: 'England', memberCount: 0 },
      });
    }

    it('GET /clubs reports joined:true only for the clubs the caller has actually joined', async () => {
      const joinedClub = await seedNamedClub('Aardvark FC');
      const otherClub = await seedNamedClub('Zephyr FC');
      const { accessToken } = await createUser('joined-list');

      await request(app.getHttpServer())
        .post(`/clubs/${joinedClub.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const list = await request(app.getHttpServer())
        .get('/clubs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const byId = Object.fromEntries(
        (list.body.items as { id: string; joined: boolean }[]).map((c) => [c.id, c.joined]),
      );
      expect(byId[joinedClub.id]).toBe(true);
      expect(byId[otherClub.id]).toBe(false);
    });

    it('GET /clubs/:id reports joined:true after a real join and joined:false for a non-member', async () => {
      const club = await seedNamedClub('Boomerang FC');
      const member = await createUser('gbid-member');
      const nonMember = await createUser('gbid-nonmember');

      await request(app.getHttpServer())
        .post(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(200);

      const asMember = await request(app.getHttpServer())
        .get(`/clubs/${club.id}`)
        .set('Authorization', `Bearer ${member.accessToken}`)
        .expect(200);
      expect(asMember.body.joined).toBe(true);

      const asNonMember = await request(app.getHttpServer())
        .get(`/clubs/${club.id}`)
        .set('Authorization', `Bearer ${nonMember.accessToken}`)
        .expect(200);
      expect(asNonMember.body.joined).toBe(false);
    });

    it('the `joined` flag is scoped to the calling user — user B joining does not flip it true for user A', async () => {
      const club = await seedNamedClub('Cartwheel FC');
      const userA = await createUser('scope-a');
      const userB = await createUser('scope-b');

      await request(app.getHttpServer())
        .post(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${userB.accessToken}`)
        .expect(200);

      const asA = await request(app.getHttpServer())
        .get(`/clubs/${club.id}`)
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);
      expect(asA.body.joined).toBe(false);

      const listAsA = await request(app.getHttpServer())
        .get('/clubs')
        .set('Authorization', `Bearer ${userA.accessToken}`)
        .expect(200);
      const clubInList = (listAsA.body.items as { id: string; joined: boolean }[]).find((c) => c.id === club.id);
      expect(clubInList?.joined).toBe(false);
    });

    it('leaving a club flips `joined` back to false', async () => {
      const club = await seedNamedClub('Dandelion FC');
      const { accessToken } = await createUser('gb-leave');

      await request(app.getHttpServer())
        .post(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .delete(`/clubs/${club.id}/join`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/clubs/${club.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(after.body.joined).toBe(false);
    });
  });
});
