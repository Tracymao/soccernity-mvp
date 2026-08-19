import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// ---------------------------------------------------------------------
// GAP FOUND WHILE BUILDING THIS SPEC (flagged, not silently worked
// around): this file's brief asked for a register -> login -> GET
// /auth/me round trip. GET /auth/me (Build Plan Section 4.1) does not
// exist anywhere in this codebase — confirmed by grep across
// services/api/src; every mention of it (auth/README.md, users/README.md,
// users.controller.ts's own header comment) is a note that it's "a
// separate B2-B4 endpoint... not covered here," and it was never actually
// built by any of those PRs either. Building it here would be scope creep
// for an e2e-infrastructure PR (Section 4.1 endpoint work belongs to
// backend-api, not this one), so this spec substitutes the third leg with
// GET /users/:id (self-scoped, Section 4.2, genuinely built) — it exercises
// the exact same real chain GET /auth/me would (bearer token ->
// JwtAuthGuard -> TokenService.verifyAccessToken -> a fresh Prisma read of
// the authenticated user), just via a different, already-real route. This
// is a Decision Log / backlog candidate: build GET /auth/me for real, and
// either point this spec at it or add a sibling test alongside this one.
// ---------------------------------------------------------------------

describe('Auth e2e: register -> login -> GET /users/:id (real Postgres, no mocked PrismaService)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same global pipe main.ts applies in the real bootstrap — see
    // src/main.ts. Not overriding PrismaService, any guard, or any
    // provider anywhere in this TestingModule: this is the real DI graph.
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
    return `e2e-auth-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  }

  it('registers an adult (no guardian branch), logs in, and fetches their own profile via GET /users/:id', async () => {
    const email = uniqueEmail();
    const password = 'a-real-password-123';

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password,
        displayName: 'E2E Test Player',
        // 25 years old — comfortably an adult, avoids the guardian-consent
        // branch entirely (registration.service.ts's isMinor/dto.guardian
        // check) so this spec stays focused on the plain register/login/
        // fetch round trip.
        dateOfBirth: '2000-01-01',
      })
      .expect(201);

    expect(registerResponse.body.user.email).toBe(email.toLowerCase());
    expect(registerResponse.body.user).not.toHaveProperty('passwordHash');
    // NOTE (found while building this spec, not silently worked around):
    // POST /auth/register's response nests the access token as
    // `{ token, expiresIn }` (registration.controller.ts's
    // toRegisterResponse spreads TokenPair.accessToken directly), whereas
    // POST /auth/login's response (auth-response.mapper.ts's
    // toTokenPairResponse, used below) flattens it to a bare
    // `accessToken: string` + separate `accessTokenExpiresIn`. Two
    // genuinely different response shapes for conceptually the same
    // "here is your token pair" payload — a real API-contract
    // inconsistency this e2e spec surfaced by exercising both endpoints
    // together, not a bug this PR's scope extends to fixing. Flagged in
    // the PR report as a Decision Log candidate for whoever next touches
    // either endpoint.
    expect(registerResponse.body.accessToken.token).toEqual(expect.any(String));
    const userId = registerResponse.body.user.id;

    // Prove real argon2id hashing genuinely happened against a real
    // Postgres row — not asserted indirectly via a mock ever having been
    // called with the right arguments, but by reading the actual stored
    // value back out of the database.
    const prisma = getTestPrismaClient();
    const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(storedUser.passwordHash).not.toBe(password);
    expect(storedUser.passwordHash.startsWith('$argon2id$')).toBe(true);

    // A real unique-email constraint violation must surface as a 4xx
    // (ConflictException -> 409), not a raw, unhandled Postgres error
    // turning into a 500 — this can only be proven against a real
    // database; a mocked PrismaService can't violate a real constraint.
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'a-different-password-456',
        displayName: 'Duplicate Attempt',
        dateOfBirth: '1999-06-15',
      })
      .expect(409);

    // Login with the exact credentials just registered.
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    const accessToken = loginResponse.body.accessToken as string;

    // Fetch the authenticated user's own profile through the real
    // JwtAuthGuard -> TokenService.verifyAccessToken chain (see the GAP
    // FOUND note at the top of this file for why this is GET /users/:id,
    // not GET /auth/me).
    const profileResponse = await request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(profileResponse.body.id).toBe(userId);
    expect(profileResponse.body.email).toBe(email.toLowerCase());
    expect(profileResponse.body).not.toHaveProperty('passwordHash');

    // No bearer token at all -> real JwtAuthGuard rejection, not a mocked
    // guard bypass (contrast with users.controller.http.spec.ts, which
    // overrides JwtAuthGuard entirely).
    await request(app.getHttpServer()).get(`/users/${userId}`).expect(401);
  });

  it('rejects login with a wrong password against a real stored hash, with a generic 401', async () => {
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email,
        password: 'the-real-password-123',
        displayName: 'Wrong Password Test',
        dateOfBirth: '1995-03-20',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'totally-the-wrong-password' })
      .expect(401);

    // Generic message, per auth.service.ts's non-negotiable: never reveal
    // whether the email or the password was the wrong part.
    expect(response.body.message).toBe('Invalid credentials');
  });
});
