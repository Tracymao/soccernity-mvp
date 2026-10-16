import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { SUMMARY_REJECTION_MESSAGE } from '../src/modules/auth/guardian-consent/guardian-consent-summary.service';
import { applyTrustProxy } from '../src/trust-proxy';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-021 (Decision Log #372) against real Postgres: GET
// /auth/guardian-consent/request-summary returns the minor's name, decrypted
// date of birth, "named as" and request date to the unauthenticated token
// holder -- and the SAME response for unknown, expired, used, declined and
// otherwise ineligible tokens. The decryption and the encrypted column are the
// parts a mock cannot prove.
//
// Each request carries its own X-Forwarded-For (the app trusts one proxy hop
// here, as production will) so the shared 5/min auth throttle is per request.
describe('Guardian consent request summary e2e (B-021)', () => {
  let app: INestApplication;
  let ipCounter = 0;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    applyTrustProxy(app, '1');
    await app.init();
  });
  beforeEach(async () => resetDatabase());
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const get = (token?: string, query = '') => {
    const req = request(app.getHttpServer())
      .get(`/auth/guardian-consent/request-summary${query}`)
      .set('X-Forwarded-For', `198.18.7.${(ipCounter += 1)}`);
    return token === undefined ? req : req.set('X-Consent-Token', token);
  };

  async function seed(label: string, opts: { guardian?: Record<string, unknown>; user?: Record<string, unknown> } = {}) {
    const prisma = getTestPrismaClient();
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const consentToken = `consent-${label}-${suffix}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-summary-${label}-${suffix}@example.com`,
        passwordHash: 'unused',
        displayName: 'Ada Minor',
        dateOfBirth: seedDob('2015-03-09'),
        isMinor: true,
        ...opts.user,
      },
    });
    await prisma.guardian.create({
      data: {
        minorUserId: user.id,
        name: 'Grace Parent',
        email: `g-${suffix}@example.com`,
        relationship: 'Parent',
        consentToken,
        consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
        ...opts.guardian,
      },
    });
    return { userId: user.id, consentToken, createdAt: user.createdAt };
  }

  it('returns the summary for a live request, with the date of birth decrypted server-side', async () => {
    const { consentToken, createdAt } = await seed('live');
    const res = await get(consentToken).expect(200);
    expect(res.body).toEqual({
      minorName: 'Ada Minor',
      dateOfBirth: '2015-03-09',
      guardianName: 'Grace Parent',
      guardianRelationship: 'Parent',
      requestedAt: createdAt.toISOString(),
      notices: { guardianEmailShownOnMinorProfile: true, photoAndUsernameVisibleToOthers: true },
    });
  });

  it('never exposes the stored ciphertext, the guardian email or the token', async () => {
    const { consentToken, userId } = await seed('leak');
    const stored = (await getTestPrismaClient().user.findUniqueOrThrow({ where: { id: userId } })).dateOfBirth!;
    const text = (await get(consentToken).expect(200)).text;
    expect(text).not.toContain(stored);
    expect(text).not.toContain(consentToken);
    expect(text).not.toMatch(/@example\.com/);
  });

  it('is uncacheable', async () => {
    const { consentToken } = await seed('cache');
    const res = await get(consentToken).expect(200);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['pragma']).toBe('no-cache');
  });

  describe('every ineligible token gets the IDENTICAL rejection (non-enumerating)', () => {
    async function rejection(token?: string) {
      const res = await get(token).expect(400);
      return { body: res.body, cacheControl: res.headers['cache-control'] };
    }

    it('unknown, expired, confirmed, declined, rotated-away, deactivated, adult and missing all look the same', async () => {
      const expired = await seed('expired', { guardian: { consentTokenExpiresAt: new Date(Date.now() - 1000) } });
      const confirmed = await seed('confirmed', { guardian: { consentStatus: 'confirmed', consentTimestamp: new Date() } });
      const declined = await seed('declined', { guardian: { consentStatus: 'declined' } });
      const pendingDeletion = await seed('deleting', { user: { accountStatus: 'pending_deletion' } });
      const adult = await seed('adult', { user: { isMinor: false } });
      const anonymised = await seed('anon', { user: { dateOfBirth: null } });

      const outcomes = [
        await rejection('no-such-token'),
        await rejection(expired.consentToken),
        await rejection(confirmed.consentToken),
        await rejection(declined.consentToken),
        await rejection(pendingDeletion.consentToken),
        await rejection(adult.consentToken),
        await rejection(anonymised.consentToken),
        await rejection(undefined),
        await rejection(''),
      ];

      for (const o of outcomes) {
        expect(o.body).toEqual({ statusCode: 400, message: SUMMARY_REJECTION_MESSAGE, error: 'Bad Request' });
        expect(o.cacheControl).toMatch(/no-store/);
      }
      // byte-identical across every case
      expect(new Set(outcomes.map((o) => JSON.stringify(o.body))).size).toBe(1);
    });

    it('a token replaced by a re-send stops working', async () => {
      const { consentToken, userId } = await seed('rotated');
      await get(consentToken).expect(200);
      await getTestPrismaClient().guardian.update({ where: { minorUserId: userId }, data: { consentToken: 'rotated-new-token' } });
      await get(consentToken).expect(400);
      await get('rotated-new-token').expect(200);
    });

    it('the token is accepted only from the header, never from the URL', async () => {
      const { consentToken } = await seed('query');
      await get(undefined, `?token=${consentToken}`).expect(400);
      await get(undefined, `?consentToken=${consentToken}`).expect(400);
    });
  });

  it('does not change anything: the request is still pending afterwards', async () => {
    const { consentToken, userId } = await seed('readonly');
    await get(consentToken).expect(200);
    await get(consentToken).expect(200);
    const g = await getTestPrismaClient().guardian.findUniqueOrThrow({ where: { minorUserId: userId } });
    expect(g.consentStatus).toBe('pending');
    expect(g.consentTimestamp).toBeNull();
  });

  it('is rate limited per client address', async () => {
    const { consentToken } = await seed('limit');
    const ip = '198.18.8.8';
    const hit = () => request(app.getHttpServer()).get('/auth/guardian-consent/request-summary').set('X-Forwarded-For', ip).set('X-Consent-Token', consentToken);
    // The limit comes from AUTH_RATE_LIMIT_MAX (default 5); don't hard-code it.
    let ok = 0;
    let limited = false;
    for (let i = 0; i < 40 && !limited; i += 1) {
      const res = await hit();
      if (res.status === 429) limited = true;
      else {
        expect(res.status).toBe(200);
        ok += 1;
      }
    }
    expect(limited).toBe(true);
    expect(ok).toBeGreaterThan(0);
  });
});
