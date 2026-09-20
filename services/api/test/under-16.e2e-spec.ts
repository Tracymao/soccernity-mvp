import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-1/under-16-restrictions -- counsel's under-16 tier, against real
// Postgres: the real Under16RestrictionGuard reads User.isUnder16 fresh,
// the real GuardianConsentGuard still runs alongside it (consent is
// CONFIRMED for every minor here, proving the new block is independent of
// it), and the guardian-contact exposure is scoped to the individual
// own-profile read. Users are seeded via Prisma + a real TokenService
// token (the same pattern the messaging/banter e2e specs use).
describe('Under-16 restrictions e2e', () => {
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

  const server = () => app.getHttpServer();
  let n = 0;

  async function seed(kind: 'adult' | 'under16' | 'age16to17') {
    const prisma = getTestPrismaClient();
    n += 1;
    const minor = kind !== 'adult';
    const dob = kind === 'adult' ? '1993-03-03' : kind === 'under16' ? '2014-01-01' : '2009-01-01';
    const user = await prisma.user.create({
      data: {
        email: `e2e-u16-${kind}-${n}-${Date.now()}@example.com`,
        passwordHash: 'unused',
        displayName: `U16 ${kind} ${n}`,
        dateOfBirth: new Date(dob),
        isMinor: minor,
        isUnder16: kind === 'under16',
        ...(minor && {
          guardian: {
            create: {
              name: 'Guardian',
              email: `guardian-${n}@example.com`,
              relationship: 'Parent',
              consentStatus: 'confirmed',
              consentToken: `tok-${n}-${Date.now()}`,
              consentTokenExpiresAt: new Date(Date.now() + 86_400_000),
            },
          },
        }),
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, token: accessToken.token };
  }
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  it('messaging: an under-16 cannot start, and cannot be messaged (indistinguishable 404, DL #351)', async () => {
    const adult = await seed('adult');
    const kid = await seed('under16');
    const teen = await seed('age16to17');

    const sent = await request(server())
      .post('/conversations')
      .set(auth(kid.token))
      .send({ recipientId: adult.id });
    expect(sent.status).toBe(403);
    expect(sent.body.code).toBe('under_16_restricted');

    const received = await request(server())
      .post('/conversations')
      .set(auth(adult.token))
      .send({ recipientId: kid.id });
    // DL #351: recipient side is the same 404 as a non-existent user.
    const missing = await request(server())
      .post('/conversations')
      .set(auth(adult.token))
      .send({ recipientId: '00000000-0000-4000-8000-000000000000' });
    expect(received.status).toBe(404);
    expect(received.body).toEqual(missing.body);

    // Another minor, too.
    const fromTeen = await request(server())
      .post('/conversations')
      .set(auth(teen.token))
      .send({ recipientId: kid.id });
    expect(fromTeen.status).toBe(403);

    // 16-17 unaffected (a separate, later control -- untouched here).
    const ok = await request(server())
      .post('/conversations')
      .set(auth(teen.token))
      .send({ recipientId: adult.id });
    expect([200, 201]).toContain(ok.status);
    expect(await getTestPrismaClient().conversation.count()).toBe(1);
  });

  it('bants: fully disabled for an under-16 (reads, join, create, post) but not for a 16-17', async () => {
    const adult = await seed('adult');
    const kid = await seed('under16');
    const teen = await seed('age16to17');
    const room = await request(server())
      .post('/banter-rooms')
      .set(auth(adult.token))
      .send({ name: 'Room', scopeType: 'topic' });
    expect(room.status).toBe(201);
    const id = room.body.id;

    const calls = [
      () => request(server()).get('/banter-rooms').set(auth(kid.token)),
      () => request(server()).get(`/banter-rooms/${id}`).set(auth(kid.token)),
      () => request(server()).post(`/banter-rooms/${id}/join`).set(auth(kid.token)),
      () =>
        request(server())
          .post('/banter-rooms')
          .set(auth(kid.token))
          .send({ name: 'X', scopeType: 'topic' }),
      () =>
        request(server())
          .post(`/banter-rooms/${id}/posts`)
          .set(auth(kid.token))
          .send({ contentText: 'hi' }),
    ];
    for (const call of calls) {
      const res = await call();
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('under_16_restricted');
    }
    const teenJoin = await request(server()).post(`/banter-rooms/${id}/join`).set(auth(teen.token));
    expect(teenJoin.status).toBe(200);
  });

  it('community groups: under-16 is read-only (cannot create), can read and join', async () => {
    const adult = await seed('adult');
    const kid = await seed('under16');
    const created = await request(server())
      .post('/community-groups')
      .set(auth(kid.token))
      .send({ name: 'Kids', city: 'Lagos' });
    expect(created.status).toBe(403);
    expect(created.body.code).toBe('under_16_restricted');

    const g = await request(server())
      .post('/community-groups')
      .set(auth(adult.token))
      .send({ name: 'Adults', city: 'Lagos' });
    expect(g.status).toBe(201);
    expect((await request(server()).get('/community-groups').set(auth(kid.token))).status).toBe(200);
    expect(
      (await request(server()).get(`/community-groups/${g.body.id}`).set(auth(kid.token))).status,
    ).toBe(200);
    expect(
      (await request(server()).post(`/community-groups/${g.body.id}/join`).set(auth(kid.token))).status,
    ).toBe(200);
  });

  it('guardian contact: only on an under-16 own profile, labelled, never in a roster', async () => {
    const adult = await seed('adult');
    const kid = await seed('under16');
    const teen = await seed('age16to17');

    const own = await request(server()).get(`/users/${kid.id}`).set(auth(kid.token));
    expect(own.status).toBe(200);
    expect(own.body.isUnder16).toBe(true);
    expect(own.body.guardianContact).toMatchObject({ label: 'Guardian contact' });
    expect(own.body.guardianContact.email).toMatch(/^guardian-\d+@example\.com$/);
    expect(own.body.email).not.toBe(own.body.guardianContact.email);

    const teenOwn = await request(server()).get(`/users/${teen.id}`).set(auth(teen.token));
    expect(teenOwn.body.guardianContact).toBeNull();
    expect(JSON.stringify(teenOwn.body)).not.toContain('guardian-');

    // Self-only endpoint: another user cannot read it; roster shapes never carry it.
    expect((await request(server()).get(`/users/${kid.id}`).set(auth(adult.token))).status).toBe(403);
    const g = await request(server())
      .post('/community-groups')
      .set(auth(adult.token))
      .send({ name: 'G', city: 'Lagos' });
    await request(server()).post(`/community-groups/${g.body.id}/join`).set(auth(kid.token));
    const roster = await request(server())
      .get(`/community-groups/${g.body.id}/members`)
      .set(auth(adult.token));
    expect(JSON.stringify(roster.body)).not.toContain('guardian-');
  });
});
