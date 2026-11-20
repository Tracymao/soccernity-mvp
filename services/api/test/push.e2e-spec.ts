import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { PushSweepService } from '../src/modules/push/push-sweep.service';
import { PushSendError, WebPushSender } from '../src/modules/push/web-push-sender';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// B-285 (Decision Log #472 adopted default (e)): web push against real Postgres. New work only: the PushSubscription
// table and Notification.pushSentAt (the migration), the three settings routes through the real app, the per-minute
// sweep end to end, and the anonymiser removing subscriptions. The push library is replaced by a fake sender (no
// network, no real keys); the VAPID values are fake strings set for this file only.
describe('Web push (B-285) e2e', () => {
  let app: INestApplication;
  const sent: Array<{ endpoint: string; payload: string }> = [];
  const failures = new Map<string, number | null>(); // endpoint -> status to fail with (null = no status)
  const fakeSender: WebPushSender = {
    async send(target, payload) {
      if (failures.has(target.endpoint)) throw new PushSendError(failures.get(target.endpoint) ?? null);
      sent.push({ endpoint: target.endpoint, payload });
    },
  };
  const savedEnv: Record<string, string | undefined> = {};
  const VAPID_KEYS = ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'] as const;

  function setVapid(on: boolean) {
    if (on) {
      process.env.VAPID_PUBLIC_KEY = 'fake-public-key';
      process.env.VAPID_PRIVATE_KEY = 'fake-private-key';
      process.env.VAPID_SUBJECT = 'mailto:support@soccernity.com';
    } else {
      process.env.VAPID_PUBLIC_KEY = 'replace-me';
      process.env.VAPID_PRIVATE_KEY = 'replace-me';
    }
  }

  beforeAll(async () => {
    for (const k of VAPID_KEYS) savedEnv[k] = process.env[k];
    setVapid(true);
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WebPushSender)
      .useValue(fakeSender)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
    sent.length = 0;
    failures.clear();
    setVapid(true);
  });

  afterAll(async () => {
    for (const k of VAPID_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
    await app.close();
    await disconnectTestPrismaClient();
  });

  const MINUTE = 60 * 1000;
  const server = () => app.getHttpServer();
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const prisma = () => getTestPrismaClient();
  let counter = 0;
  const endpointFor = (id: string) => `https://fcm.googleapis.com/fcm/send/${id}`;
  const body = (id: string) => ({ endpoint: endpointFor(id), keys: { p256dh: `p256dh-${id}`, auth: `auth-${id}` } });
  const subscribe = (token: string, id: string) =>
    request(server()).post('/notification-settings/push/subscription').set(auth(token)).send(body(id));

  async function createUser(label: string) {
    counter += 1;
    const name = `pu${label}${counter}`;
    const user = await prisma().user.create({
      data: {
        email: `${name}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: name,
        username: name,
        verificationStatus: 'verified',
        dateOfBirth: seedDob('1993-03-03'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token };
  }

  const notify = (userId: string, ageMinutes = 0, extra: Record<string, unknown> = {}) =>
    prisma().notification.create({
      data: { userId, type: 'follow', payloadRefId: 'someone', createdAt: new Date(Date.now() - ageMinutes * MINUTE), ...extra },
    });

  // ---------------------------------------------------------------- the settings routes

  describe('settings routes', () => {
    it('require a token', async () => {
      await request(server()).get('/notification-settings/push').expect(401);
      await request(server()).post('/notification-settings/push/subscription').send(body('a')).expect(401);
      await request(server()).delete('/notification-settings/push/subscription').send({ endpoint: endpointFor('a') }).expect(401);
    });

    it('GET reports available with the public key (and never the private key) when configured', async () => {
      const u = await createUser('get');
      const res = await request(server()).get('/notification-settings/push').set(auth(u.accessToken)).expect(200);
      expect(res.body).toEqual({ available: true, publicKey: 'fake-public-key' });
      expect(JSON.stringify(res.body)).not.toContain('fake-private-key');
    });

    it('GET reports unavailable, and subscribe / unsubscribe answer 503 push_not_configured, when the keys are unset', async () => {
      setVapid(false);
      const u = await createUser('off');
      const res = await request(server()).get('/notification-settings/push').set(auth(u.accessToken)).expect(200);
      expect(res.body).toEqual({ available: false });
      const sub = await subscribe(u.accessToken, 'off').expect(503);
      expect(sub.body.code).toBe('push_not_configured');
      const del = await request(server())
        .delete('/notification-settings/push/subscription')
        .set(auth(u.accessToken))
        .send({ endpoint: endpointFor('off') })
        .expect(503);
      expect(del.body.code).toBe('push_not_configured');
      expect(await prisma().pushSubscription.count()).toBe(0);
    });

    it('subscribe stores one row; the same browser again is idempotent (one row, keys refreshed)', async () => {
      const u = await createUser('sub');
      await subscribe(u.accessToken, 'one').expect(200, { subscribed: true });
      await subscribe(u.accessToken, 'one').expect(200, { subscribed: true });
      await request(server())
        .post('/notification-settings/push/subscription')
        .set(auth(u.accessToken))
        .send({ endpoint: endpointFor('one'), keys: { p256dh: 'new-p', auth: 'new-a' } })
        .expect(200);
      const rows = await prisma().pushSubscription.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ userId: u.userId, endpoint: endpointFor('one'), p256dh: 'new-p', auth: 'new-a' });
    });

    it('two browsers of one person are two rows', async () => {
      const u = await createUser('two');
      await subscribe(u.accessToken, 'a').expect(200);
      await subscribe(u.accessToken, 'b').expect(200);
      expect(await prisma().pushSubscription.count({ where: { userId: u.userId } })).toBe(2);
    });

    it('the same browser signing in as another account moves the row to that account', async () => {
      const a = await createUser('moveA');
      const b = await createUser('moveB');
      await subscribe(a.accessToken, 'shared').expect(200);
      await subscribe(b.accessToken, 'shared').expect(200);
      const rows = await prisma().pushSubscription.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(b.userId);
    });

    it('unsubscribe removes only the callers own row and is quiet otherwise', async () => {
      const a = await createUser('unA');
      const b = await createUser('unB');
      await subscribe(a.accessToken, 'mine').expect(200);
      // B names A's endpoint: no effect, no signal
      await request(server())
        .delete('/notification-settings/push/subscription')
        .set(auth(b.accessToken))
        .send({ endpoint: endpointFor('mine') })
        .expect(204);
      expect(await prisma().pushSubscription.count()).toBe(1);
      await request(server())
        .delete('/notification-settings/push/subscription')
        .set(auth(a.accessToken))
        .send({ endpoint: endpointFor('mine') })
        .expect(204);
      expect(await prisma().pushSubscription.count()).toBe(0);
      // and again: still quiet
      await request(server())
        .delete('/notification-settings/push/subscription')
        .set(auth(a.accessToken))
        .send({ endpoint: endpointFor('mine') })
        .expect(204);
    });

    it('refuses bad bodies and endpoints that are not browser push services (400), storing nothing', async () => {
      const u = await createUser('bad');
      await request(server()).post('/notification-settings/push/subscription').set(auth(u.accessToken)).send({}).expect(400);
      await request(server())
        .post('/notification-settings/push/subscription')
        .set(auth(u.accessToken))
        .send({ endpoint: endpointFor('x') })
        .expect(400);
      const res = await request(server())
        .post('/notification-settings/push/subscription')
        .set(auth(u.accessToken))
        .send({ endpoint: 'https://example.com/push', keys: { p256dh: 'p', auth: 'a' } })
        .expect(400);
      expect(res.body.code).toBe('push_endpoint_not_accepted');
      expect(await prisma().pushSubscription.count()).toBe(0);
    });

    it('a restricted-pending minor can turn push on for their own browser (JwtAuthGuard only)', async () => {
      const u = await createUser('minor');
      await prisma().user.update({ where: { id: u.userId }, data: { isMinor: true } });
      await prisma().guardian.create({
        data: { minorUserId: u.userId, name: 'G', email: 'g@example.com', relationship: 'Parent', consentToken: `t-${u.userId}`, consentStatus: 'pending', consentTokenExpiresAt: new Date(Date.now() + 72 * 3600 * 1000) },
      });
      await subscribe(u.accessToken, 'minor').expect(200);
    });
  });

  // ---------------------------------------------------------------- the sweep

  describe('the per-minute sweep', () => {
    const run = () => app.get(PushSweepService).run();
    const PAYLOAD = '{"title":"Soccernity","body":"You have a new notification"}';

    it('sends one generic push per browser and marks every waiting notification, however many', async () => {
      const u = await createUser('send');
      await subscribe(u.accessToken, 'b1').expect(200);
      await subscribe(u.accessToken, 'b2').expect(200);
      const rows = await Promise.all([notify(u.userId), notify(u.userId), notify(u.userId)]);

      const result = await run();

      expect(result).toMatchObject({ users: 1, sent: 2, removed: 0, failed: 0 });
      expect(sent.map((s) => s.endpoint).sort()).toEqual([endpointFor('b1'), endpointFor('b2')]);
      for (const s of sent) expect(s.payload).toBe(PAYLOAD);
      const after = await prisma().notification.findMany({ where: { id: { in: rows.map((r) => r.id) } } });
      expect(after.every((n) => n.pushSentAt !== null)).toBe(true);

      // a second run finds nothing new: no double push
      sent.length = 0;
      await run();
      expect(sent).toHaveLength(0);
    });

    it('the payload carries nothing about the notification (no type, no ids, no names)', async () => {
      const u = await createUser('generic');
      await subscribe(u.accessToken, 'g').expect(200);
      await notify(u.userId, 0, { type: 'message', payloadRefId: 'conversation-secret-id' });
      await run();
      expect(sent).toHaveLength(1);
      expect(sent[0].payload).not.toMatch(/message|conversation|secret|follow/i);
      expect(JSON.parse(sent[0].payload)).toEqual({ title: 'Soccernity', body: 'You have a new notification' });
    });

    it('only recent notifications of people with a subscription are pushed', async () => {
      const withSub = await createUser('with');
      const without = await createUser('without');
      await subscribe(withSub.accessToken, 'w').expect(200);
      const old = await notify(withSub.userId, 11); // older than the 10-minute window
      const fresh = await notify(withSub.userId, 5);
      const nobody = await notify(without.userId, 1);

      await run();

      expect(sent).toHaveLength(1);
      expect((await prisma().notification.findUnique({ where: { id: old.id } }))!.pushSentAt).toBeNull();
      expect((await prisma().notification.findUnique({ where: { id: fresh.id } }))!.pushSentAt).not.toBeNull();
      expect((await prisma().notification.findUnique({ where: { id: nobody.id } }))!.pushSentAt).toBeNull();
    });

    it('does nothing at all while the keys are unset', async () => {
      const u = await createUser('nokeys');
      await subscribe(u.accessToken, 'k').expect(200);
      const n = await notify(u.userId);
      setVapid(false);
      expect(await run()).toEqual({ users: 0, sent: 0, removed: 0, failed: 0 });
      expect(sent).toHaveLength(0);
      expect((await prisma().notification.findUnique({ where: { id: n.id } }))!.pushSentAt).toBeNull();
    });

    it('a 410 or 404 from the push service deletes that subscription, and the other browser still gets the push', async () => {
      const u = await createUser('gone');
      await subscribe(u.accessToken, 'dead').expect(200);
      await subscribe(u.accessToken, 'dead404').expect(200);
      await subscribe(u.accessToken, 'alive').expect(200);
      failures.set(endpointFor('dead'), 410);
      failures.set(endpointFor('dead404'), 404);
      await notify(u.userId);

      const result = await run();

      expect(result).toMatchObject({ sent: 1, removed: 2, failed: 0 });
      const left = await prisma().pushSubscription.findMany({ where: { userId: u.userId } });
      expect(left.map((s) => s.endpoint)).toEqual([endpointFor('alive')]);
    });

    it('a transient failure keeps the subscription and retries the notification on the next run', async () => {
      const u = await createUser('retry');
      await subscribe(u.accessToken, 'flaky').expect(200);
      const n = await notify(u.userId);
      failures.set(endpointFor('flaky'), 503);

      const first = await run();
      expect(first).toMatchObject({ sent: 0, failed: 1, removed: 0 });
      expect(await prisma().pushSubscription.count()).toBe(1);
      expect((await prisma().notification.findUnique({ where: { id: n.id } }))!.pushSentAt).toBeNull();

      failures.clear();
      const second = await run();
      expect(second).toMatchObject({ sent: 1, failed: 0 });
      expect((await prisma().notification.findUnique({ where: { id: n.id } }))!.pushSentAt).not.toBeNull();
    });

    it('one account failing does not stop another', async () => {
      const a = await createUser('isoA');
      const b = await createUser('isoB');
      await subscribe(a.accessToken, 'isoa').expect(200);
      await subscribe(b.accessToken, 'isob').expect(200);
      failures.set(endpointFor('isoa'), null);
      await notify(a.userId);
      await notify(b.userId);

      const result = await run();

      expect(result).toMatchObject({ users: 2, sent: 1, failed: 1 });
      expect(sent.map((s) => s.endpoint)).toEqual([endpointFor('isob')]);
    });

    it('two sweeps at once never send the same notification twice', async () => {
      const u = await createUser('race');
      await subscribe(u.accessToken, 'race').expect(200);
      await notify(u.userId);
      await Promise.all([run(), run()]);
      expect(sent).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------- account deletion

  describe('account deletion', () => {
    it('anonymising an account deletes its push subscriptions and leaves everyone elses', async () => {
      const gone = await createUser('anonG');
      const kept = await createUser('anonK');
      await subscribe(gone.accessToken, 'g1').expect(200);
      await subscribe(gone.accessToken, 'g2').expect(200);
      await subscribe(kept.accessToken, 'k1').expect(200);

      await app.get(AccountDeletionSweepService).anonymizeUser(gone.userId, false);

      expect(await prisma().pushSubscription.count({ where: { userId: gone.userId } })).toBe(0);
      expect(await prisma().pushSubscription.count({ where: { userId: kept.userId } })).toBe(1);
    });

    it('the database foreign key to User is ON DELETE CASCADE (a safety net behind the anonymiser)', async () => {
      const fk = await prisma().$queryRaw<Array<{ confdeltype: string }>>`
        SELECT confdeltype FROM pg_constraint WHERE conname = 'PushSubscription_userId_fkey'
      `;
      expect(fk[0].confdeltype).toBe('c'); // c = CASCADE
    });
  });
});
