import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b291-suspension-on-report (B-291, Decision Log #485), against REAL Postgres. Recording user_suspended on a
// report suspends the account behind the target in the same step; sessions are revoked, sign-in is refused, the
// report is stored as the cause, and an overturned appeal on THAT report reinstates the account and clears the link.
describe('Suspension on a report e2e (b291-suspension-on-report)', () => {
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

  const rand = () => Math.random().toString(36).slice(2);
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const PASSWORD = 'the-real-password';

  async function createUser(label: string) {
    const prisma = getTestPrismaClient();
    const passwordHash = await app.get(PasswordService).hash(PASSWORD);
    const user = await prisma.user.create({
      data: {
        email: `e2e-b291-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash,
        displayName: `Real Name ${label}`,
        username: `s_${label}_${rand().slice(0, 5)}`,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken, refreshToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, email: user.email, accessToken: accessToken.token, refreshToken: refreshToken.token };
  }

  async function createAdmin(label: string) {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-b291-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Suspension Admin ${label}`,
        role: 'moderator',
        childSafetyVetted: true,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  const fileReport = (token: string, targetType: string, targetId: string, over: Record<string, unknown> = {}) =>
    request(server())
      .post('/reports')
      .set(auth(token))
      .send({ targetType, targetId, reasonCategory: 'spam_or_scam', ...over });

  const action = (adminToken: string, reportId: string, act: string) =>
    request(server()).patch(`/admin/moderation/reports/${reportId}`).set(auth(adminToken)).send({ action: act });

  it('suspends the account in the same step, revokes sessions, refuses sign-in, then an overturned appeal reinstates it', async () => {
    const prisma = getTestPrismaClient();
    const reporter = await createUser('reporter');
    const target = await createUser('target');
    const mod1 = await createAdmin('one');
    const mod2 = await createAdmin('two');

    const report = (await fileReport(reporter.accessToken, 'user', target.userId).expect(201)).body;
    const res = await action(mod1.accessToken, report.id, 'user_suspended').expect(200);
    expect(res.body).toMatchObject({ status: 'actioned', actionTaken: 'user_suspended' });

    // the account is suspended and the report is stored as the cause
    const suspended = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(suspended.accountStatus).toBe('suspended');
    expect(suspended.suspendedByReportId).toBe(report.id);

    // sessions are revoked (the refresh token no longer works) and sign-in is refused
    await request(server()).post('/auth/refresh').send({ refreshToken: target.refreshToken }).expect(401);
    const login = await request(server()).post('/auth/login').send({ email: target.email, password: PASSWORD }).expect(401);
    expect(login.body.message).toMatch(/invalid credentials/i);

    // the suspended person can appeal (appeal routes need only a signed-in token)
    await request(server()).post(`/reports/${report.id}/appeal`).set(auth(target.accessToken)).send({ reason: 'this was a mistake' }).expect(201);

    // a second moderator overturns it: active again, link cleared, sign-in works
    await request(server())
      .patch(`/admin/moderation/reports/${report.id}/appeal`)
      .set(auth(mod2.accessToken))
      .send({ decision: 'overturned' })
      .expect(200);

    const restored = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(restored.accountStatus).toBe('active');
    expect(restored.suspendedByReportId).toBeNull();
    await request(server()).post('/auth/login').send({ email: target.email, password: PASSWORD }).expect(200);
  });

  it('a post report suspends the post author; an upheld appeal changes nothing', async () => {
    const prisma = getTestPrismaClient();
    const reporter = await createUser('reporter2');
    const author = await createUser('author2');
    const mod1 = await createAdmin('three');
    const mod2 = await createAdmin('four');
    const post = await prisma.post.create({ data: { authorId: author.userId, contentText: 'b291 post' } });

    const report = (await fileReport(reporter.accessToken, 'post', post.id).expect(201)).body;
    await action(mod1.accessToken, report.id, 'user_suspended').expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: author.userId } })).accountStatus).toBe('suspended');

    await request(server()).post(`/reports/${report.id}/appeal`).set(auth(author.accessToken)).send({ reason: 'please look again' }).expect(201);
    await request(server()).patch(`/admin/moderation/reports/${report.id}/appeal`).set(auth(mod2.accessToken)).send({ decision: 'upheld' }).expect(200);

    const still = await prisma.user.findUniqueOrThrow({ where: { id: author.userId } });
    expect(still.accountStatus).toBe('suspended');
    expect(still.suspendedByReportId).toBe(report.id);
  });

  it('refuses user_suspended on a target that has no account behind it (a banter room) with the stable code', async () => {
    const prisma = getTestPrismaClient();
    const reporter = await createUser('reporter3');
    const mod1 = await createAdmin('five');
    const room = await prisma.banterRoom.create({ data: { name: 'b291 room', scopeType: 'topic', createdBy: reporter.userId } });

    const report = (await fileReport(reporter.accessToken, 'banter_room', room.id).expect(201)).body;
    const res = await action(mod1.accessToken, report.id, 'user_suspended').expect(400);
    expect(res.body.code).toBe('user_suspension_not_applicable');
  });

  it('PATCH /admin/users/:id needs a reason category for a suspension and a manual reinstatement clears the link', async () => {
    const prisma = getTestPrismaClient();
    const reporter = await createUser('reporter4');
    const target = await createUser('target4');
    const mod1 = await createAdmin('six');

    const missing = await request(server())
      .patch(`/admin/users/${target.userId}`)
      .set(auth(mod1.accessToken))
      .send({ status: 'suspended' })
      .expect(400);
    expect(missing.body.code).toBe('suspension_reason_category_required');

    const report = (await fileReport(reporter.accessToken, 'user', target.userId).expect(201)).body;
    await action(mod1.accessToken, report.id, 'user_suspended').expect(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.userId } })).suspendedByReportId).toBe(report.id);

    await request(server()).patch(`/admin/users/${target.userId}`).set(auth(mod1.accessToken)).send({ status: 'active' }).expect(200);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: target.userId } });
    expect(after.accountStatus).toBe('active');
    expect(after.suspendedByReportId).toBeNull();
  });
});
