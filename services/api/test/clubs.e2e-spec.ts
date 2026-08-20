import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
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
describe('Clubs e2e: POST /clubs/:id/join idempotency against the real "_ClubMembership" table', () => {
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
});
