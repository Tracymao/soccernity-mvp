import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// safeguarding/guardian-email-change-endpoint (Decision Log #60 / #365).
// Real Postgres + the real JwtAuthGuard: a minor changes the guardian email
// while consent is pending, the flow restarts against the new address, the
// OLD emailed link genuinely stops working, and an already-confirmed
// consent is left untouched. The mocked specs cannot prove the @unique
// token overwrite or the optimistic-lock updateMany against a real engine.
describe('Guardian email change e2e (real Postgres)', () => {
  let app: INestApplication;
  let sendSpy: jest.SpyInstance;
  let replacedSpy: jest.SpyInstance;
  const priorRateLimit = process.env.AUTH_RATE_LIMIT_MAX;

  beforeAll(async () => {
    // This file makes ~10 calls to a route carrying @AuthRateLimit(), well
    // over the shared 'auth' bucket's default 5/60s. The env var is honoured
    // since sprint-2/fix-auth-rate-limit-config-wiring; set for this file
    // only and restored in afterAll. Rate-limit enforcement itself is not
    // under test here.
    process.env.AUTH_RATE_LIMIT_MAX = '1000';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    sendSpy = jest.spyOn(RegistrationEmailService.prototype, 'sendGuardianConsentEmail').mockResolvedValue(undefined);
    replacedSpy = jest
      .spyOn(RegistrationEmailService.prototype, 'sendGuardianEmailReplacedEmail')
      .mockResolvedValue(undefined);
  });
  afterEach(() => {
    sendSpy.mockRestore();
    replacedSpy.mockRestore();
  });
  afterAll(async () => {
    if (priorRateLimit === undefined) delete process.env.AUTH_RATE_LIMIT_MAX;
    else process.env.AUTH_RATE_LIMIT_MAX = priorRateLimit;
    await app.close();
    await disconnectTestPrismaClient();
  });

  async function seedMinor(over: { consentStatus?: string; consentTimestamp?: Date | null } = {}) {
    const prisma = getTestPrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-minor-${suffix}@example.com`,
        passwordHash: 'unused',
        displayName: 'E2E Minor',
        dateOfBirth: seedDob('2014-01-01'),
        isMinor: true,
      },
    });
    const guardian = await prisma.guardian.create({
      data: {
        minorUserId: user.id,
        name: 'Old Guardian',
        email: `old-${suffix}@example.com`,
        relationship: 'Parent',
        consentToken: `old-token-${suffix}`,
        consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        consentAutoResentAt: new Date(Date.now() - 3600 * 1000),
        ...(over.consentStatus ? { consentStatus: over.consentStatus } : {}),
        ...(over.consentTimestamp !== undefined ? { consentTimestamp: over.consentTimestamp } : {}),
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { user, guardian, token: accessToken.token, suffix };
  }

  const change = (token: string, email: string, over: { name?: string; relationship?: string } = {}) =>
    request(app.getHttpServer())
      .post('/auth/guardian-consent/change-guardian-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Guardian', relationship: 'Legal Guardian', email, ...over });

  it('restarts the flow: new email + new token on the same pending row, auto-resend budget reset, request sent to the new address', async () => {
    const prisma = getTestPrismaClient();
    const { user, guardian, token, suffix } = await seedMinor();
    const newEmail = `new-${suffix}@example.com`;

    await change(token, newEmail).expect(200);

    const after = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    expect(after?.id).toBe(guardian.id);
    expect(after?.email).toBe(newEmail);
    expect(after?.name).toBe('New Guardian');
    expect(after?.relationship).toBe('Legal Guardian');
    expect(after?.consentStatus).toBe('pending');
    expect(after?.consentTimestamp).toBeNull();
    expect(after?.consentToken).not.toBe(guardian.consentToken);
    expect(after?.consentAutoResentAt).toBeNull();
    expect(after!.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(newEmail, after!.consentToken, 'E2E Minor');
    // ...and the PREVIOUS address is told its request was withdrawn.
    expect(replacedSpy).toHaveBeenCalledTimes(1);
    expect(replacedSpy).toHaveBeenCalledWith(guardian.email, 'E2E Minor');
  });

  it('the OLD emailed link stops working, and the NEW one confirms consent', async () => {
    const prisma = getTestPrismaClient();
    const { user, guardian, token, suffix } = await seedMinor();

    await change(token, `new-${suffix}@example.com`).expect(200);
    const after = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });

    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .send({ consentToken: guardian.consentToken })
      .expect(400);
    expect((await prisma.guardian.findUnique({ where: { minorUserId: user.id } }))?.consentStatus).toBe('pending');

    await request(app.getHttpServer())
      .post('/auth/guardian-consent')
      .send({ consentToken: after!.consentToken })
      .expect(200);
    expect((await prisma.guardian.findUnique({ where: { minorUserId: user.id } }))?.consentStatus).toBe('confirmed');
  });

  it('does not touch an already-APPROVED consent: 409, row byte-identical, nothing sent', async () => {
    const prisma = getTestPrismaClient();
    const confirmedAt = new Date(Date.now() - 3600 * 1000);
    const { user, token, suffix } = await seedMinor({ consentStatus: 'confirmed', consentTimestamp: confirmedAt });
    const before = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });

    await change(token, `new-${suffix}@example.com`).expect(409);

    const after = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    expect(after).toEqual(before);
    expect(after?.consentStatus).toBe('confirmed');
    expect(sendSpy).not.toHaveBeenCalled();
    expect(replacedSpy).not.toHaveBeenCalled();
  });

  it('is refused for a declined request, for the minor\'s own email, for the email already on file, and without a token', async () => {
    const prisma = getTestPrismaClient();
    const { user, guardian, token } = await seedMinor();

    await change(token, user.email).expect(400);
    await change(token, guardian.email).expect(400);
    await request(app.getHttpServer())
      .post('/auth/guardian-consent/change-guardian-email')
      .send({ name: 'X', relationship: 'Parent', email: 'x@example.com' })
      .expect(401);
    expect((await prisma.guardian.findUnique({ where: { minorUserId: user.id } }))?.consentToken).toBe(
      guardian.consentToken,
    );

    await prisma.guardian.update({ where: { id: guardian.id }, data: { consentStatus: 'declined' } });
    await change(token, 'someone-else@example.com').expect(409);
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('rejects an invalid or missing relationship/name with 400 and changes nothing', async () => {
    const prisma = getTestPrismaClient();
    const { user, guardian, token, suffix } = await seedMinor();

    await change(token, `new-${suffix}@example.com`, { relationship: 'Neighbour' }).expect(400);
    await change(token, `new-${suffix}@example.com`, { name: '' }).expect(400);
    const after = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    expect(after?.email).toBe(guardian.email);
    expect(after?.name).toBe('Old Guardian');
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('per-minor cap: the 6th successful change in the window is 429 and sends nothing; refusals do not burn budget', async () => {
    const prisma = getTestPrismaClient();
    const { user, token, suffix } = await seedMinor();

    // A refusal (same email as the minor's own) must not count against the cap.
    await change(token, user.email).expect(400);

    for (let i = 1; i <= 5; i++) {
      await change(token, `cap-${i}-${suffix}@example.com`).expect(200);
    }
    expect(sendSpy).toHaveBeenCalledTimes(5);

    await change(token, `cap-6-${suffix}@example.com`).expect(429);
    expect(sendSpy).toHaveBeenCalledTimes(5);
    expect(replacedSpy).toHaveBeenCalledTimes(5);
    const after = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    expect(after?.email).toBe(`cap-5-${suffix}@example.com`);

    // Another minor is unaffected.
    const other = await seedMinor();
    await change(other.token, `other-${suffix}@example.com`).expect(200);
  });

  it('two concurrent changes never leave a send for an address that is not the one stored (optimistic lock)', async () => {
    const prisma = getTestPrismaClient();
    const { user, token, suffix } = await seedMinor();

    const results = await Promise.all([
      change(token, `race-a-${suffix}@example.com`),
      change(token, `race-b-${suffix}@example.com`),
    ]);

    // Either both serialise (200 then a second 200 against the new token)
    // or one loses the guarded write (409). What must never happen is a
    // send for an address that is not the one finally stored.
    const final = await prisma.guardian.findUnique({ where: { minorUserId: user.id } });
    expect([`race-a-${suffix}@example.com`, `race-b-${suffix}@example.com`]).toContain(final?.email);
    const sentToFinal = sendSpy.mock.calls.filter(([to, tok]) => to === final?.email && tok === final?.consentToken);
    expect(sentToFinal).toHaveLength(1);
    expect(results.map((r) => r.status).every((s) => s === 200 || s === 409)).toBe(true);
  });
});
