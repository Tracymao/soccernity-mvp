import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { GuardianConsentExpirySweepService } from '../src/modules/auth/guardian-consent/guardian-consent-expiry-sweep.service';
import { GuardianConsentService } from '../src/modules/auth/guardian-consent/guardian-consent.service';
import { GuardianStaleDeclineSweepService } from '../src/modules/auth/guardian-consent/guardian-stale-decline-sweep.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-126 / B-131 (Decision Log #406 items 1 and 11) against real Postgres and
// the really-bootstrapped app.
//
// What a mock cannot show and this file does:
//   - Guardian.consentDeclinedAt (the new migration's column) is really written
//     by a real decline and really read by the status endpoint;
//   - the sweep's WHERE clause (enum-ish strings, `lt`/`lte`, the nested
//     minorUser relation filter) selects exactly the right rows on a real engine;
//   - the whole chain: decline -> 14 days -> stale-decline sweep -> new request
//     -> that request lapses -> the EXISTING expiry sweep closes the account,
//     and none of it counts as a decline.
//
// Rate limiting: decline carries @AuthRateLimit() (shared 5 requests / 60 s per
// app instance). This file makes at most two rate-limited HTTP calls per app.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PASSWORD = 'Sup3rSecret!';

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  return app;
}

interface SeedOpts {
  user?: { accountStatus?: string; isMinor?: boolean };
  guardian?: {
    name?: string;
    consentStatus?: string;
    consentDeclineSource?: string | null;
    declineCount?: number;
    consentDeclinedAt?: Date | null;
    consentTimestamp?: Date | null;
    consentAutoResentAt?: Date | null;
  };
}

async function seed(app: INestApplication, label: string, opts: SeedOpts = {}) {
  const prisma = getTestPrismaClient();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const isMinor = opts.user?.isMinor ?? true;
  const user = await prisma.user.create({
    data: {
      email: `e2e-stale-${label}-${suffix}@example.com`,
      passwordHash: await app.get(PasswordService).hash(PASSWORD),
      displayName: `E2E Stale ${label}`,
      dateOfBirth: seedDob(isMinor ? '2014-05-02' : '1990-05-02'),
      isMinor,
      isUnder16: isMinor,
      accountStatus: opts.user?.accountStatus ?? 'active',
    },
  });
  const guardian = await prisma.guardian.create({
    data: {
      minorUserId: user.id,
      name: opts.guardian?.name ?? 'Pat Guardian',
      email: `e2e-stale-guardian-${label}-${suffix}@example.com`,
      relationship: 'Parent',
      consentStatus: opts.guardian?.consentStatus ?? 'pending',
      consentDeclineSource: opts.guardian?.consentDeclineSource ?? null,
      declineCount: opts.guardian?.declineCount ?? 0,
      consentDeclinedAt: opts.guardian?.consentDeclinedAt ?? null,
      consentTimestamp: opts.guardian?.consentTimestamp ?? null,
      consentAutoResentAt: opts.guardian?.consentAutoResentAt ?? null,
      consentToken: `stale-${label}-${suffix}`,
      consentTokenExpiresAt: new Date(Date.now() + 48 * HOUR),
    },
  });
  const pair = await app.get(TokenService).issueTokenPair(user.id, user.role);
  return {
    userId: user.id,
    email: user.email,
    guardianId: guardian.id,
    consentToken: guardian.consentToken,
    accessToken: pair.accessToken.token,
  };
}

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const explicit = { consentStatus: 'declined', consentDeclineSource: 'guardian_explicit' };

describe('Stale-decline lapse e2e (B-126) and the status fields (B-131)', () => {
  let app: INestApplication;
  const prisma = () => getTestPrismaClient();
  const stale = () => app.get(GuardianStaleDeclineSweepService);
  const expiry = () => app.get(GuardianConsentExpirySweepService);

  beforeAll(async () => {
    app = await createApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  describe('the full chain', () => {
    it('declined -> 14 days -> new request + chase spent -> that request lapses -> account closed; never counted as a decline', async () => {
      const s = await seed(app, 'chain', { guardian: { name: 'Mary Jane Smith' } });
      const row = () => prisma().guardian.findUniqueOrThrow({ where: { id: s.guardianId } });
      const userRow = () => prisma().user.findUniqueOrThrow({ where: { id: s.userId } });

      // A REAL decline stamps consentDeclinedAt (rate-limited call 1).
      const before = Date.now();
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/decline')
        .send({ consentToken: s.consentToken })
        .expect(200);
      const declined = await row();
      expect(declined.consentStatus).toBe('declined');
      expect(declined.declineCount).toBe(1);
      expect(declined.consentDeclinedAt).not.toBeNull();
      expect(declined.consentDeclinedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);

      // B-131: the minor's status carries the first name and the decision time,
      // and not the counter.
      const status = await request(app.getHttpServer())
        .get('/auth/guardian-consent/status')
        .set(bearer(s.accessToken))
        .expect(200);
      expect(status.body.guardianFirstName).toBe('Mary');
      expect(new Date(status.body.lastDecisionAt).getTime()).toBe(declined.consentDeclinedAt!.getTime());
      expect(status.body.canResend).toBe(true);
      expect(JSON.stringify(status.body)).not.toMatch(/declineCount/i);

      // Inside the window: nothing happens.
      expect((await stale().sweepStaleDeclines(new Date())).chasedGuardianIds).toEqual([]);
      expect((await stale().sweepStaleDeclines(new Date(Date.now() + 13 * DAY))).chasedGuardianIds).toEqual([]);
      expect((await row()).consentStatus).toBe('declined');

      // Past the window: chased.
      const oldToken = declined.consentToken;
      const at15 = new Date(Date.now() + 15 * DAY);
      expect((await stale().sweepStaleDeclines(at15)).chasedGuardianIds).toEqual([s.guardianId]);

      const chased = await row();
      expect(chased.consentStatus).toBe('pending');
      expect(chased.consentToken).not.toBe(oldToken);
      expect(chased.consentDeclineSource).toBeNull();
      expect(chased.consentAutoResentAt).not.toBeNull(); // the one automatic chase is spent
      expect(chased.consentTokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(chased.declineCount).toBe(1); // an expiry/chase is not a decline
      expect((await userRow()).accountStatus).toBe('active');

      // The old link stopped resolving (rate-limited call 2).
      await request(app.getHttpServer())
        .post('/auth/guardian-consent/decline')
        .send({ consentToken: oldToken })
        .expect(400);

      // Re-running over the now-pending row does nothing.
      expect((await stale().sweepStaleDeclines(at15)).chasedGuardianIds).toEqual([]);

      // The new request lapses unanswered: the EXISTING sweep sees
      // consentAutoResentAt already set and goes straight to closure.
      const lapsed = new Date(Date.now() + 19 * DAY);
      const expired = await expiry().sweepExpiredConsentRequests(lapsed);
      expect(expired.autoResentGuardianIds).toEqual([]);
      expect(expired.implicitlyDeclinedGuardianIds).toEqual([s.guardianId]);

      const closed = await row();
      expect(closed.consentStatus).toBe('declined');
      expect(closed.consentDeclineSource).toBe('expiry_timeout');
      expect(closed.declineCount).toBe(1); // still 1: the expiry did not count
      const u = await userRow();
      expect(u.accountStatus).toBe('pending_deletion'); // the ordinary 30-day grace begins
      expect(u.pendingDeletionAt).not.toBeNull();

      // And a closed account is never chased again.
      expect((await stale().sweepStaleDeclines(new Date(Date.now() + 40 * DAY))).chasedGuardianIds).toEqual([]);
    });
  });

  describe('which rows the sweep selects, on a real engine', () => {
    it('chases only an explicit decline 1 or 2 on an active minor, past the window', async () => {
      const old = new Date(Date.now() - 20 * DAY);
      const recent = new Date(Date.now() - 2 * DAY);

      const one = await seed(app, 'one', { guardian: { ...explicit, declineCount: 1, consentDeclinedAt: old } });
      const two = await seed(app, 'two', { guardian: { ...explicit, declineCount: 2, consentDeclinedAt: old } });

      // None of these may be touched:
      await seed(app, 'third', { guardian: { ...explicit, declineCount: 3, consentDeclinedAt: old } });
      await seed(app, 'withdrawn', {
        guardian: { consentStatus: 'declined', consentDeclineSource: 'guardian_withdrawal', consentDeclinedAt: old },
      });
      await seed(app, 'expired', {
        guardian: { consentStatus: 'declined', consentDeclineSource: 'expiry_timeout', consentDeclinedAt: old },
      });
      await seed(app, 'recent', { guardian: { ...explicit, declineCount: 1, consentDeclinedAt: recent } });
      await seed(app, 'nostamp', { guardian: { ...explicit, declineCount: 1, consentDeclinedAt: null } });
      await seed(app, 'reopened', { guardian: { consentStatus: 'pending', declineCount: 1, consentDeclinedAt: old } });
      await seed(app, 'confirmed', {
        guardian: { consentStatus: 'confirmed', consentTimestamp: old, consentDeclinedAt: old, declineCount: 1 },
      });
      await seed(app, 'adult', {
        user: { isMinor: false },
        guardian: { ...explicit, declineCount: 1, consentDeclinedAt: old },
      });
      await seed(app, 'closing', {
        user: { accountStatus: 'pending_deletion' },
        guardian: { ...explicit, declineCount: 1, consentDeclinedAt: old },
      });
      await seed(app, 'deactivated', {
        user: { accountStatus: 'deactivated' },
        guardian: { ...explicit, declineCount: 1, consentDeclinedAt: old },
      });

      const before = await prisma().guardian.findMany({ orderBy: { id: 'asc' } });
      const result = await stale().sweepStaleDeclines(new Date());

      expect([...result.chasedGuardianIds].sort()).toEqual([one.guardianId, two.guardianId].sort());

      // Every OTHER row is byte-identical.
      const after = await prisma().guardian.findMany({ orderBy: { id: 'asc' } });
      const changed = after.filter((a) => JSON.stringify(a) !== JSON.stringify(before.find((b) => b.id === a.id)));
      expect(changed.map((c) => c.id).sort()).toEqual([one.guardianId, two.guardianId].sort());
      for (const c of changed) {
        expect(c.consentStatus).toBe('pending');
        expect(c.consentAutoResentAt).not.toBeNull();
      }
      // declineCount untouched on the chased rows.
      expect(changed.find((c) => c.id === one.guardianId)!.declineCount).toBe(1);
      expect(changed.find((c) => c.id === two.guardianId)!.declineCount).toBe(2);
    });

    it('a minor who reopens in time is left alone (resend within the window)', async () => {
      const s = await seed(app, 'in-time', {
        guardian: { ...explicit, declineCount: 1, consentDeclinedAt: new Date(Date.now() - 10 * DAY) },
      });
      await app.get(GuardianConsentService).resendConsent(s.email);
      const g = await prisma().guardian.findUniqueOrThrow({ where: { id: s.guardianId } });
      expect(g.consentStatus).toBe('pending');
      // 15 days after the original decline the row is already pending: not chased.
      expect((await stale().sweepStaleDeclines(new Date(Date.now() + 5 * DAY))).chasedGuardianIds).toEqual([]);
      // And the minor's own reopen did NOT spend the automatic chase.
      expect(g.consentAutoResentAt).toBeNull();
    });
  });

  describe('lastDecisionAt (B-131) on real rows', () => {
    it('approval time, decline time, and the later of the two after approve-then-withdraw', async () => {
      const approved = new Date('2026-10-01T09:00:00.000Z');
      const withdrawn = new Date('2026-10-10T09:00:00.000Z');

      const a = await seed(app, 'approved', { guardian: { consentStatus: 'confirmed', consentTimestamp: approved } });
      const w = await seed(app, 'withdrawn-status', {
        guardian: {
          consentStatus: 'declined',
          consentDeclineSource: 'guardian_withdrawal',
          consentTimestamp: approved,
          consentDeclinedAt: withdrawn,
        },
      });
      const p = await seed(app, 'undecided');

      const get = async (s: { accessToken: string }) =>
        (await request(app.getHttpServer()).get('/auth/guardian-consent/status').set(bearer(s.accessToken)).expect(200)).body;

      expect((await get(a)).lastDecisionAt).toBe(approved.toISOString());
      expect((await get(w)).lastDecisionAt).toBe(withdrawn.toISOString());
      expect((await get(p)).lastDecisionAt).toBeNull();
      expect((await get(p)).guardianFirstName).toBe('Pat');
    });
  });

  describe('the migration backfill', () => {
    it('is purely additive: the column is nullable and indexed', async () => {
      const cols = await prisma().$queryRawUnsafe<Array<{ is_nullable: string }>>(
        `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'Guardian' AND column_name = 'consentDeclinedAt'`,
      );
      expect(cols).toEqual([{ is_nullable: 'YES' }]);
      const idx = await prisma().$queryRawUnsafe<Array<{ indexname: string }>>(
        `SELECT indexname FROM pg_indexes WHERE tablename = 'Guardian' AND indexname = 'Guardian_consentStatus_consentDeclinedAt_idx'`,
      );
      expect(idx).toHaveLength(1);
    });
  });
});
