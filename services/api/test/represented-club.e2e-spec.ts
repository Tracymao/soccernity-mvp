import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// PATCH /users/:id/represented-club (Decision Log #74) against real
// Postgres: the new User.representedClubId FK (ON DELETE SET NULL), the
// membership check, and the leave-clears-representation path in
// ClubsService.leaveClub. Users are seeded directly with a real token
// minted by TokenService, the same bypass clubs.e2e-spec.ts uses for
// the DELETE :id/join block, to stay under AuthThrottlerGuard's shared
// register limit.
describe('Represented club e2e (Decision Log #74)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
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
        email: `e2e-represent-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `E2E Represent ${label}`,
        dateOfBirth: new Date('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  async function seedClub(name: string): Promise<string> {
    const club = await getTestPrismaClient().clubPage.create({
      data: { name, league: 'Sunday League', country: 'Nigeria' },
    });
    return club.id;
  }

  async function join(accessToken: string, clubId: string): Promise<void> {
    await request(app.getHttpServer()).post(`/clubs/${clubId}/join`).set('Authorization', `Bearer ${accessToken}`).expect(200);
  }

  function setRepresented(accessToken: string, userId: string, clubId: string | null) {
    return request(app.getHttpServer())
      .patch(`/users/${userId}/represented-club`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ clubId });
  }

  async function getProfile(accessToken: string, userId: string) {
    const res = await request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    return res.body as { representedClub: { id: string; name: string } | null };
  }

  it('a member can represent a club they joined, and GET /users/:id reflects it', async () => {
    const { userId, accessToken } = await createUser('happy');
    const clubId = await seedClub('Ikoyi Rovers FC');
    await join(accessToken, clubId);

    const res = await setRepresented(accessToken, userId, clubId).expect(200);

    expect(res.body).toEqual({ representedClub: { id: clubId, name: 'Ikoyi Rovers FC' } });
    expect((await getProfile(accessToken, userId)).representedClub).toEqual({ id: clubId, name: 'Ikoyi Rovers FC' });
  });

  it('rejects a club the caller has not joined with 400, and leaves the stored value untouched', async () => {
    const { userId, accessToken } = await createUser('not-member');
    const clubId = await seedClub('Surulere United');

    await setRepresented(accessToken, userId, clubId).expect(400);

    expect((await getProfile(accessToken, userId)).representedClub).toBeNull();
  });

  it('a non-existent club id is a 400, not a 404', async () => {
    const { userId, accessToken } = await createUser('ghost');

    await setRepresented(accessToken, userId, '22222222-2222-4222-8222-222222222222').expect(400);
  });

  it('null unrepresents the club', async () => {
    const { userId, accessToken } = await createUser('unrepresent');
    const clubId = await seedClub('Port Harcourt Blues');
    await join(accessToken, clubId);
    await setRepresented(accessToken, userId, clubId).expect(200);

    const res = await setRepresented(accessToken, userId, null).expect(200);

    expect(res.body).toEqual({ representedClub: null });
    expect((await getProfile(accessToken, userId)).representedClub).toBeNull();
  });

  it('403s when another user tries to set someone else\'s represented club', async () => {
    const owner = await createUser('owner');
    const intruder = await createUser('intruder');
    const clubId = await seedClub('Lagos Dynamos');
    await join(owner.accessToken, clubId);

    await setRepresented(intruder.accessToken, owner.userId, clubId).expect(403);

    expect((await getProfile(owner.accessToken, owner.userId)).representedClub).toBeNull();
  });

  it('leaving the club you represent clears the representation in the same request', async () => {
    const { userId, accessToken } = await createUser('leaver');
    const clubId = await seedClub('Kano Pillars');
    await join(accessToken, clubId);
    await setRepresented(accessToken, userId, clubId).expect(200);

    await request(app.getHttpServer()).delete(`/clubs/${clubId}/join`).set('Authorization', `Bearer ${accessToken}`).expect(200);

    expect((await getProfile(accessToken, userId)).representedClub).toBeNull();
  });

  it('leaving a DIFFERENT club does not clear the represented one', async () => {
    const { userId, accessToken } = await createUser('bystander');
    const represented = await seedClub('Enugu Rangers');
    const other = await seedClub('Warri Wolves');
    await join(accessToken, represented);
    await join(accessToken, other);
    await setRepresented(accessToken, userId, represented).expect(200);

    await request(app.getHttpServer()).delete(`/clubs/${other}/join`).set('Authorization', `Bearer ${accessToken}`).expect(200);

    expect((await getProfile(accessToken, userId)).representedClub).toEqual({ id: represented, name: 'Enugu Rangers' });
  });

  it('deleting the ClubPage row itself nulls the FK (ON DELETE SET NULL), it does not block or dangle', async () => {
    const { userId, accessToken } = await createUser('orphaned');
    const clubId = await seedClub('Abuja Eagles');
    await join(accessToken, clubId);
    await setRepresented(accessToken, userId, clubId).expect(200);

    // Real hard delete of the club. Membership rows cascade via the
    // implicit join table; the representedClubId FK must null, not
    // reject the delete.
    await getTestPrismaClient().clubPage.delete({ where: { id: clubId } });

    const row = await getTestPrismaClient().user.findUnique({ where: { id: userId }, select: { representedClubId: true } });
    expect(row?.representedClubId).toBeNull();
  });
});
