import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaCheckService } from '../src/modules/post-media/media-check.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor, makeJpeg } from './support/post-media-doubles';

// backend/w15-media-review-queue (B-037; Decision Log #419 item 4), against the REAL app and REAL Postgres.
// The object store, Rekognition and the video tools are the same in-memory doubles the W14 pipeline spec
// uses; images go through the real sharp. The clock is fake and the cron jobs are stopped, so only the
// explicit calls below advance anything.

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

const SUGGESTIVE = [{ name: 'Suggestive', parentName: null, confidence: 60 }]; // between pass (40) and reject (90): needs a person
const EXPLICIT = [{ name: 'Explicit', parentName: null, confidence: 99 }]; // auto-rejected

describe('Media review queue e2e (B-037)', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  const processor = new TestMediaProcessor();
  const moderation = new FakeModerationClient();
  let clockNow = new Date('2026-11-05T10:00:00Z');
  const fakeClock = { now: () => new Date(clockNow) };
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();
  const advance = (ms: number) => {
    clockNow = new Date(clockNow.getTime() + ms);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(fakeClock)
      .overrideProvider(StorageService)
      .useValue(storage)
      .overrideProvider(DirectUploadStorageService)
      .useValue(storage)
      .overrideProvider(MediaProcessor)
      .useValue(processor)
      .overrideProvider(MediaModerationClient)
      .useValue(moderation)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    clockNow = new Date('2026-11-05T10:00:00Z');
    storage.objects.clear();
    storage.issuedLinks.length = 0;
    storage.issuedViewLinks.length = 0;
    storage.unavailable = false;
    storage.failCopy = false;
    storage.corruptCopyTo = null;
    storage.copies.length = 0;
    storage.failDeleteFor.clear();
    moderation.configured = true;
    moderation.labelsFor = () => [];
    moderation.failTimes = 0;
    moderation.onCall = null;
    moderation.calls.length = 0;
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

  async function seedUser(label: string): Promise<U> {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-review-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `r_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: bearer(accessToken.token) };
  }

  async function adminAuth(role: 'moderator' | 'superadmin' | 'editor' = 'moderator'): Promise<{ id: string; auth: { Authorization: string } }> {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-review-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Review Admin', role },
    });
    return { id: admin.id, auth: bearer((await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token) };
  }

  /** Uploads a picture end to end (link, the browser's PUT, confirm) and returns its id. */
  async function upload(u: U): Promise<string> {
    const buf = await makeJpeg({ width: 10 + Math.floor(Math.random() * 20) });
    const res = await request(http()).post('/media/uploads').set(u.auth).send({ contentType: 'image/jpeg', size: buf.length }).expect(201);
    storage.put(`quarantine/${u.id}/${res.body.id}`, buf, 'image/jpeg');
    await request(http()).post(`/media/uploads/${res.body.id}/confirm`).set(u.auth).expect(200);
    return res.body.id as string;
  }

  const runChecks = () => app.get(MediaCheckService).runDueChecks(new Date(clockNow));
  const row = (id: string) => prisma().postMedia.findUniqueOrThrow({ where: { id } });

  /** Uploads and runs the check with the given labels. */
  async function uploadChecked(u: U, labels: typeof SUGGESTIVE | []): Promise<string> {
    moderation.labelsFor = () => labels;
    const id = await upload(u);
    await runChecks();
    return id;
  }

  async function postWith(u: U, mediaIds: string[]): Promise<string> {
    const res = await request(http()).post('/posts').set(u.auth).send({ contentText: 'a post with media', mediaIds }).expect(201);
    return res.body.id as string;
  }

  const getPost = (viewer: U, postId: string) => request(http()).get(`/posts/${postId}`).set(viewer.auth);
  const notificationsOf = async (u: U) => (await request(http()).get('/notifications').set(u.auth).expect(200)).body.items as Array<{ type: string; data: unknown }>;

  // ---- the queue holds only what needs a person --------------------------------------------------

  describe('which items are in the queue', () => {
    it('an uncertain item enters it; an auto-approved and an auto-rejected one never do', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const uncertain = await uploadChecked(owner, SUGGESTIVE);
      const approved = await uploadChecked(owner, []);
      const rejected = await uploadChecked(owner, EXPLICIT as never);

      expect((await row(approved)).status).toBe('approved');
      expect((await row(rejected)).status).toBe('rejected');
      expect((await row(uncertain)).reviewEntrySource).toBe('auto_check');

      const list = await request(http()).get('/admin/media-review').set(mod.auth).expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([uncertain]);
      const item = list.body.items[0];
      expect(item).toMatchObject({
        kind: 'image',
        status: 'pending',
        awaitingDecision: true,
        sources: ['auto_check'],
        reportCount: 0,
        checkLabels: ['Suggestive'],
      });
      // B-257: a pending item is viewed from the PRIVATE prefix; there is no public object for it.
      expect(item.viewUrl).toContain('https://view.test/private-media/');
      expect(item.viewUrl).not.toContain('/post-media/');
      expect(item.ageSeconds).toBeGreaterThanOrEqual(0);

      // The uploader appears by public name and id only: no email, no real name.
      expect(item.uploader).toEqual({ id: owner.id, publicName: expect.stringMatching(/^r_owner_/) });
      const text = JSON.stringify(list.body);
      expect(text).not.toContain('@example.com');
      expect(text).not.toContain('Real Name');
    });

    it('an item still waiting for its automatic check is not in the queue', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await upload(owner); // confirmed, check not yet run
      const list = await request(http()).get('/admin/media-review').set(mod.auth).expect(200);
      expect(list.body.items).toEqual([]);
      await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(409);
      await request(http()).get(`/admin/media-review/${id}`).set(mod.auth).expect(404);
      expect((await row(id)).status).toBe('pending');
    });

    it('when the check is not configured at all, an upload that waited 30 minutes goes to the queue; nothing is approved', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      moderation.configured = false;
      const id = await upload(owner);
      await runChecks();
      expect((await row(id)).reviewEnteredAt).toBeNull(); // not yet 30 minutes
      advance(31 * 60_000);
      await runChecks();
      const after = await row(id);
      expect(after).toMatchObject({ status: 'pending', decisionSource: null, reviewEntrySource: 'auto_check' });
      const list = await request(http()).get('/admin/media-review').set(mod.auth).expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([id]);
      expect(list.body.items[0].checkLabels).toEqual([]);
    });

    it('a check that gives up after its retries sends the item to the queue', async () => {
      const owner = await seedUser('owner');
      moderation.failTimes = 99;
      const id = await upload(owner);
      for (let i = 0; i < 6; i++) {
        await runChecks();
        advance(2 * 3600_000);
      }
      const after = await row(id);
      expect(after.checkState).toBe('gave_up');
      expect(after).toMatchObject({ status: 'pending', reviewEntrySource: 'auto_check' });
    });
  });

  // ---- listing -----------------------------------------------------------------------------------

  describe('GET /admin/media-review', () => {
    it('pages with an opaque cursor, newest or oldest first, and filters by source and status', async () => {
      const owner = await seedUser('owner');
      const reporter = await seedUser('rep');
      const mod = await adminAuth();
      const a = await uploadChecked(owner, SUGGESTIVE);
      const b = await uploadChecked(owner, SUGGESTIVE);
      const c = await uploadChecked(owner, SUGGESTIVE);

      const first = await request(http()).get('/admin/media-review?limit=2').set(mod.auth).expect(200);
      expect(first.body.items.map((i: { id: string }) => i.id)).toEqual([c, b]);
      expect(typeof first.body.nextCursor).toBe('string');
      const second = await request(http()).get(`/admin/media-review?limit=2&cursor=${first.body.nextCursor}`).set(mod.auth).expect(200);
      expect(second.body.items.map((i: { id: string }) => i.id)).toEqual([a]);
      expect(second.body.nextCursor).toBeNull();

      const oldest = await request(http()).get('/admin/media-review?order=oldest').set(mod.auth).expect(200);
      expect(oldest.body.items.map((i: { id: string }) => i.id)).toEqual([a, b, c]);

      // An approved, attached, reported item arrives from the OTHER source.
      const good = await uploadChecked(owner, []);
      const post = await postWith(owner, [good]);
      await request(http()).post(`/media/${good}/report`).set(reporter.auth).expect(200);
      expect(post).toBeTruthy();

      const reported = await request(http()).get('/admin/media-review?source=user_report').set(mod.auth).expect(200);
      expect(reported.body.items.map((i: { id: string }) => i.id)).toEqual([good]);
      expect(reported.body.items[0]).toMatchObject({ status: 'approved', awaitingDecision: true, sources: ['user_report'], reportCount: 1 });
      const auto = await request(http()).get('/admin/media-review?source=auto_check').set(mod.auth).expect(200);
      expect(auto.body.items.map((i: { id: string }) => i.id)).toEqual([c, b, a]);

      // Decided items move to the approved / rejected filters and out of the default queue.
      await request(http()).post(`/admin/media-review/${a}/approve`).set(mod.auth).expect(200);
      await request(http()).post(`/admin/media-review/${b}/reject`).set(mod.auth).send({ reason: 'Not suitable' }).expect(200);
      const approvedList = await request(http()).get('/admin/media-review?status=approved').set(mod.auth).expect(200);
      expect(approvedList.body.items.map((i: { id: string }) => i.id)).toEqual([a]);
      const rejectedList = await request(http()).get('/admin/media-review?status=rejected').set(mod.auth).expect(200);
      expect(rejectedList.body.items.map((i: { id: string }) => i.id)).toEqual([b]);
      expect(rejectedList.body.items[0]).toMatchObject({ awaitingDecision: false, decisionSource: 'moderator', rejectionReason: 'Not suitable' });
      const pending = await request(http()).get('/admin/media-review').set(mod.auth).expect(200);
      expect(pending.body.items.map((i: { id: string }) => i.id).sort()).toEqual([c, good].sort());
    });

    it('is closed to editors, to users and to anonymous callers', async () => {
      const user = await seedUser('u');
      const editor = await adminAuth('editor');
      await request(http()).get('/admin/media-review').set(editor.auth).expect(403);
      await request(http()).get('/admin/media-review/stats').set(editor.auth).expect(403);
      await request(http()).get('/admin/media-review').set(user.auth).expect(401);
      await request(http()).get('/admin/media-review').expect(401);
      const superadmin = await adminAuth('superadmin');
      await request(http()).get('/admin/media-review').set(superadmin.auth).expect(200);
    });
  });

  // ---- decisions ---------------------------------------------------------------------------------

  describe('approve and reject', () => {
    it('approve: the item is approved by a moderator, the uploader is notified, the action is logged, and a repeat is a 409 that adds nothing', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);

      const res = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(200);
      expect(res.body).toEqual({ id, outcome: 'approved', status: 'approved' });
      expect(await row(id)).toMatchObject({ status: 'approved', decisionSource: 'moderator', decidedBy: mod.id });

      const notes = await notificationsOf(owner);
      expect(notes.filter((n) => n.type === 'post_media_approved')).toEqual([
        expect.objectContaining({ data: { media: { id, kind: 'image' } } }),
      ]);
      const log = await prisma().adminActionLog.findMany({ where: { targetId: id } });
      expect(log).toEqual([expect.objectContaining({ adminId: mod.id, action: 'media.approved', targetType: 'post_media' })]);

      const again = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(409);
      expect(again.body.code).toBe('already_decided');
      const rejectAfter = await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'late' }).expect(409);
      expect(rejectAfter.body.code).toBe('already_decided');
      expect((await notificationsOf(owner)).filter((n) => n.type.startsWith('post_media_'))).toHaveLength(1);
      expect(await prisma().adminActionLog.count({ where: { targetId: id } })).toBe(1);
    });

    it('reject: needs a reason; the uploader (and only the uploader) can read it; a repeat is a 409 with no second notification', async () => {
      const owner = await seedUser('owner');
      const other = await seedUser('other');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);

      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({}).expect(400);
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: '   ' }).expect(400);
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'x'.repeat(301) }).expect(400);
      expect((await row(id)).status).toBe('pending');

      const res = await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: '  Shows a private address  ' }).expect(200);
      expect(res.body).toEqual({ id, outcome: 'rejected', status: 'rejected' });
      expect(await row(id)).toMatchObject({ status: 'rejected', decisionSource: 'moderator', rejectionReason: 'Shows a private address' });

      // The uploader reads the reason on their own upload ...
      const own = await request(http()).get(`/media/uploads/${id}`).set(owner.auth).expect(200);
      expect(own.body).toMatchObject({ status: 'rejected', rejectionReason: 'Shows a private address' });
      // ... nobody else can, and the notification does not carry it.
      await request(http()).get(`/media/uploads/${id}`).set(other.auth).expect(404);
      const notes = await notificationsOf(owner);
      const rejectedNote = notes.find((n) => n.type === 'post_media_rejected');
      expect(rejectedNote?.data).toEqual({ media: { id, kind: 'image' } });
      expect(JSON.stringify(notes)).not.toContain('private address');
      expect(await notificationsOf(other)).toEqual([]);

      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'again' }).expect(409);
      expect(notes.filter((n) => n.type === 'post_media_rejected')).toHaveLength(1);
      expect((await notificationsOf(owner)).filter((n) => n.type === 'post_media_rejected')).toHaveLength(1);
      expect(await prisma().adminActionLog.count({ where: { targetId: id } })).toBe(1);
    });

    it('two moderators acting at once: exactly one wins, one notification, one audit row', async () => {
      const owner = await seedUser('owner');
      const m1 = await adminAuth();
      const m2 = await adminAuth('superadmin');
      const id = await uploadChecked(owner, SUGGESTIVE);
      const [a, b] = await Promise.all([
        request(http()).post(`/admin/media-review/${id}/approve`).set(m1.auth),
        request(http()).post(`/admin/media-review/${id}/reject`).set(m2.auth).send({ reason: 'race' }),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect((await notificationsOf(owner)).filter((n) => n.type.startsWith('post_media_'))).toHaveLength(1);
      expect(await prisma().adminActionLog.count({ where: { targetId: id } })).toBe(1);
    });

    it('a moderator decision cannot be overwritten by the automatic check finishing later', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      moderation.configured = false;
      const id = await upload(owner);
      advance(31 * 60_000);
      await runChecks(); // unchecked -> queue
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'No' }).expect(200);
      moderation.configured = true;
      moderation.labelsFor = () => [];
      await runChecks(); // would auto-approve a clean image, but it is decided
      expect(await row(id)).toMatchObject({ status: 'rejected', decisionSource: 'moderator' });
    });
  });

  // ---- what a decision does to the post ----------------------------------------------------------

  describe('post visibility', () => {
    it('approving the last outstanding file makes the post visible; until then only the author sees it', async () => {
      const author = await seedUser('author');
      const viewer = await seedUser('viewer');
      const mod = await adminAuth();
      const clean = await uploadChecked(author, []);
      const uncertain = await uploadChecked(author, SUGGESTIVE);
      const post = await postWith(author, [clean, uncertain]);

      await getPost(viewer, post).expect(404);
      await getPost(author, post).expect(200);
      await request(http()).post(`/admin/media-review/${uncertain}/approve`).set(mod.auth).expect(200);
      await getPost(viewer, post).expect(200);
    });

    it('a rejected file keeps the post author-only until the uploader removes that file', async () => {
      const author = await seedUser('author');
      const viewer = await seedUser('viewer');
      const mod = await adminAuth();
      const clean = await uploadChecked(author, []);
      const uncertain = await uploadChecked(author, SUGGESTIVE);
      const post = await postWith(author, [clean, uncertain]);

      await request(http()).post(`/admin/media-review/${uncertain}/reject`).set(mod.auth).send({ reason: 'Not suitable' }).expect(200);
      await getPost(viewer, post).expect(404);
      await getPost(author, post).expect(200);
      await request(http()).delete(`/media/uploads/${uncertain}`).set(author.auth).expect(204);
      await getPost(viewer, post).expect(200);
    });
  });

  // ---- user reports ------------------------------------------------------------------------------

  describe('POST /media/:id/report', () => {
    async function visibleApprovedItem() {
      const author = await seedUser('author');
      const media = await uploadChecked(author, []);
      const post = await postWith(author, [media]);
      return { author, media, post };
    }

    it('one report puts an approved item in the queue and it STAYS visible; a repeat by the same user changes nothing', async () => {
      const { media, post } = await visibleApprovedItem();
      const reporter = await seedUser('rep');
      const viewer = await seedUser('viewer');

      const res = await request(http()).post(`/media/${media}/report`).set(reporter.auth).expect(200);
      expect(res.body).toEqual({ reported: true, alreadyReported: false });
      expect(await row(media)).toMatchObject({ status: 'approved', reportCount: 1, hiddenPendingReview: false, reviewEntrySource: 'user_report' });
      await getPost(viewer, post).expect(200);

      const again = await request(http()).post(`/media/${media}/report`).set(reporter.auth).expect(200);
      expect(again.body).toEqual({ reported: true, alreadyReported: true });
      expect((await row(media)).reportCount).toBe(1);
      expect(await prisma().postMediaReport.count({ where: { mediaId: media } })).toBe(1);
    });

    it('the third distinct reporter hides the item and its post from everyone but the author, until a moderator decides', async () => {
      const { author, media, post } = await visibleApprovedItem();
      const mod = await adminAuth();
      const viewer = await seedUser('viewer');
      const reporters: U[] = [];
      for (const label of ['r1', 'r2', 'r3']) {
        const reporter = await seedUser(label);
        reporters.push(reporter);
        await request(http()).post(`/media/${media}/report`).set(reporter.auth).expect(200);
      }
      expect(await row(media)).toMatchObject({ reportCount: 3, hiddenPendingReview: true });
      // B-257: held by reports -> the file is moved out of the public prefix into the private one.
      expect(storage.has(`post-media/${author.id}/${media}.jpg`)).toBe(false);
      expect(storage.has(`private-media/${author.id}/${media}.jpg`)).toBe(true);
      expect(await row(media)).toMatchObject({ publishedAt: null, privateKey: `private-media/${author.id}/${media}.jpg` });
      await getPost(viewer, post).expect(404);
      await getPost(author, post).expect(200);
      // A hidden item can no longer be reported (nobody else can see it).
      await request(http()).post(`/media/${media}/report`).set((await seedUser('r4')).auth).expect(404);

      // Keep it: the hold lifts, the reports resolve, the uploader hears nothing.
      const kept = await request(http()).post(`/admin/media-review/${media}/approve`).set(mod.auth).expect(200);
      expect(kept.body).toEqual({ id: media, outcome: 'kept', status: 'approved' });
      expect(await row(media)).toMatchObject({ status: 'approved', reportCount: 0, hiddenPendingReview: false });
      // keeping it publishes it again (copy + verify) and removes the private original
      expect(storage.has(`post-media/${author.id}/${media}.jpg`)).toBe(true);
      expect(storage.has(`private-media/${author.id}/${media}.jpg`)).toBe(false);
      expect((await row(media)).publishedAt).not.toBeNull();
      expect(await prisma().postMediaReport.count({ where: { mediaId: media, resolvedAt: null } })).toBe(0);
      await getPost(viewer, post).expect(200);
      expect((await notificationsOf(author)).filter((n) => n.type.startsWith('post_media_'))).toHaveLength(1); // only the original auto-approval
      expect(await prisma().adminActionLog.findFirstOrThrow({ where: { targetId: media } })).toMatchObject({ notes: 'kept after user reports' });
      // A user who reported before cannot report the same item again, even after it was resolved.
      const again = await request(http()).post(`/media/${media}/report`).set(reporters[0].auth).expect(200);
      expect(again.body.alreadyReported).toBe(true);
    });

    it('rejecting a reported approved item rejects it for good: the post stays author-only and the uploader is told', async () => {
      const { author, media, post } = await visibleApprovedItem();
      const mod = await adminAuth();
      const viewer = await seedUser('viewer');
      await request(http()).post(`/media/${media}/report`).set((await seedUser('r1')).auth).expect(200);
      await request(http()).post(`/admin/media-review/${media}/reject`).set(mod.auth).send({ reason: 'Contains a minor without consent' }).expect(200);
      expect(await row(media)).toMatchObject({ status: 'rejected', reportCount: 0, rejectionReason: 'Contains a minor without consent' });
      // B-257: a rejected file leaves the public prefix and is KEPT, private (never deleted)
      expect(storage.has(`post-media/${author.id}/${media}.jpg`)).toBe(false);
      expect(storage.has(`private-media/${author.id}/${media}.jpg`)).toBe(true);
      expect((await row(media)).publishedAt).toBeNull();
      await getPost(viewer, post).expect(404);
      expect((await notificationsOf(author)).filter((n) => n.type === 'post_media_rejected')).toHaveLength(1);
    });

    it('refuses your own file (400) and gives a stranger the same 404 for a pending, unattached or unknown file', async () => {
      const { author, media } = await visibleApprovedItem();
      const stranger = await seedUser('stranger');
      const res = await request(http()).post(`/media/${media}/report`).set(author.auth).expect(400);
      expect(res.body.code).toBe('cannot_report_own_media');

      const pending = await uploadChecked(author, SUGGESTIVE);
      const unattached = await uploadChecked(author, []);
      const unknown = '00000000-0000-4000-8000-000000000000';
      const bodies = [];
      for (const id of [pending, unattached, unknown]) {
        const r = await request(http()).post(`/media/${id}/report`).set(stranger.auth).expect(404);
        bodies.push(r.body);
      }
      expect(new Set(bodies.map((b) => JSON.stringify({ ...b, message: undefined }))).size).toBe(1);
      expect(await prisma().postMediaReport.count()).toBe(0);
    });

    it('a blocked pair gets the same 404, in either direction', async () => {
      const { author, media } = await visibleApprovedItem();
      const reporter = await seedUser('rep');
      const other = await seedUser('other');
      await request(http()).post(`/users/${author.id}/block`).set(reporter.auth).send({}).expect(200);
      await request(http()).post(`/media/${media}/report`).set(reporter.auth).expect(404);
      await request(http()).post(`/users/${other.id}/block`).set(author.auth).send({}).expect(200);
      await request(http()).post(`/media/${media}/report`).set(other.auth).expect(404);
      expect(await prisma().postMediaReport.count()).toBe(0);
    });

    it('an item on a post nobody else can see yet (unapproved sibling) cannot be reported by strangers', async () => {
      const author = await seedUser('author');
      const stranger = await seedUser('stranger');
      const clean = await uploadChecked(author, []);
      const uncertain = await uploadChecked(author, SUGGESTIVE);
      await postWith(author, [clean, uncertain]);
      await request(http()).post(`/media/${clean}/report`).set(stranger.auth).expect(404);
    });

    it('a restricted-pending account cannot report media (the general report route stays open to it)', async () => {
      const { media } = await visibleApprovedItem();
      const minor = await prisma().user.create({
        data: {
          email: `e2e-review-minor-${rand()}@example.com`,
          passwordHash: 'x',
          displayName: 'Minor',
          username: `m_${rand()}`,
          dateOfBirth: seedDob('2012-03-03'),
          isMinor: true,
          verificationStatus: 'verified',
        },
      });
      await prisma().guardian.create({
        data: {
          minorUserId: minor.id,
          name: 'G',
          email: `g-${rand()}@example.com`,
          relationship: 'Parent',
          consentToken: `c-${rand()}`,
          consentTokenExpiresAt: new Date(Date.now() + 3600_000),
          consentStatus: 'pending',
        },
      });
      const token = (await app.get(TokenService).issueTokenPair(minor.id, minor.role)).accessToken.token;
      const res = await request(http()).post(`/media/${media}/report`).set(bearer(token)).expect(403);
      expect(res.body.code).toBe('guardian_consent_pending');
    });

    it('concurrent reports by different users: every accepted one counts exactly once and the hold is set', async () => {
      const { media } = await visibleApprovedItem();
      const reporters = await Promise.all(['a', 'b', 'c', 'd'].map((l) => seedUser(l)));
      const results = await Promise.all(reporters.map((r) => request(http()).post(`/media/${media}/report`).set(r.auth)));
      // The hold threshold is 3. Once the third report commits the item is hidden, and a reporter whose
      // visibility check runs after that gets the same 404 as for any hidden item (documented in
      // post-media-report.service.ts). So which request is the late one depends on timing: at most ONE of
      // the four can be late (a 404 needs three commits first), and the other three always succeed.
      const statuses = results.map((r) => r.status);
      const accepted = statuses.filter((s) => s === 200).length;
      expect(accepted).toBeGreaterThanOrEqual(3);
      expect(statuses.filter((s) => s !== 200)).toEqual(Array(4 - accepted).fill(404));
      // The invariant under concurrency: every accepted report is counted exactly once, and the hold is set.
      expect(await row(media)).toMatchObject({ reportCount: accepted, hiddenPendingReview: true });
      expect(await prisma().postMediaReport.count({ where: { mediaId: media } })).toBe(accepted);
    });
  });

  // ---- stats -------------------------------------------------------------------------------------

  describe('GET /admin/media-review/stats', () => {
    it('counts auto-approved, auto-rejected, sent to review, reported and moderator-decided over the window, aggregates only', async () => {
      const owner = await seedUser('owner');
      const reporter = await seedUser('rep');
      const mod = await adminAuth();
      await uploadChecked(owner, []);
      const reportedMedia = await uploadChecked(owner, []);
      await postWith(owner, [reportedMedia]);
      await uploadChecked(owner, EXPLICIT as never);
      const toReview = await uploadChecked(owner, SUGGESTIVE);
      await uploadChecked(owner, SUGGESTIVE);
      await request(http()).post(`/media/${reportedMedia}/report`).set(reporter.auth).expect(200);
      await request(http()).post(`/admin/media-review/${toReview}/approve`).set(mod.auth).expect(200);
      await request(http()).post(`/admin/media-review/${reportedMedia}/reject`).set(mod.auth).send({ reason: 'No' }).expect(200);

      // AdminActionLog.createdAt is stamped by the database clock, not the app clock this spec fakes: move the rows onto the fake clock.
      await prisma().adminActionLog.updateMany({ data: { createdAt: new Date(clockNow) } });
      const res = await request(http()).get('/admin/media-review/stats').set(mod.auth).expect(200);
      expect(res.body).toMatchObject({
        windowDays: 7,
        autoApproved: 1, // the reported one was auto-approved then rejected by a moderator, so it moved
        autoRejected: 1,
        sentToReview: 2,
        reported: 1,
        decidedByModerator: 2,
      });
      expect(Object.keys(res.body).sort()).toEqual(
        ['autoApproved', 'autoRejected', 'decidedByModerator', 'from', 'reported', 'sentToReview', 'to', 'windowDays'].sort(),
      );

      // Outside the window nothing counts.
      advance(10 * 24 * 3600_000);
      const later = await request(http()).get('/admin/media-review/stats').set(mod.auth).expect(200);
      expect(later.body).toMatchObject({ autoApproved: 0, autoRejected: 0, sentToReview: 0, reported: 0, decidedByModerator: 0 });
      const wide = await request(http()).get('/admin/media-review/stats?days=30').set(mod.auth).expect(200);
      expect(wide.body).toMatchObject({ windowDays: 30, sentToReview: 2, reported: 1 });
      await request(http()).get('/admin/media-review/stats?days=91').set(mod.auth).expect(400);
    });
  });

  // ---- the view link -----------------------------------------------------------------------------

  describe('view link', () => {
    it('is short-lived and signed per request; a storage outage returns the item without a link', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);
      const one = await request(http()).get(`/admin/media-review/${id}`).set(mod.auth).expect(200);
      expect(one.body.viewUrl).toContain('ttl=300');
      expect(new Date(one.body.viewUrlExpiresAt).getTime()).toBe(clockNow.getTime() + 300_000);
      expect(storage.issuedViewLinks.at(-1)).toMatchObject({ expiresInSeconds: 300 });

      storage.unavailable = true;
      const down = await request(http()).get(`/admin/media-review/${id}`).set(mod.auth).expect(200);
      expect(down.body.viewUrl).toBeNull();
    });
  });

  // ---- B-257: private prefix, fail closed -------------------------------------------------------

  describe('private and public prefixes (B-257)', () => {
    it('approving publishes the file: a verified copy in the public prefix, the private original removed', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);
      expect(storage.has(`private-media/${owner.id}/${id}.jpg`)).toBe(true);
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);

      await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(200);

      expect(storage.copies).toEqual([[`private-media/${owner.id}/${id}.jpg`, `post-media/${owner.id}/${id}.jpg`]]);
      expect(storage.has(`post-media/${owner.id}/${id}.jpg`)).toBe(true);
      expect(storage.has(`private-media/${owner.id}/${id}.jpg`)).toBe(false);
      expect(await row(id)).toMatchObject({ status: 'approved', privateKey: null });
      expect((await row(id)).publishedAt).not.toBeNull();
    });

    it('FAILS CLOSED: if the copy fails the approval is not written, nothing is public, the moderator gets a 503, and a retry works', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);
      storage.failCopy = true;
      const res = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(503);
      expect(res.body.code).toBe('media_publish_failed');
      expect(await row(id)).toMatchObject({ status: 'pending', decisionSource: null, publishedAt: null });
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);
      expect(storage.has(`private-media/${owner.id}/${id}.jpg`)).toBe(true);
      expect((await notificationsOf(owner)).filter((n) => n.type === 'post_media_approved')).toHaveLength(0);

      storage.failCopy = false;
      await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(200);
      expect((await row(id)).status).toBe('approved');
    });

    it('a copy that does not verify (wrong size) is deleted again and nothing is approved', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);
      storage.corruptCopyTo = `post-media/${owner.id}/${id}.jpg`;
      await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(503);
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);
      expect((await row(id)).status).toBe('pending');
    });

    it('an automatic approval whose publish fails stays pending (retried), never approved', async () => {
      const owner = await seedUser('owner');
      moderation.labelsFor = () => [];
      storage.failCopy = true;
      const id = await upload(owner);
      const out = await runChecks();
      expect(out.outcomes).toEqual({ retry: 1 });
      expect(await row(id)).toMatchObject({ status: 'pending', decisionSource: null, publishedAt: null });
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);

      storage.failCopy = false;
      advance(61_000); // past the first back-off
      expect((await runChecks()).outcomes).toEqual({ approved: 1 });
      expect(storage.has(`post-media/${owner.id}/${id}.jpg`)).toBe(true);
    });

    it('rejecting a pending item moves nothing: the file stays private, and no cleanup ever deletes it (reconcile, both purges, 30 days later)', async () => {
      const owner = await seedUser('owner');
      const mod = await adminAuth();
      const id = await uploadChecked(owner, SUGGESTIVE);
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'Not suitable' }).expect(200);
      const key = `private-media/${owner.id}/${id}.jpg`;
      expect(storage.has(key)).toBe(true);

      advance(30 * 24 * 3600 * 1000);
      const { PostMediaObjectsService } = await import('../src/modules/post-media/post-media-objects.service');
      const { PostMediaService } = await import('../src/modules/post-media/post-media.service');
      await app.get(PostMediaObjectsService).reconcile();
      await app.get(PostMediaService).purgeUnattached(new Date(clockNow));
      await app.get(PostMediaService).purgeQuarantine(new Date(clockNow));

      expect(storage.has(key)).toBe(true);
      expect(await prisma().postMedia.count({ where: { id } })).toBe(1);
      expect((await row(id)).status).toBe('rejected');
    });

    it('a failed move back to the private prefix is retried by the reconciler and never loses the file', async () => {
      const author = await seedUser('author');
      const mod = await adminAuth();
      const media = await uploadChecked(author, []);
      await postWith(author, [media]);
      await request(http()).post(`/media/${media}/report`).set((await seedUser('r1')).auth).expect(200);
      storage.failCopy = true; // the withdraw cannot make its private copy
      await request(http()).post(`/admin/media-review/${media}/reject`).set(mod.auth).send({ reason: 'No' }).expect(200);
      expect(await row(media)).toMatchObject({ status: 'rejected' });
      expect(storage.has(`post-media/${author.id}/${media}.jpg`)).toBe(true); // lingering, but the DB gate already hides the post
      expect((await row(media)).publishedAt).not.toBeNull();

      storage.failCopy = false;
      const { PostMediaObjectsService } = await import('../src/modules/post-media/post-media-objects.service');
      expect((await app.get(PostMediaObjectsService).reconcile()).withdrawn).toBe(1);
      expect(storage.has(`post-media/${author.id}/${media}.jpg`)).toBe(false);
      expect(storage.has(`private-media/${author.id}/${media}.jpg`)).toBe(true);
      expect((await row(media)).publishedAt).toBeNull();
    });
  });

  // ---- B-258: reviewers of a minor's media must be child-safety vetted ---------------------------

  describe('child-safety vetting for a minor\'s items (B-258)', () => {
    async function minorItem() {
      const minor = await seedUser('minor');
      const adult = await seedUser('adult');
      const mediaMinor = await uploadChecked(minor, SUGGESTIVE);
      const mediaAdult = await uploadChecked(adult, SUGGESTIVE);
      // Uploaded while the account could upload; it is now (and for the queue's purposes) a minor's.
      await prisma().user.update({ where: { id: minor.id }, data: { isMinor: true } });
      return { minor, mediaMinor, mediaAdult };
    }
    const vet = (id: string, v: boolean) => prisma().adminUser.update({ where: { id }, data: { childSafetyVetted: v } });

    it('a NON-vetted moderator does not see the minor\'s item in the list and gets the same 404 as a missing id (never a 403)', async () => {
      const { mediaMinor, mediaAdult } = await minorItem();
      const mod = await adminAuth('moderator');
      const list = await request(http()).get('/admin/media-review').set(mod.auth).expect(200);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([mediaAdult]);

      const hidden = await request(http()).get(`/admin/media-review/${mediaMinor}`).set(mod.auth).expect(404);
      const missing = await request(http()).get('/admin/media-review/00000000-0000-0000-0000-000000000000').set(mod.auth).expect(404);
      expect(hidden.body).toEqual(missing.body); // identical: nothing leaks
      await request(http()).get(`/admin/media-review/${mediaAdult}`).set(mod.auth).expect(200);
    });

    it('a non-vetted moderator cannot approve or reject the minor\'s item (404, nothing changes, nothing logged, nothing published)', async () => {
      const { minor, mediaMinor } = await minorItem();
      const mod = await adminAuth('moderator');
      await request(http()).post(`/admin/media-review/${mediaMinor}/approve`).set(mod.auth).expect(404);
      await request(http()).post(`/admin/media-review/${mediaMinor}/reject`).set(mod.auth).send({ reason: 'x' }).expect(404);
      expect(await row(mediaMinor)).toMatchObject({ status: 'pending', decisionSource: null });
      expect(storage.keysWithPrefix(`post-media/${minor.id}/`)).toEqual([]);
      expect(await prisma().adminActionLog.count({ where: { targetId: mediaMinor } })).toBe(0);
      expect((await notificationsOf(minor)).filter((n) => n.type.startsWith('post_media_'))).toHaveLength(0);
    });

    it('a VETTED moderator sees and decides it; so does a vetted superadmin; an UNVETTED superadmin is blocked like any other', async () => {
      const { mediaMinor } = await minorItem();
      const vetted = await adminAuth('moderator');
      await vet(vetted.id, true);
      const list = await request(http()).get('/admin/media-review').set(vetted.auth).expect(200);
      expect(list.body.items).toHaveLength(2);
      await request(http()).get(`/admin/media-review/${mediaMinor}`).set(vetted.auth).expect(200);

      const unvettedSuper = await adminAuth('superadmin');
      await request(http()).get(`/admin/media-review/${mediaMinor}`).set(unvettedSuper.auth).expect(404);

      await request(http()).post(`/admin/media-review/${mediaMinor}/approve`).set(vetted.auth).expect(200);
      expect((await row(mediaMinor)).status).toBe('approved');
    });

    it('the vetting state is read fresh: revoking it takes effect on the same token, at once', async () => {
      const { mediaMinor } = await minorItem();
      const mod = await adminAuth('moderator');
      await vet(mod.id, true);
      await request(http()).get(`/admin/media-review/${mediaMinor}`).set(mod.auth).expect(200);
      await vet(mod.id, false);
      await request(http()).get(`/admin/media-review/${mediaMinor}`).set(mod.auth).expect(404);
    });

    it('the statistics card stays accurate for a non-vetted admin: counts only', async () => {
      const minor = await seedUser('minor');
      await uploadChecked(minor, []); // an automatic approval
      await prisma().user.update({ where: { id: minor.id }, data: { isMinor: true } });
      const mod = await adminAuth('moderator');
      const stats = await request(http()).get('/admin/media-review/stats').set(mod.auth).expect(200);
      expect(stats.body.autoApproved).toBe(1);
      expect(JSON.stringify(stats.body)).not.toContain(minor.id);
    });
  });

  // ---- B-258 / B-259: report limit and the optional reason ----------------------------------------

  describe('report daily limit and reason (B-258, B-259)', () => {
    async function twoVisibleItems() {
      const author = await seedUser('author');
      const a = await uploadChecked(author, []);
      const b = await uploadChecked(author, []);
      await postWith(author, [a]);
      await postWith(author, [b]);
      return { author, a, b };
    }

    it('the per-account limit (default 20 in a rolling 24 hours, configurable) answers 429 media_report_daily_limit, counted from the report records', async () => {
      const { a, b } = await twoVisibleItems();
      const reporter = await seedUser('rep');
      const before = process.env.POST_MEDIA_REPORT_DAILY_LIMIT;
      process.env.POST_MEDIA_REPORT_DAILY_LIMIT = '1';
      try {
        await request(http()).post(`/media/${a}/report`).set(reporter.auth).expect(200);
        const over = await request(http()).post(`/media/${b}/report`).set(reporter.auth).expect(429);
        expect(over.body).toMatchObject({ statusCode: 429, code: 'media_report_daily_limit' });
        expect(await prisma().postMediaReport.count({ where: { mediaId: b } })).toBe(0);
        // another account is unaffected, and the window rolls
        await request(http()).post(`/media/${b}/report`).set((await seedUser('rep2')).auth).expect(200);
        advance(24 * 3600 * 1000 + 1000);
        await request(http()).post(`/media/${b}/report`).set(reporter.auth).expect(200);
      } finally {
        if (before === undefined) delete process.env.POST_MEDIA_REPORT_DAILY_LIMIT;
        else process.env.POST_MEDIA_REPORT_DAILY_LIMIT = before;
      }
    });

    it('stores a trimmed reason and shows it to MODERATORS only (never the reporter, the uploader or anyone else)', async () => {
      const { author, a } = await twoVisibleItems();
      const reporter = await seedUser('rep');
      const mod = await adminAuth('moderator');
      const res = await request(http()).post(`/media/${a}/report`).set(reporter.auth).send({ reason: '   shows a street name   ' }).expect(200);
      expect(res.body).toEqual({ reported: true, alreadyReported: false });
      expect((await prisma().postMediaReport.findFirstOrThrow({ where: { mediaId: a } })).reason).toBe('shows a street name');

      const item = await request(http()).get(`/admin/media-review/${a}`).set(mod.auth).expect(200);
      expect(item.body.reportReasons).toEqual(['shows a street name']);
      expect(JSON.stringify(item.body)).not.toContain(reporter.id);

      const own = await request(http()).get(`/media/uploads/${a}`).set(author.auth).expect(200);
      expect(JSON.stringify(own.body)).not.toContain('street name');
    });

    it('refuses a reason over 500 characters and any other field (400); a blank reason is stored as none', async () => {
      const { a, b } = await twoVisibleItems();
      const reporter = await seedUser('rep');
      await request(http()).post(`/media/${a}/report`).set(reporter.auth).send({ reason: 'x'.repeat(501) }).expect(400);
      await request(http()).post(`/media/${a}/report`).set(reporter.auth).send({ reason: 'ok', reporterId: 'x' }).expect(400);
      expect(await prisma().postMediaReport.count({ where: { mediaId: a } })).toBe(0);
      await request(http()).post(`/media/${b}/report`).set(reporter.auth).send({ reason: '   ' }).expect(200);
      expect((await prisma().postMediaReport.findFirstOrThrow({ where: { mediaId: b } })).reason).toBeNull();
    });
  });

  // ---- schema guards -----------------------------------------------------------------------------

  describe('database constraints', () => {
    it('refuse a hold or a report count on an item that is not approved, and an inconsistent queue entry', async () => {
      const owner = await seedUser('owner');
      const id = await uploadChecked(owner, SUGGESTIVE); // pending
      await expect(prisma().postMedia.update({ where: { id }, data: { reportCount: 1 } })).rejects.toThrow();
      await expect(prisma().postMedia.update({ where: { id }, data: { hiddenPendingReview: true } })).rejects.toThrow();
      await expect(prisma().postMedia.update({ where: { id }, data: { reviewEntrySource: 'someone' } })).rejects.toThrow();
      await expect(prisma().postMedia.update({ where: { id }, data: { reviewEnteredAt: null } })).rejects.toThrow(); // source still set
    });

    it('a report row is unique per (item, reporter) and goes with its item', async () => {
      const owner = await seedUser('owner');
      const reporter = await seedUser('rep');
      const id = await uploadChecked(owner, []);
      await postWith(owner, [id]);
      await request(http()).post(`/media/${id}/report`).set(reporter.auth).expect(200);
      await expect(prisma().postMediaReport.create({ data: { mediaId: id, reporterId: reporter.id } })).rejects.toThrow();
      await prisma().postMedia.delete({ where: { id } });
      expect(await prisma().postMediaReport.count()).toBe(0);
    });
  });
});
