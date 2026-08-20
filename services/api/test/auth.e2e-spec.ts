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
    // RESOLVED (was flagged here as a Decision Log candidate; now closed
    // by the sprint-2/auth-response-shape-reconciliation PR): POST
    // /auth/register's response now returns the token pair in the same
    // flat shape POST /auth/login always has (auth-response.mapper.ts's
    // toTokenPairResponse), not the old nested `accessToken: { token,
    // expiresIn }`. See auth/README.md for the final, shared shape.
    expect(registerResponse.body.accessToken).toEqual(expect.any(String));
    expect(registerResponse.body.accessTokenExpiresIn).toEqual(expect.any(Number));
    expect(registerResponse.body.refreshToken).toEqual(expect.any(String));
    // Register's response also carries the same `user` summary shape
    // login's response does (id, email, phone, displayName, dateOfBirth,
    // isMinor, role, verificationStatus, createdAt) via the shared
    // toAuthUserSummary() — spot-check a couple of fields beyond email
    // above.
    expect(registerResponse.body.user.isMinor).toBe(false);
    expect(registerResponse.body.user.verificationStatus).toEqual(expect.any(String));
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

    // POST /auth/login's response now also carries a `user` object (this
    // PR's second change) -- prove it's a real, correctly-populated
    // snapshot of the just-authenticated user, not just that the response
    // compiles against the new type.
    expect(loginResponse.body.user.id).toBe(userId);
    expect(loginResponse.body.user.email).toBe(email.toLowerCase());
    expect(loginResponse.body.user.isMinor).toBe(false);
    expect(loginResponse.body.user.verificationStatus).toEqual(expect.any(String));
    expect(loginResponse.body.user).not.toHaveProperty('passwordHash');

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
