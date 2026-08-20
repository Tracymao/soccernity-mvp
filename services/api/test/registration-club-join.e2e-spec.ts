import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-2/auto-join-on-signup — the backlog item flagged when club pages
// themselves shipped in PR #58: RegisterDto had no club-selection field at
// all, so Build Plan Section 6's Sprint 2 "auto-join on signup" line was
// left unbuilt. This spec is the real-Postgres proof that:
//   1. registering with a real clubId genuinely creates a "_ClubMembership"
//      row and increments ClubPage.memberCount by exactly 1;
//   2. registering with no clubId at all has zero side effects on any club;
//   3. registering with a bad clubId fails the whole request with 404 AND
//      never commits a User row for that email — the specific
//      user-creation-before-club-validation ordering bug this PR's brief
//      called out as the most likely place to hide a real regression.
// Same reasons a real e2e layer (not just a mock) matters here as
// clubs.e2e-spec.ts already documents: this exercises ClubsService.joinClub's
// raw $executeRaw INSERT against the real "_ClubMembership" table, now via a
// second call path (registration) in addition to the standalone
// POST /clubs/:id/join endpoint.
describe('Registration + club auto-join e2e (real Postgres, no mocked PrismaService)', () => {
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
    return `e2e-reg-club-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  // No POST /clubs endpoint exists in Section 4.4 to create a ClubPage
  // through the API — seeded directly via Prisma, same precedent
  // clubs.e2e-spec.ts already established.
  async function seedClub(memberCount = 0) {
    const prisma = getTestPrismaClient();
    return prisma.clubPage.create({
      data: { name: 'Beta FC', league: 'Sunday League', country: 'England', memberCount },
    });
  }

  it('registering with a real clubId creates exactly one "_ClubMembership" row and increments memberCount by exactly 1', async () => {
    const club = await seedClub(0);
    const email = uniqueEmail();

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'a-real-password-123',
        displayName: 'Club Joiner',
        dateOfBirth: '1998-04-12', // adult, no guardian branch
        clubId: club.id,
      })
      .expect(201);

    const userId = registerResponse.body.user.id as string;

    const prisma = getTestPrismaClient();
    const membershipRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "A" = ${club.id} AND "B" = ${userId}
    `;
    expect(Number(membershipRows[0]!.count)).toBe(1);

    const clubRow = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
    expect(clubRow.memberCount).toBe(1);
  });

  it('registering with no clubId at all ("no club for now") creates no "_ClubMembership" row and leaves every ClubPage.memberCount untouched', async () => {
    const club = await seedClub(0);
    const email = uniqueEmail();

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'a-real-password-123',
        displayName: 'No Club For Now',
        dateOfBirth: '1998-04-12',
        // clubId omitted entirely — the natural absence, not a sentinel.
      })
      .expect(201);

    const userId = registerResponse.body.user.id as string;

    const prisma = getTestPrismaClient();
    const membershipRows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*) AS count FROM "_ClubMembership" WHERE "B" = ${userId}
    `;
    expect(Number(membershipRows[0]!.count)).toBe(0);

    const clubRow = await prisma.clubPage.findUniqueOrThrow({ where: { id: club.id } });
    expect(clubRow.memberCount).toBe(0);
  });

  it('registering with a clubId that does not reference a real club fails the whole registration with 404 AND creates no User row for that email (the ordering bug check)', async () => {
    const email = uniqueEmail();
    // A well-formed but entirely non-existent UUID -- passes @IsUUID(),
    // fails ClubsService.assertClubExists's existence check.
    const nonExistentClubId = '00000000-0000-4000-8000-000000000000';

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'a-real-password-123',
        displayName: 'Bad Club Attempt',
        dateOfBirth: '1998-04-12',
        clubId: nonExistentClubId,
      })
      .expect(404);

    // The critical regression check: if user creation had happened before
    // club validation, this User row would exist despite the 404 above,
    // and this same email could never successfully register again (the
    // pre-existing duplicate-email check would 409 it). Query directly --
    // not inferred from the HTTP response.
    const prisma = getTestPrismaClient();
    const orphanedUser = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    expect(orphanedUser).toBeNull();

    // Confirm the email can genuinely still register (proves no orphaned
    // row silently blocked it) once a bad clubId isn't in the way.
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'a-real-password-123',
        displayName: 'Retry After Bad Club',
        dateOfBirth: '1998-04-12',
      })
      .expect(201);
  });
});
