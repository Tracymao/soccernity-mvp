import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ReportRetentionService } from '../src/modules/moderation/report-retention.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { PostMediaService } from '../src/modules/post-media/post-media.service';
import { RejectedMediaSweepService } from '../src/modules/post-media/rejected-media-sweep.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor } from './support/post-media-doubles';

// backend/suspected-illegal-imagery-path (B-206; founder decision 2026-11-15), against the REAL app and REAL Postgres.
//
// A child-safety-vetted admin sets a file aside as suspected illegal imagery: the file is rejected through the existing
// generic rejection, a SuspectedIllegalMedia record is written (no foreign keys), and the file is then PROTECTED from every
// private-object deletion path while the record is `set_aside` OR `now < preserveUntil`. A human then records FILED or NOT
// FILED. Nothing here contacts an authority.
//
// The object store is the in-memory double; cron jobs are stopped so only the explicit calls below run.

const rand = () => Math.random().toString(36).slice(2, 10);
const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-10T04:00:00Z');

describe('Suspected illegal imagery path e2e (B-206)', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  const fakeClock = { now: () => new Date(NOW) };
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(fakeClock)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(DirectUploadStorageService)
      .useValue(storage)
      .overrideProvider(MediaProcessor)
      .useValue(new TestMediaProcessor())
      .overrideProvider(MediaModerationClient)
      .useValue(new FakeModerationClient())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    storage.objects.clear();
    storage.modified.clear();
    storage.failDeleteFor.clear();
    storage.unavailable = false;
    storage.listNotPermitted = false;
    storage.pageSize = 1000;
  });

  // the set-aside route's background withdraw settles after the response; let it finish before the next reset
  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 400));
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
  interface A {
    id: string;
    auth: { Authorization: string };
  }

  async function seedUser(label: string, over: Record<string, unknown> = {}): Promise<U> {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-sus-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `s_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
        ...over,
      } as never,
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  async function seedAdmin(role: 'moderator' | 'superadmin' | 'editor', vetted: boolean): Promise<A> {
    const admin = await prisma().adminUser.create({
      data: {
        email: `sus-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'x',
        fullName: `Sus ${role}`,
        role,
        childSafetyVetted: vetted,
      } as never,
    });
    const pair = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, auth: { Authorization: `Bearer ${pair.accessToken.token}` } };
  }

  const keys = (u: string, id: string) => ({ priv: `private-media/${u}/${id}.jpg`, pub: `post-media/${u}/${id}.jpg` });

  /** A processed (ready) media row with its object in the store. Pending files sit in the private prefix. */
  async function seedMedia(
    u: U,
    over: { status?: 'rejected' | 'pending' | 'approved'; postId?: string | null; quarantine?: boolean; confirmedAt?: Date } = {},
  ) {
    const id = `${rand()}${rand()}`;
    const k = keys(u.id, id);
    const status = over.status ?? 'pending';
    const published = status === 'approved';
    const row = await prisma().postMedia.create({
      data: {
        id,
        uploaderId: u.id,
        kind: 'image',
        declaredContentType: 'image/jpeg',
        declaredSize: 10,
        uploadState: 'ready',
        status,
        decisionSource: status === 'pending' ? null : 'auto',
        rejectionReason: status === 'rejected' ? "This file didn't meet our rules" : null,
        decidedAt: status === 'pending' ? null : NOW,
        privateKey: published ? null : k.priv,
        publicKey: k.pub,
        publicUrl: `https://cdn.test/${k.pub}`,
        publishedAt: published ? new Date(NOW.getTime() - DAY) : null,
        contentType: 'image/jpeg',
        byteSize: 10,
        confirmedAt: over.confirmedAt ?? new Date(NOW.getTime() - 30 * DAY),
        createdAt: over.confirmedAt ?? new Date(NOW.getTime() - 30 * DAY),
        quarantineKey: over.quarantine ? `quarantine/${u.id}/${id}` : null,
        postId: over.postId ?? null,
        checkState: 'done',
      } as never,
    });
    storage.put(published ? k.pub : k.priv, Buffer.from('x'.repeat(10)), 'image/jpeg');
    if (over.quarantine) storage.put(`quarantine/${u.id}/${id}`, Buffer.from('orig'), 'image/jpeg');
    return { ...row, priv: k.priv, pub: k.pub };
  }

  const seedPost = (u: U) => prisma().post.create({ data: { authorId: u.id, contentText: 'a post with media' } });
  const sweep = () => app.get(RejectedMediaSweepService);
  const deferrals = () => prisma().postMediaDeferredDeletion.findMany();
  const record = (mediaId: string) => prisma().suspectedIllegalMedia.findUnique({ where: { mediaId } });

  /** A record written directly (the routes are covered separately) so each deletion path can be probed alone. */
  async function recordFor(
    m: { id: string; uploaderId: string; postId: string | null; priv: string },
    admin: A,
    over: Record<string, unknown> = {},
  ) {
    return prisma().suspectedIllegalMedia.create({
      data: {
        mediaId: m.id,
        uploaderId: m.uploaderId,
        postId: m.postId,
        objectKey: m.priv,
        kind: 'image',
        reason: 'e2e reason',
        setAsideByAdminId: admin.id,
        setAsideAt: NOW,
        preserveUntil: new Date(NOW.getTime() + 365 * DAY),
        ...over,
      } as never,
    });
  }

  const setAside = (mediaId: string, admin: A, body: Record<string, unknown> = { reason: 'looks like illegal imagery' }) =>
    request(http()).post(`/admin/media-review/${mediaId}/suspected-illegal`).set(admin.auth).send(body);

  // =================================================================================================
  describe('POST /admin/media-review/:id/suspected-illegal', () => {
    it('a vetted moderator sets a pending file aside: generic rejection, record, preservation date, audit row without the reason', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      const admin = await seedAdmin('moderator', true);

      const res = await setAside(m.id, admin, { reason: 'secret reason text' }).expect(201);
      expect(res.body).toMatchObject({ mediaId: m.id, status: 'set_aside', kind: 'image', uploaderId: u.id });

      const media = await prisma().postMedia.findUniqueOrThrow({ where: { id: m.id } });
      expect(media).toMatchObject({ status: 'rejected', rejectionReason: "This file didn't meet our rules" });

      const rec = await record(m.id);
      expect(rec).toMatchObject({ status: 'set_aside', setAsideByAdminId: admin.id, objectKey: m.priv, reason: 'secret reason text' });
      expect(rec!.preserveUntil.getTime() - rec!.setAsideAt.getTime()).toBe(365 * DAY);

      const log = await prisma().adminActionLog.findMany({ where: { action: 'media.suspected_illegal_set_aside' } });
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ adminId: admin.id, targetId: m.id });
      expect(log[0].notes ?? '').not.toContain('secret reason text');

      // the object is still there (rejected files are never deleted by the decision itself)
      expect(storage.has(m.priv)).toBe(true);
    });

    it('adds no notification and no account hold beyond the existing generic rejection', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      const admin = await seedAdmin('superadmin', true);
      const notificationsBefore = await prisma().notification.count({ where: { userId: u.id } });
      await setAside(m.id, admin).expect(201);
      await new Promise((r) => setTimeout(r, 300));
      expect(await prisma().accountHold.count({ where: { userId: u.id } })).toBe(0);
      // the generic rejection notice ("not approved") is the only possible addition; never anything naming this path
      const created = await prisma().notification.findMany({ where: { userId: u.id } });
      expect(created.length - notificationsBefore).toBeLessThanOrEqual(1);
      for (const n of created) expect(JSON.stringify(n)).not.toMatch(/illegal|suspected|set_aside/i);
    });

    it('works on an already-REJECTED file and on an approved, published file (the public copy is withdrawn)', async () => {
      const u = await seedUser('a');
      const rejected = await seedMedia(u, { status: 'rejected' });
      const approved = await seedMedia(u, { status: 'approved' });
      const admin = await seedAdmin('moderator', true);

      await setAside(rejected.id, admin).expect(201);
      expect(await record(rejected.id)).toMatchObject({ status: 'set_aside', objectKey: rejected.priv });

      await setAside(approved.id, admin).expect(201);
      expect(await prisma().postMedia.findUniqueOrThrow({ where: { id: approved.id } })).toMatchObject({ status: 'rejected' });
      // the background withdraw moves the object back to private
      for (let i = 0; i < 50 && storage.has(approved.pub); i++) await new Promise((r) => setTimeout(r, 30));
      expect(storage.has(approved.pub)).toBe(false);
    });

    it('stores the reportId when given; 404 for an unknown report id and for an unknown media id', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      const report = await prisma().report.create({ data: { targetType: 'post', targetId: post.id, reason: 'e2e', status: 'open' } as never });
      const admin = await seedAdmin('moderator', true);

      await setAside(m.id, admin, { reason: 'r', reportId: '00000000-0000-4000-8000-000000000000' }).expect(404);
      expect(await record(m.id)).toBeNull();
      await setAside('no-such-media', admin).expect(404);

      await setAside(m.id, admin, { reason: 'r', reportId: report.id }).expect(201);
      expect(await record(m.id)).toMatchObject({ reportId: report.id, postId: post.id });
    });

    it('409 when the file was already set aside, and nothing is written twice', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      const admin = await seedAdmin('moderator', true);
      await setAside(m.id, admin).expect(201);
      await setAside(m.id, admin).expect(409);
      expect(await prisma().suspectedIllegalMedia.count()).toBe(1);
      expect(await prisma().adminActionLog.count({ where: { action: 'media.suspected_illegal_set_aside' } })).toBe(1);
    });

    it('two simultaneous set-asides produce exactly one record', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      const a = await seedAdmin('moderator', true);
      const b = await seedAdmin('moderator', true);
      const results = await Promise.all([setAside(m.id, a), setAside(m.id, b)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma().suspectedIllegalMedia.count()).toBe(1);
    });

    it('roles and vetting: an editor is refused, an unvetted admin gets 404 on a MINOR\'s file and a coded 403 on an adult\'s, nothing changes', async () => {
      const adult = await seedUser('adult');
      const minor = await seedUser('minor', { isMinor: true });
      const adultFile = await seedMedia(adult);
      const minorFile = await seedMedia(minor);
      const editor = await seedAdmin('editor', true);
      const unvetted = await seedAdmin('moderator', false);
      const unvettedSuper = await seedAdmin('superadmin', false);

      await setAside(adultFile.id, editor).expect(403);
      const missing = await setAside('no-such-media', unvetted).expect(404);
      const hidden = await setAside(minorFile.id, unvetted).expect(404);
      expect(hidden.body).toEqual(missing.body);
      const coded = await setAside(adultFile.id, unvetted).expect(403);
      expect(coded.body.code).toBe('child_safety_vetting_required');
      await setAside(adultFile.id, unvettedSuper).expect(403);

      expect(await prisma().suspectedIllegalMedia.count()).toBe(0);
      expect(await prisma().postMedia.count({ where: { status: 'rejected' } })).toBe(0);
      expect(await prisma().adminActionLog.count({ where: { action: 'media.suspected_illegal_set_aside' } })).toBe(0);

      // a vetted admin may act on a minor's file
      const vetted = await seedAdmin('moderator', true);
      await setAside(minorFile.id, vetted).expect(201);
      expect(await record(minorFile.id)).toMatchObject({ uploaderIsMinor: true });
    });

    it('records the uploader country (derived, else declared) as a snapshot', async () => {
      const u = await seedUser('a', { declaredCountry: 'NG', derivedCountry: 'GB', countryDerivationMethod: 'geolite2_local', countryDerivedAt: NOW });
      const u2 = await seedUser('b', { declaredCountry: 'US' });
      const a = await seedMedia(u);
      const b = await seedMedia(u2);
      const admin = await seedAdmin('moderator', true);
      await setAside(a.id, admin).expect(201);
      await setAside(b.id, admin).expect(201);
      expect(await record(a.id)).toMatchObject({ uploaderCountry: 'GB' });
      expect(await record(b.id)).toMatchObject({ uploaderCountry: 'US' });
    });

    it('GET /admin/media-review/:id shows the record id and status, read only', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      // GET only serves files that have been through the queue (existing rule)
      await prisma().postMedia.update({ where: { id: m.id }, data: { reviewEnteredAt: NOW, reviewEntrySource: 'auto_check' } });
      const admin = await seedAdmin('moderator', true);
      const before = await request(http()).get(`/admin/media-review/${m.id}`).set(admin.auth).expect(200);
      expect(before.body.suspectedIllegalRecord).toBeNull();
      const created = await setAside(m.id, admin).expect(201);
      const after = await request(http()).get(`/admin/media-review/${m.id}`).set(admin.auth).expect(200);
      expect(after.body.suspectedIllegalRecord).toEqual({ id: created.body.id, status: 'set_aside' });
    });
  });

  // =================================================================================================
  describe('the filing routes', () => {
    async function aside(over: Record<string, unknown> = {}) {
      const u = await seedUser('a', { declaredCountry: 'GB' });
      const m = await seedMedia(u);
      const admin = await seedAdmin('moderator', true);
      const created = await setAside(m.id, admin, { reason: 'r', ...over }).expect(201);
      return { u, m, admin, id: created.body.id as string };
    }

    it('lists and shows a record with suggested bodies by country and a signed link while the object exists', async () => {
      const { admin, id, m } = await aside();
      const list = await request(http()).get('/admin/suspected-illegal-media').set(admin.auth).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].suggestedBodies.map((b: { key: string }) => b.key)).toEqual(expect.arrayContaining(['iwf', 'nca']));
      const detail = await request(http()).get(`/admin/suspected-illegal-media/${id}`).set(admin.auth).expect(200);
      expect(detail.body).toMatchObject({ id, mediaId: m.id, status: 'set_aside' });
      expect(detail.body.suggestedBodies.length).toBeGreaterThan(0);
      expect(typeof detail.body.viewUrl === 'string' || detail.body.viewUrl === null).toBe(true);
      await request(http()).get('/admin/suspected-illegal-media/00000000-0000-4000-8000-000000000000').set(admin.auth).expect(404);
    });

    it('filtering by status works and the list is vetted-admin only', async () => {
      const { admin, id } = await aside();
      const unvetted = await seedAdmin('moderator', false);
      const editor = await seedAdmin('editor', true);
      await request(http()).get('/admin/suspected-illegal-media').set(unvetted.auth).expect(403);
      await request(http()).get(`/admin/suspected-illegal-media/${id}`).set(unvetted.auth).expect(403);
      await request(http()).get('/admin/suspected-illegal-media').set(editor.auth).expect(403);
      expect((await request(http()).get('/admin/suspected-illegal-media?status=filed').set(admin.auth).expect(200)).body.items).toHaveLength(0);
      expect((await request(http()).get('/admin/suspected-illegal-media?status=set_aside').set(admin.auth).expect(200)).body.items).toHaveLength(1);
    });

    it('records FILED with the body, the reference and the time; audit row carries the body but not the reference; then 409 on any second decision', async () => {
      const { admin, id } = await aside();
      const res = await request(http())
        .post(`/admin/suspected-illegal-media/${id}/filed`)
        .set(admin.auth)
        .send({ bodyKey: 'iwf', reference: 'REF-12345', note: 'filed by phone' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'filed', bodyKey: 'iwf', reference: 'REF-12345', decidedByAdminId: admin.id });
      expect(res.body.filedAt).toBeTruthy();
      const log = await prisma().adminActionLog.findMany({ where: { action: 'media.suspected_illegal_filed' } });
      expect(log).toHaveLength(1);
      expect(log[0].notes).toContain('body=iwf');
      expect(log[0].notes).not.toContain('REF-12345');

      await request(http()).post(`/admin/suspected-illegal-media/${id}/filed`).set(admin.auth).send({ bodyKey: 'nca', reference: 'x' }).expect(409);
      await request(http()).post(`/admin/suspected-illegal-media/${id}/not-filed`).set(admin.auth).send({ reason: 'a long enough reason' }).expect(409);
    });

    it('"other" needs a body name; a filing time in the future is refused', async () => {
      const { admin, id } = await aside();
      const url = `/admin/suspected-illegal-media/${id}/filed`;
      await request(http()).post(url).set(admin.auth).send({ bodyKey: 'other', reference: 'x' }).expect(400);
      await request(http())
        .post(url)
        .set(admin.auth)
        .send({ bodyKey: 'iwf', reference: 'x', filedAt: new Date(NOW.getTime() + 30 * DAY).toISOString() })
        .expect(400);
      await request(http()).post(url).set(admin.auth).send({ bodyKey: 'other', bodyOther: 'Some national hotline', reference: 'x' }).expect(200);
    });

    it('records NOT FILED with the reason, and an unvetted admin cannot record anything', async () => {
      const { admin, id } = await aside();
      const unvetted = await seedAdmin('moderator', false);
      await request(http()).post(`/admin/suspected-illegal-media/${id}/not-filed`).set(unvetted.auth).send({ reason: 'a long enough reason' }).expect(403);
      const res = await request(http())
        .post(`/admin/suspected-illegal-media/${id}/not-filed`)
        .set(admin.auth)
        .send({ reason: 'counsel advised no filing' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'not_filed', notFiledReason: 'counsel advised no filing' });
      const log = await prisma().adminActionLog.findMany({ where: { action: 'media.suspected_illegal_not_filed' } });
      expect(log).toHaveLength(1);
      expect(log[0].notes ?? '').not.toContain('counsel advised');
    });

    it('two admins deciding at once: exactly one wins', async () => {
      const { admin, id } = await aside();
      const other = await seedAdmin('superadmin', true);
      const results = await Promise.all([
        request(http()).post(`/admin/suspected-illegal-media/${id}/filed`).set(admin.auth).send({ bodyKey: 'iwf', reference: 'a' }),
        request(http()).post(`/admin/suspected-illegal-media/${id}/not-filed`).set(other.auth).send({ reason: 'a long enough reason' }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });
  });

  // =================================================================================================
  describe('protection: every private-object deletion path honours a record', () => {
    it('post deleted by its author: the row goes, the object stays and is deferred; the sweep deletes it only after protection ends', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id, status: 'rejected' });
      const admin = await seedAdmin('moderator', true);
      const rec = await recordFor(m, admin);

      await request(http()).delete(`/posts/${post.id}`).set(u.auth).expect(204);
      expect(await prisma().postMedia.count({ where: { id: m.id } })).toBe(0);
      expect(storage.has(m.priv)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: m.priv, mediaId: m.id }]);

      // set_aside: protected even long after the preservation date
      expect(await sweep().processDeferred(new Date(NOW.getTime() + 800 * DAY))).toMatchObject({ deleted: 0, stillProtected: 1 });
      expect(storage.has(m.priv)).toBe(true);

      // decided, but inside the preservation period: still protected
      await prisma().suspectedIllegalMedia.update({
        where: { id: rec.id },
        data: { status: 'not_filed', notFiledReason: 'decided', decidedAt: NOW, decidedByAdminId: admin.id },
      });
      expect(await sweep().processDeferred(new Date(NOW.getTime() + 100 * DAY))).toMatchObject({ deleted: 0, stillProtected: 1 });
      expect(storage.has(m.priv)).toBe(true);

      // decided and past preserveUntil: free
      expect(await sweep().processDeferred(new Date(NOW.getTime() + 366 * DAY))).toMatchObject({ deleted: 1, stillProtected: 0 });
      expect(storage.has(m.priv)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });

    it('DELETE /media/uploads/:id: the row goes, the object stays', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u, { status: 'rejected' });
      await recordFor(m, await seedAdmin('moderator', true));
      await request(http()).delete(`/media/uploads/${m.id}`).set(u.auth).expect(204);
      expect(storage.has(m.priv)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: m.priv, mediaId: m.id }]);
    });

    it('unattached purge: the file and the row are left whole', async () => {
      const u = await seedUser('a');
      const free = await seedMedia(u, { status: 'rejected' });
      const kept = await seedMedia(u, { status: 'rejected' });
      await recordFor(kept, await seedAdmin('moderator', true));
      const r = await app.get(PostMediaService).purgeUnattached(NOW);
      expect(r).toEqual({ purged: 1, failed: 0, heldBack: 1 });
      expect(storage.has(free.priv)).toBe(false);
      expect(storage.has(kept.priv)).toBe(true);
      expect(await prisma().postMedia.count({ where: { id: kept.id } })).toBe(1);
    });

    it('quarantine purge: a protected file is left whole, with its leftover original', async () => {
      const u = await seedUser('a');
      const free = await seedMedia(u, { status: 'rejected', quarantine: true });
      const kept = await seedMedia(u, { status: 'rejected', quarantine: true });
      await recordFor(kept, await seedAdmin('moderator', true));
      expect(await app.get(PostMediaService).purgeQuarantine(NOW)).toEqual({ purged: 1 });
      expect(storage.has(free.priv)).toBe(false);
      expect(storage.has(kept.priv)).toBe(true);
      expect(storage.has(`quarantine/${u.id}/${kept.id}`)).toBe(true);
    });

    it('account anonymised: the user\'s own file is deleted EXCEPT the protected one, which is deferred', async () => {
      const u = await seedUser('a');
      const free = await seedMedia(u, { status: 'rejected' });
      const kept = await seedMedia(u, { status: 'rejected' });
      await recordFor(kept, await seedAdmin('moderator', true));
      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, NOW);
      expect(await prisma().postMedia.count({ where: { uploaderId: u.id } })).toBe(0);
      expect(storage.has(free.priv)).toBe(false);
      expect(storage.has(kept.priv)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: kept.priv, mediaId: kept.id }]);
      // the record has no foreign key to the user: it is untouched by the anonymisation
      expect(await prisma().suspectedIllegalMedia.count({ where: { mediaId: kept.id } })).toBe(1);
    });

    it('account purged: what is left under the user\'s prefixes is deleted, but a protected file\'s object is not', async () => {
      const u = await seedUser('gone', { accountStatus: 'deleted', anonymizedAt: new Date(NOW.getTime() - 40 * DAY), dateOfBirth: null });
      const keyProtected = `private-media/${u.id}/protected.jpg`;
      const keyFree = `private-media/${u.id}/leftover.jpg`;
      storage.put(keyProtected, Buffer.from('x'), 'image/jpeg');
      storage.put(keyFree, Buffer.from('x'), 'image/jpeg');
      const admin = await seedAdmin('moderator', true);
      await prisma().suspectedIllegalMedia.create({
        data: {
          mediaId: 'protected',
          uploaderId: u.id,
          objectKey: keyProtected,
          kind: 'image',
          reason: 'e2e',
          setAsideByAdminId: admin.id,
          setAsideAt: NOW,
          preserveUntil: new Date(NOW.getTime() + 365 * DAY),
        } as never,
      });
      const r = await app.get(AnonymizedRowPurgeService).purgeAnonymizedRows(NOW);
      expect(r.erroredUserIds).toEqual([]);
      expect(storage.has(keyFree)).toBe(false);
      expect(storage.has(keyProtected)).toBe(true);
    });

    it('the stray sweep never deletes a set-aside file\'s object, even with no database row and past the minimum age', async () => {
      const u = await seedUser('a');
      const key = `private-media/${u.id}/gone-row.jpg`;
      storage.put(key, Buffer.from('x'), 'image/jpeg');
      storage.modified.set(key, new Date(NOW.getTime() - 60 * DAY));
      const admin = await seedAdmin('moderator', true);
      await prisma().suspectedIllegalMedia.create({
        data: {
          mediaId: 'gone-row',
          uploaderId: u.id,
          objectKey: key,
          kind: 'image',
          reason: 'e2e',
          setAsideByAdminId: admin.id,
          setAsideAt: NOW,
          preserveUntil: new Date(NOW.getTime() + 365 * DAY),
        } as never,
      });
      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 0, skippedSetAside: 1 });
      expect(storage.has(key)).toBe(true);
    });

    it('B-290: a removed post\'s private copy is not deleted at closure while a record protects it', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id, status: 'approved' });
      const admin = await seedAdmin('moderator', true);
      const report = await prisma().report.create({
        data: { targetType: 'post', targetId: post.id, reason: 'e2e', status: 'reviewed', reviewedAt: new Date('2026-01-01T00:00:00Z') } as never,
      });
      await prisma().post.update({ where: { id: post.id }, data: { removedByModerationAt: NOW, removedByReportId: report.id } });
      // the withdrawn state: no public copy, a private copy is kept
      await prisma().postMedia.update({ where: { id: m.id }, data: { publishedAt: null, privateKey: m.priv } });
      storage.objects.delete(m.pub);
      storage.put(m.priv, Buffer.from('x'.repeat(10)), 'image/jpeg');

      const rec = await recordFor(m, admin);
      expect(await sweep().confirmModerationRemovals(NOW)).toMatchObject({ deleted: 0, waiting: 1 });
      expect(storage.has(m.priv)).toBe(true);

      // protection ends: decided and past preserveUntil
      await prisma().suspectedIllegalMedia.update({
        where: { id: rec.id },
        data: { status: 'filed', bodyKey: 'iwf', reference: 'x', filedAt: NOW, decidedAt: NOW, decidedByAdminId: admin.id },
      });
      expect(await sweep().confirmModerationRemovals(new Date(NOW.getTime() + 400 * DAY))).toMatchObject({ deleted: 1, waiting: 0 });
      expect(storage.has(m.priv)).toBe(false);
    });

    it('the retention sweep keeps a report that is the record\'s own filing context, and one on a post whose media has an active record', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id, status: 'rejected' });
      const admin = await seedAdmin('moderator', true);
      const old = new Date('2015-01-01T00:00:00Z');
      const onPost = await prisma().report.create({ data: { targetType: 'post', targetId: post.id, reason: 'e2e', status: 'reviewed', reviewedAt: old } as never });
      const named = await prisma().report.create({ data: { targetType: 'user', targetId: u.id, reason: 'e2e', status: 'reviewed', reviewedAt: old } as never });
      const rec = await recordFor(m, admin, { reportId: named.id });

      const kept = await app.get(ReportRetentionService).purgeDue(NOW);
      expect(kept.skippedMedia).toBeGreaterThanOrEqual(2);
      expect(await prisma().report.count({ where: { id: { in: [onPost.id, named.id] } } })).toBe(2);

      // once the record is decided and past its preservation date, the reports become purgeable
      await prisma().suspectedIllegalMedia.update({
        where: { id: rec.id },
        data: { status: 'not_filed', notFiledReason: 'decided', decidedAt: NOW, decidedByAdminId: admin.id },
      });
      await app.get(ReportRetentionService).purgeDue(new Date(NOW.getTime() + 400 * DAY));
      expect(await prisma().report.count({ where: { id: named.id } })).toBe(0);
    });
  });
});
