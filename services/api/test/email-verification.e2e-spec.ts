import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { EmailVerificationTokenStore } from '../src/modules/auth/registration/email-verification/email-verification-token.store';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-020 (Decision Log #367): email verification is required before the profile
// can be completed. EmailVerifiedGuard re-reads verificationStatus from
// Postgres on every request -- so verifying takes effect on the SAME access
// token, with no re-login -- and is applied to PATCH /users/:id only.
describe('Email-verification enforcement e2e (B-020)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  async function createUser(verificationStatus: 'verified' | 'unverified') {
    const prisma = getTestPrismaClient();
    const user = await prisma.user.create({
      data: {
        email: `e2e-verify-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
        passwordHash: 'unused',
        displayName: 'Vera Fied',
        dateOfBirth: seedDob('1995-05-05'),
        isMinor: false,
        verificationStatus,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  const patchName = (u: { id: string; auth: Record<string, string> }, displayName: string) =>
    request(app.getHttpServer()).patch(`/users/${u.id}`).set(u.auth).send({ displayName });

  it('an UNVERIFIED user cannot complete their profile: 403 with a machine-readable code, nothing written', async () => {
    const u = await createUser('unverified');
    const res = await patchName(u, 'New Name').expect(403);
    expect(res.body).toMatchObject({ statusCode: 403, code: 'email_verification_required' });
    expect((await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } })).displayName).toBe('Vera Fied');
  });

  it('a VERIFIED user can', async () => {
    const u = await createUser('verified');
    await patchName(u, 'New Name').expect(200);
    expect((await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: u.id } })).displayName).toBe('New Name');
  });

  it('verifying the email unblocks the SAME access token (status is read fresh, not trusted from the token)', async () => {
    const u = await createUser('unverified');
    await patchName(u, 'Blocked').expect(403);

    const token = await app.get(EmailVerificationTokenStore, { strict: false }).issue(u.id);
    await request(app.getHttpServer()).post('/auth/verify-email').send({ token }).expect(200);

    await patchName(u, 'Unblocked').expect(200);
  });

  it('an unverified user can still READ their own profile (to see why they are blocked)', async () => {
    const u = await createUser('unverified');
    const res = await request(app.getHttpServer()).get(`/users/${u.id}`).set(u.auth).expect(200);
    expect(res.body.verificationStatus).toBe('unverified');
  });

  it('the guard sits after JwtAuthGuard: no token is still 401, not 403', async () => {
    const u = await createUser('unverified');
    await request(app.getHttpServer()).patch(`/users/${u.id}`).send({ displayName: 'x' }).expect(401);
  });

  // B-118 (Decision Log #403 item 15) extended this guard from PATCH /users/:id to
  // the social writes. Represented club is a profile write, so it is covered now.
  it('is applied to the other profile/social writes too (represented club, follow) but NOT to reads', async () => {
    const u = await createUser('unverified');
    const other = await createUser('verified');
    const club = await request(app.getHttpServer())
      .patch(`/users/${u.id}/represented-club`)
      .set(u.auth)
      .send({ clubId: '00000000-0000-4000-8000-000000000000' })
      .expect(403);
    expect(club.body.code).toBe('email_verification_required');

    const follow = await request(app.getHttpServer()).post(`/users/${other.id}/follow`).set(u.auth).expect(403);
    expect(follow.body.code).toBe('email_verification_required');

    // The unverified user can still read who they are and why they are blocked.
    await request(app.getHttpServer()).get(`/users/${u.id}`).set(u.auth).expect(200);
  });
});
