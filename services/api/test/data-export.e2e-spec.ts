import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { PasswordService } from '../src/modules/auth/password/password.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { DataExportSweepService } from '../src/modules/data-export/data-export-sweep.service';
import { DataExportService } from '../src/modules/data-export/data-export.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { InMemoryStorage } from './support/post-media-doubles';

// backend/b060-data-export (B-060; Decision Log #472 (g)), against the REAL app and REAL Postgres: the whole
// "Download my data" slice. The object store is the in-memory double and the clock is a settable fake; cron jobs
// are stopped so only the explicit calls below run.
//
// The password hash is a real argon2id hash made by the app's own PasswordService.

const rand = () => Math.random().toString(36).slice(2, 10);
const PASSWORD = 'correct-horse-battery-staple';
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

describe('Download my data e2e (B-060)', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  let nowMs = new Date('2026-11-18T10:00:00Z').getTime();
  const clock = { now: () => new Date(nowMs) };
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(clock)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(DirectUploadStorageService)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    nowMs = new Date('2026-11-18T10:00:00Z').getTime();
    storage.objects.clear();
    storage.failDeleteFor.clear();
    storage.unavailable = false;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  // ---- helpers -----------------------------------------------------------------------------------

  interface U {
    id: string;
    auth: { Authorization: string };
  }

  async function seedUser(label: string, over: Record<string, unknown> = {}): Promise<U> {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-export-${label}-${suffix}@example.com`,
        passwordHash: await app.get(PasswordService).hash(PASSWORD),
        displayName: `Real Name ${label}`,
        username: `x_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
        ...over,
      } as never,
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  const ask = (u: U, password: string = PASSWORD) =>
    request(http()).post('/users/me/data-export').set(u.auth).send({ password });

  /** Asks for the export and waits for the background build to finish. */
  async function askAndWait(u: U): Promise<string> {
    const res = await ask(u).expect(202);
    for (let i = 0; i < 100; i++) {
      const row = await prisma().dataExportRequest.findUnique({ where: { id: res.body.id } });
      if (row && row.status !== 'preparing') return res.body.id as string;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('the export never left preparing');
  }

  async function seedActivity(owner: U, other: U) {
    const post = await prisma().post.create({ data: { authorId: owner.id, contentText: 'my own post text' } });
    const otherPost = await prisma().post.create({ data: { authorId: other.id, contentText: 'OTHER-PERSONS-POST' } });
    await prisma().comment.create({ data: { postId: otherPost.id, authorId: owner.id, contentText: 'my own comment text' } });
    await prisma().comment.create({ data: { postId: post.id, authorId: other.id, contentText: 'OTHER-PERSONS-COMMENT' } });
    await prisma().follow.create({ data: { followerId: owner.id, followeeId: other.id } });
    await prisma().follow.create({ data: { followerId: other.id, followeeId: owner.id } });
    const [a, b] = [owner.id, other.id].sort();
    const conv = await prisma().conversation.create({
      data: { participantIds: [a, b], participantKey: `${a}:${b}` } as never,
    });
    await prisma().message.create({ data: { conversationId: conv.id, senderId: owner.id, contentText: 'sent by the owner' } });
    await prisma().message.create({ data: { conversationId: conv.id, senderId: other.id, contentText: 'OTHER-PERSONS-MESSAGE' } });
    await prisma().message.create({
      data: {
        conversationId: conv.id,
        senderId: owner.id,
        contentText: 'edited current text',
        originalContentText: 'ORIGINAL-BEFORE-EDIT',
        editedAt: new Date(),
      } as never,
    });
    return { post, conv };
  }

  // ---- POST ---------------------------------------------------------------------------------------

  it('401 without a token', async () => {
    await request(http()).post('/users/me/data-export').send({ password: PASSWORD }).expect(401);
    await request(http()).get('/users/me/data-export/latest').expect(401);
  });

  it('a wrong password is a coded 403 and nothing is recorded; the right one is a 202', async () => {
    const u = await seedUser('pw');
    const bad = await ask(u, 'not-the-password').expect(403);
    expect(bad.body.code).toBe('wrong_password');
    expect(await prisma().dataExportRequest.count()).toBe(0);
    const ok = await ask(u).expect(202);
    expect(ok.body.status).toBe('preparing');
    expect(await prisma().dataExportRequest.count()).toBe(1);
  });

  it('a second successful request within 24 hours is a coded 429 with no number; after 24 hours it is accepted', async () => {
    const u = await seedUser('limit');
    await askAndWait(u);
    const res = await ask(u).expect(429);
    expect(res.body.code).toBe('too_many_requests');
    expect(res.body.message).not.toMatch(/\d/); // no number in the wording (the status code is not wording)
    nowMs += 24 * HOUR + 1000;
    await ask(u).expect(202);
  });

  it('a failed build does not count toward the 24-hour limit', async () => {
    const u = await seedUser('failed');
    storage.unavailable = true;
    const id = await askAndWait(u);
    expect((await prisma().dataExportRequest.findUnique({ where: { id } }))!.status).toBe('failed');
    storage.unavailable = false;
    await ask(u).expect(202);
  });

  it('two simultaneous requests: exactly one is accepted', async () => {
    const u = await seedUser('race');
    const results = await Promise.all([ask(u), ask(u), ask(u)]);
    expect(results.map((r) => r.status).sort()).toEqual([202, 429, 429]);
    expect(await prisma().dataExportRequest.count()).toBe(1);
  });

  // ---- latest / download ----------------------------------------------------------------------------

  it('latest: none, then ready with an expiry 7 days out', async () => {
    const u = await seedUser('latest');
    expect((await request(http()).get('/users/me/data-export/latest').set(u.auth).expect(200)).body).toEqual({ status: 'none' });
    const id = await askAndWait(u);
    const res = await request(http()).get('/users/me/data-export/latest').set(u.auth).expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.id).toBe(id);
    expect(new Date(res.body.expiresAt).getTime() - nowMs).toBe(7 * DAY);
  });

  it('the file is private-stored under data-export/, never under a prefix the public address serves', async () => {
    const u = await seedUser('prefix');
    const id = await askAndWait(u);
    const row = await prisma().dataExportRequest.findUnique({ where: { id } });
    expect(row!.fileKey).toBe(`data-export/${u.id}/${id}.json`);
    for (const pub of ['post-media/', 'profile-media/']) expect(row!.fileKey!.startsWith(pub)).toBe(false);
    expect([...storage.objects.keys()]).toEqual([row!.fileKey]);
  });

  it("the download streams the owner's JSON as an attachment, and contains only the owner's own data", async () => {
    const owner = await seedUser('owner');
    const other = await seedUser('other');
    await seedActivity(owner, other);
    const id = await askAndWait(owner);
    const res = await request(http()).get(`/users/me/data-export/${id}/download`).set(owner.auth).expect(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="soccernity-data-export.json"');
    expect(res.headers['cache-control']).toBe('no-store');
    const text = res.text;
    const file = JSON.parse(text);
    expect(file.format).toBe('soccernity-data-export');
    expect(file.profile.id).toBe(owner.id);
    expect(file.profile.dateOfBirth).toBe('1994-05-05T00:00:00.000Z');
    expect(file.posts.map((p: { contentText: string }) => p.contentText)).toEqual(['my own post text']);
    expect(file.comments.map((c: { contentText: string }) => c.contentText)).toEqual(['my own comment text']);
    expect(file.following).toEqual([{ id: other.id, publicName: expect.any(String) }]);
    expect(file.sentMessages.map((m: { contentText: string }) => m.contentText).sort()).toEqual(['edited current text', 'sent by the owner']);

    // The list of things that must NEVER appear, anywhere in the file text.
    const ownerRow = await prisma().user.findUnique({ where: { id: owner.id } });
    const forbidden = [
      ownerRow!.passwordHash,
      'passwordHash',
      'OTHER-PERSONS-POST',
      'OTHER-PERSONS-COMMENT',
      'OTHER-PERSONS-MESSAGE',
      'ORIGINAL-BEFORE-EDIT',
      `Real Name other`, // the other person's real name (only the public name may appear)
      'totp',
      'backupCode',
      'consentToken',
      'refreshToken',
    ];
    for (const f of forbidden) expect(text).not.toContain(f);
  });

  it("another account's request id is a 404 (the same as an id that does not exist); an unknown id too", async () => {
    const owner = await seedUser('own');
    const stranger = await seedUser('stranger');
    const id = await askAndWait(owner);
    const theirs = await request(http()).get(`/users/me/data-export/${id}/download`).set(stranger.auth).expect(404);
    const missing = await request(http())
      .get('/users/me/data-export/0b2b1d1e-6f0e-4d57-9a43-1c3b3f6d9a10/download')
      .set(stranger.auth)
      .expect(404);
    expect(theirs.body).toEqual(missing.body);
    // And the stranger's own "latest" shows nothing of the owner's.
    expect((await request(http()).get('/users/me/data-export/latest').set(stranger.auth)).body).toEqual({ status: 'none' });
  });

  it('a download that is not ready is a 409, and past its expiry a 410', async () => {
    const u = await seedUser('states');
    const row = await prisma().dataExportRequest.create({ data: { userId: u.id, status: 'preparing' } });
    await request(http()).get(`/users/me/data-export/${row.id}/download`).set(u.auth).expect(409);
    const id = await askAndWait(await seedUser('states2'));
    expect(id).toBeTruthy();

    const u3 = await seedUser('expiry');
    const ready = await askAndWait(u3);
    await request(http()).get(`/users/me/data-export/${ready}/download`).set(u3.auth).expect(200);
    nowMs += 7 * DAY + 1000;
    const gone = await request(http()).get(`/users/me/data-export/${ready}/download`).set(u3.auth).expect(410);
    expect(gone.body.code).toBe('data_export_expired');
    expect((await request(http()).get('/users/me/data-export/latest').set(u3.auth)).body).toEqual({ status: 'none' });
  });

  // ---- the sweep ----------------------------------------------------------------------------------

  it('the sweep deletes an expired export file AND its row, and leaves a live one alone', async () => {
    const a = await seedUser('sweepa');
    const b = await seedUser('sweepb');
    const expired = await askAndWait(a);
    nowMs += 3 * DAY;
    const live = await askAndWait(b);
    nowMs += 5 * DAY; // a's export is now 8 days old (past 7), b's is 5 days old
    const out = await app.get(DataExportSweepService).sweep(clock.now());
    expect(out.expiredRemoved).toBe(1);
    expect(await prisma().dataExportRequest.findUnique({ where: { id: expired } })).toBeNull();
    expect(storage.has(`data-export/${a.id}/${expired}.json`)).toBe(false);
    expect(await prisma().dataExportRequest.findUnique({ where: { id: live } })).not.toBeNull();
    expect(storage.has(`data-export/${b.id}/${live}.json`)).toBe(true);
  });

  it('the sweep keeps the row (to retry) when the file cannot be deleted, and marks a stuck preparing request failed', async () => {
    const u = await seedUser('sweepfail');
    const id = await askAndWait(u);
    nowMs += 8 * DAY;
    storage.failDeleteFor.add(`data-export/${u.id}/${id}.json`);
    const first = await app.get(DataExportSweepService).sweep(clock.now());
    expect(first.expiredKept).toBe(1);
    expect(await prisma().dataExportRequest.findUnique({ where: { id } })).not.toBeNull();
    storage.failDeleteFor.clear();
    await app.get(DataExportSweepService).sweep(clock.now());
    expect(await prisma().dataExportRequest.findUnique({ where: { id } })).toBeNull();

    const stuck = await prisma().dataExportRequest.create({
      data: { userId: u.id, status: 'preparing', createdAt: new Date(nowMs - 2 * HOUR) },
    });
    await app.get(DataExportSweepService).sweep(clock.now());
    expect((await prisma().dataExportRequest.findUnique({ where: { id: stuck.id } }))!.status).toBe('failed');
  });

  // ---- the database -------------------------------------------------------------------------------

  it('the database refuses an unknown status and a ready row without its file and expiry', async () => {
    const u = await seedUser('check');
    await expect(prisma().dataExportRequest.create({ data: { userId: u.id, status: 'weird' } })).rejects.toThrow();
    await expect(prisma().dataExportRequest.create({ data: { userId: u.id, status: 'ready' } })).rejects.toThrow();
  });

  // ---- account deletion ---------------------------------------------------------------------------

  it('anonymising an account deletes its export rows AND the stored files', async () => {
    const u = await seedUser('anon');
    const id = await askAndWait(u);
    const key = `data-export/${u.id}/${id}.json`;
    expect(storage.has(key)).toBe(true);
    await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, clock.now());
    expect(await prisma().dataExportRequest.count({ where: { userId: u.id } })).toBe(0);
    expect(storage.has(key)).toBe(false);
  });

  it('minimising a held account also deletes its export rows and files', async () => {
    const u = await seedUser('minimise');
    const id = await askAndWait(u);
    const key = `data-export/${u.id}/${id}.json`;
    await app.get(AccountDeletionSweepService).minimiseHeldUser(u.id);
    expect(await prisma().dataExportRequest.count({ where: { userId: u.id } })).toBe(0);
    expect(storage.has(key)).toBe(false);
  });

  // ---- minors -------------------------------------------------------------------------------------

  it("a minor can request and download their own data (the route has no consent guard; whose rights apply is open with counsel)", async () => {
    const m = await seedUser('minor', { isMinor: true, dateOfBirth: seedDob('2012-01-01') });
    const id = await askAndWait(m);
    const res = await request(http()).get(`/users/me/data-export/${id}/download`).set(m.auth).expect(200);
    expect(JSON.parse(res.text).profile.isMinor).toBe(true);
    // The service is reachable for completeness of the module wiring.
    expect(app.get(DataExportService)).toBeDefined();
  });
});
