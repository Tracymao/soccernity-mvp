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
      expect(item.viewUrl).toContain('https://view.test/post-media/');
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
      await getPost(viewer, post).expect(404);
      await getPost(author, post).expect(200);
      // A hidden item can no longer be reported (nobody else can see it).
      await request(http()).post(`/media/${media}/report`).set((await seedUser('r4')).auth).expect(404);

      // Keep it: the hold lifts, the reports resolve, the uploader hears nothing.
      const kept = await request(http()).post(`/admin/media-review/${media}/approve`).set(mod.auth).expect(200);
      expect(kept.body).toEqual({ id: media, outcome: 'kept', status: 'approved' });
      expect(await row(media)).toMatchObject({ status: 'approved', reportCount: 0, hiddenPendingReview: false });
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

    it('concurrent reports by different users all count: the count and the hold end up exact', async () => {
      const { media } = await visibleApprovedItem();
      const reporters = await Promise.all(['a', 'b', 'c', 'd'].map((l) => seedUser(l)));
      const results = await Promise.all(reporters.map((r) => request(http()).post(`/media/${media}/report`).set(r.auth)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
      expect(await row(media)).toMatchObject({ reportCount: 4, hiddenPendingReview: true });
      expect(await prisma().postMediaReport.count({ where: { mediaId: media } })).toBe(4);
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
