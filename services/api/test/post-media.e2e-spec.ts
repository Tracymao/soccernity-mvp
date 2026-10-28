import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { MediaCheckService } from '../src/modules/post-media/media-check.service';
import { PostMediaService } from '../src/modules/post-media/post-media.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor, makeJpeg, makeMp4, makeNoisePng } from './support/post-media-doubles';

// backend/w14-post-media-pipeline (B-041, B-036; Decision Log #419), against the REAL app and REAL
// Postgres. The three external seams are in-memory: the object store (InMemoryStorage, where put() is the
// browser's PUT to the one-time link), Rekognition (FakeModerationClient) and the ffmpeg video tools
// (TestMediaProcessor -- images still go through the REAL sharp, so EXIF stripping is proven for real).
// The clock is fake so back-off, the upload throttle window and the 24 h quarantine purge are exact.
//
// The cron jobs are stopped: only the explicit service calls below advance the pipeline.

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Post media pipeline e2e', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  const processor = new TestMediaProcessor();
  const moderation = new FakeModerationClient();
  let clockNow = new Date('2026-11-05T10:00:00Z');
  const fakeClock = { now: () => new Date(clockNow) };
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();
  const at = (iso: string) => {
    clockNow = new Date(iso);
  };
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
    at('2026-11-05T10:00:00Z');
    storage.objects.clear();
    storage.issuedLinks.length = 0;
    storage.unavailable = false;
    storage.failDeleteFor.clear();
    storage.failCopy = false;
    storage.corruptCopyTo = null;
    storage.copies.length = 0;
    storage.issuedViewLinks.length = 0;
    processor.videoToolsAvailable = true;
    processor.probe = { durationSeconds: 30, hasVideoStream: true };
    processor.stripCalls.length = 0;
    processor.frameRequests.length = 0;
    processor.frameFailure = null;
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

  async function seedUser(label: string, o: { minor?: 'confirmed' | 'pending' } = {}): Promise<U> {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-media-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `m_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob(o.minor ? '2012-03-03' : '1994-05-05'),
        isMinor: Boolean(o.minor),
        verificationStatus: 'verified',
      },
    });
    if (o.minor) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: `guardian-${suffix}@example.com`,
          relationship: 'Parent',
          consentToken: `consent-${suffix}`,
          consentTokenExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
          consentStatus: o.minor,
        },
      });
    }
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: bearer(accessToken.token) };
  }

  const link = (u: U, contentType: string, size: number) => request(http()).post('/media/uploads').set(u.auth).send({ contentType, size });
  const confirm = (u: U, id: string) => request(http()).post(`/media/uploads/${id}/confirm`).set(u.auth);
  const getUpload = (u: U, id: string) => request(http()).get(`/media/uploads/${id}`).set(u.auth);
  const qKey = (u: U, id: string) => `quarantine/${u.id}/${id}`;
  const row = (id: string) => prisma().postMedia.findUniqueOrThrow({ where: { id } });
  const runChecks = () => app.get(MediaCheckService).runDueChecks(new Date(clockNow));

  /** link + the browser's PUT. Returns the id; does not confirm. */
  async function startAndPut(u: U, buffer: Buffer, contentType: string): Promise<string> {
    const res = await link(u, contentType, buffer.length).expect(201);
    storage.put(qKey(u, res.body.id), buffer, contentType);
    return res.body.id as string;
  }

  /** link + PUT + confirm -> ready (pending review). */
  async function uploadImage(u: U, over: { exifCopyright?: string; width?: number; height?: number } = {}): Promise<string> {
    const jpeg = await makeJpeg(over);
    const id = await startAndPut(u, jpeg, 'image/jpeg');
    await confirm(u, id).expect(200);
    return id;
  }

  async function uploadVideo(u: U): Promise<string> {
    const id = await startAndPut(u, makeMp4(), 'video/mp4');
    await confirm(u, id).expect(200);
    return id;
  }

  /** An uploaded image that the automatic check approved (no labels). */
  async function approvedImage(u: U): Promise<string> {
    const id = await uploadImage(u);
    await runChecks();
    expect((await row(id)).status).toBe('approved');
    return id;
  }

  const createPost = (u: U, body: Record<string, unknown>) => request(http()).post('/posts').set(u.auth).send(body);
  const getPost = (u: U, id: string) => request(http()).get(`/posts/${id}`).set(u.auth);

  // =================================================================================================
  describe('POST /media/uploads (the one-time link)', () => {
    it('issues a link bound to the declared type and size, into the QUARANTINE prefix, and records an awaiting_upload row', async () => {
      const u = await seedUser('a');
      const res = await link(u, 'image/jpeg', 12345).expect(201);

      expect(res.body).toMatchObject({ uploadMethod: 'PUT', maxBytes: 10 * 1024 * 1024 });
      expect(res.body.uploadHeaders).toEqual({ 'Content-Type': 'image/jpeg' });
      expect(res.body.uploadUrl).toContain(`quarantine/${u.id}/${res.body.id}`);
      expect(new Date(res.body.expiresAt).toISOString()).toBe('2026-11-05T10:15:00.000Z'); // 900 s from the fake clock
      expect(storage.issuedLinks).toEqual([
        { key: qKey(u, res.body.id), contentType: 'image/jpeg', contentLength: 12345, expiresInSeconds: 900 },
      ]);

      const r = await row(res.body.id);
      expect(r).toMatchObject({
        uploaderId: u.id,
        kind: 'image',
        uploadState: 'awaiting_upload',
        status: 'pending',
        decisionSource: null,
        quarantineKey: qKey(u, res.body.id),
        publicKey: null,
        publicUrl: null,
        postId: null,
        checkState: 'not_queued',
      });
    });

    it('refuses a GIF, a PDF, a zero size and unknown fields; stores nothing', async () => {
      const u = await seedUser('a');
      await link(u, 'image/gif', 100).expect(400);
      await link(u, 'application/pdf', 100).expect(400);
      await link(u, 'image/jpeg', 0).expect(400);
      await request(http()).post('/media/uploads').set(u.auth).send({ contentType: 'image/jpeg', size: 10, publicKey: 'x' }).expect(400);
      expect(await prisma().postMedia.count()).toBe(0);
      expect(storage.issuedLinks).toHaveLength(0);
    });

    it('enforces the per-kind size limits from configuration', async () => {
      const u = await seedUser('a');
      const img = await link(u, 'image/png', 10 * 1024 * 1024 + 1).expect(400);
      expect(img.body.code).toBe('file_too_large');
      await link(u, 'image/png', 10 * 1024 * 1024).expect(201);
      const vid = await link(u, 'video/mp4', 100 * 1024 * 1024 + 1).expect(400);
      expect(vid.body.code).toBe('file_too_large');
      await link(u, 'video/mp4', 100 * 1024 * 1024).expect(201);

      const before = process.env.POST_MEDIA_IMAGE_MAX_BYTES;
      process.env.POST_MEDIA_IMAGE_MAX_BYTES = '2048';
      try {
        expect((await link(u, 'image/jpeg', 4096).expect(400)).body.code).toBe('file_too_large');
      } finally {
        if (before === undefined) delete process.env.POST_MEDIA_IMAGE_MAX_BYTES;
        else process.env.POST_MEDIA_IMAGE_MAX_BYTES = before;
      }
    });

    it('a restricted-pending minor cannot upload (403 guardian_consent_pending); a confirmed minor can', async () => {
      const pending = await seedUser('pending', { minor: 'pending' });
      const res = await link(pending, 'image/jpeg', 100).expect(403);
      expect(res.body.code).toBe('guardian_consent_pending');
      expect(await prisma().postMedia.count()).toBe(0);

      const ok = await seedUser('ok', { minor: 'confirmed' });
      await link(ok, 'image/jpeg', 100).expect(201);
    });

    it('needs authentication', async () => {
      await request(http()).post('/media/uploads').send({ contentType: 'image/jpeg', size: 10 }).expect(401);
      await request(http()).post('/media/uploads/x/confirm').expect(401);
    });

    it('the per-user throttle (configuration) stops the N+1th link in the window, counts only that user, and resets with time', async () => {
      const a = await seedUser('a');
      const b = await seedUser('b');
      const before = process.env.POST_MEDIA_UPLOAD_RATE_LIMIT_MAX;
      process.env.POST_MEDIA_UPLOAD_RATE_LIMIT_MAX = '2';
      try {
        await link(a, 'image/jpeg', 10).expect(201);
        await link(a, 'image/jpeg', 10).expect(201);
        const third = await link(a, 'image/jpeg', 10).expect(429);
        expect(third.body.code).toBe('upload_rate_limited');
        await link(b, 'image/jpeg', 10).expect(201); // another user is unaffected
        advance(3600 * 1000 + 1); // the one-hour window passes
        await link(a, 'image/jpeg', 10).expect(201);
      } finally {
        if (before === undefined) delete process.env.POST_MEDIA_UPLOAD_RATE_LIMIT_MAX;
        else process.env.POST_MEDIA_UPLOAD_RATE_LIMIT_MAX = before;
      }
    });

    it('with no object store configured it answers a friendly 503 and writes no row', async () => {
      const u = await seedUser('a');
      storage.unavailable = true;
      const res = await link(u, 'image/jpeg', 10).expect(503);
      expect(res.body.code).toBe('uploads_unavailable');
      expect(JSON.stringify(res.body)).not.toMatch(/S3_|bucket/i);
      expect(await prisma().postMedia.count()).toBe(0);
    });

    it('a VIDEO link fails closed (503) when the stripping tools are missing, before any row exists', async () => {
      const u = await seedUser('a');
      processor.videoToolsAvailable = false;
      await link(u, 'video/mp4', 1000).expect(503);
      expect(await prisma().postMedia.count()).toBe(0);
      await link(u, 'image/jpeg', 1000).expect(201); // images are unaffected
    });
  });

  // =================================================================================================
  describe('POST /media/uploads/:id/confirm (verify, strip, store in the PRIVATE prefix)', () => {
    it('an image: EXIF is really stripped, the original is deleted from quarantine, the clean file sits in the PRIVATE prefix (nothing public), pending review', async () => {
      const u = await seedUser('a');
      const original = await makeJpeg({ exifCopyright: 'secret-photographer', width: 40, height: 20 });
      expect(original.toString('latin1')).toContain('secret-photographer');
      const id = await startAndPut(u, original, 'image/jpeg');

      const res = await confirm(u, id).expect(200);

      const r = await row(id);
      expect(r).toMatchObject({
        uploadState: 'ready',
        status: 'pending',
        decisionSource: null,
        contentType: 'image/jpeg',
        quarantineKey: null,
        publicKey: `post-media/${u.id}/${id}.jpg`,
        checkState: 'queued',
      });
      expect(res.body).toMatchObject({ id, kind: 'image', uploadState: 'ready', status: 'pending', url: `https://cdn.test/post-media/${u.id}/${id}.jpg`, rejectionReason: null });
      expect(res.body).not.toHaveProperty('checkLabels');

      const stored = storage.objects.get(`private-media/${u.id}/${id}.jpg`)!;
      expect(r.privateKey).toBe(`private-media/${u.id}/${id}.jpg`);
      expect(r.publishedAt).toBeNull();
      expect(storage.keysWithPrefix('post-media/')).toEqual([]); // nothing is public until it is approved
      expect(stored.contentType).toBe('image/jpeg');
      expect(stored.buffer.toString('latin1')).not.toContain('secret-photographer');
      expect(stored.buffer.length).toBe(r.byteSize);
      expect(storage.has(qKey(u, id))).toBe(false); // the original is gone
      expect(storage.keysWithPrefix('quarantine/')).toEqual([]);
    });

    it('a video: remuxed WITHOUT transcoding by the strip step, duration recorded, original deleted, check queued', async () => {
      const u = await seedUser('a');
      processor.probe = { durationSeconds: 42.5, hasVideoStream: true };
      const id = await startAndPut(u, makeMp4('payload-1'), 'video/mp4');
      await confirm(u, id).expect(200);

      const r = await row(id);
      expect(r).toMatchObject({ uploadState: 'ready', kind: 'video', durationSeconds: 42.5, contentType: 'video/mp4', checkState: 'queued', status: 'pending' });
      expect(processor.stripCalls).toHaveLength(1);
      const stored = storage.objects.get(`private-media/${u.id}/${id}.mp4`)!;
      expect(stored.buffer.subarray(0, 9).toString()).toBe('STRIPPED:'); // what was stored is the strip step's output
      expect(storage.has(qKey(u, id))).toBe(false);
    });

    it('is idempotent: confirming a ready upload again returns it without reprocessing', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      const writes = storage.keysWithPrefix('private-media/').length;
      const again = await confirm(u, id).expect(200);
      expect(again.body).toMatchObject({ id, uploadState: 'ready' });
      expect(storage.keysWithPrefix('private-media/')).toHaveLength(writes);
    });

    it('answers 409 upload_not_received when nothing was uploaded yet, keeps the row, and works once the file arrives', async () => {
      const u = await seedUser('a');
      const res = await link(u, 'image/jpeg', 10).expect(201);
      const first = await confirm(u, res.body.id).expect(409);
      expect(first.body.code).toBe('upload_not_received');
      expect((await row(res.body.id)).uploadState).toBe('awaiting_upload'); // the claim was handed back

      const jpeg = await makeJpeg();
      await prisma().postMedia.update({ where: { id: res.body.id }, data: { declaredSize: jpeg.length } });
      storage.put(qKey(u, res.body.id), jpeg, 'image/jpeg');
      await confirm(u, res.body.id).expect(200);
    });

    it('rejects a file whose size is not the declared size (the link pins the length), and removes the original and the row', async () => {
      const u = await seedUser('a');
      const jpeg = await makeJpeg();
      const res = await link(u, 'image/jpeg', jpeg.length + 5).expect(201);
      storage.put(qKey(u, res.body.id), jpeg, 'image/jpeg');
      const out = await confirm(u, res.body.id).expect(400);
      expect(out.body.code).toBe('file_too_large');
      expect(storage.has(qKey(u, res.body.id))).toBe(false);
      expect(await prisma().postMedia.count()).toBe(0);
    });

    it.each([
      ['a PDF declared as a JPEG', Buffer.from('%PDF-1.7 not an image at all, padded padded padded padded'), 'image/jpeg'],
      ['a PNG declared as a JPEG', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(60).fill(0)]), 'image/jpeg'],
      ['an MP4 declared as an image', makeMp4(), 'image/jpeg'],
      ['a JPEG declared as an MP4', Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array(60).fill(0)]), 'video/mp4'],
      ['a JPEG header over garbage', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('definitely not a jpeg body')]), 'image/jpeg'],
    ])('refuses %s (magic bytes / decoding), and leaves nothing in the public prefix', async (_name, bytes, declared) => {
      const u = await seedUser('a');
      const id = await startAndPut(u, bytes, declared);
      const out = await confirm(u, id).expect(400);
      expect(out.body.code).toBe('unsupported_file');
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);
      expect(storage.keysWithPrefix('private-media/')).toEqual([]);
      expect(storage.has(qKey(u, id))).toBe(false);
      expect(await prisma().postMedia.count({ where: { id } })).toBe(0);
    });

    it('refuses a video longer than the configured maximum (400 video_too_long) and stores nothing', async () => {
      const u = await seedUser('a');
      processor.probe = { durationSeconds: 120.5, hasVideoStream: true };
      const id = await startAndPut(u, makeMp4(), 'video/mp4');
      const out = await confirm(u, id).expect(400);
      expect(out.body.code).toBe('video_too_long');
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);
      expect(storage.keysWithPrefix('private-media/')).toEqual([]);

      processor.probe = { durationSeconds: 120, hasVideoStream: true }; // exactly the limit is fine
      const ok = await startAndPut(u, makeMp4('b'), 'video/mp4');
      await confirm(u, ok).expect(200);
    });

    it('refuses a video with no video stream', async () => {
      const u = await seedUser('a');
      processor.probe = { durationSeconds: 10, hasVideoStream: false };
      const id = await startAndPut(u, makeMp4(), 'video/mp4');
      expect((await confirm(u, id).expect(400)).body.code).toBe('unsupported_file');
    });

    it('FAILS CLOSED if the stripping tools vanish before a video is processed: 503, NOTHING stored publicly, the claim is handed back and a later retry works', async () => {
      const u = await seedUser('a');
      const id = await startAndPut(u, makeMp4(), 'video/mp4');
      processor.videoToolsAvailable = false;
      await confirm(u, id).expect(503);
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);
      expect(storage.keysWithPrefix('private-media/')).toEqual([]);
      const r = await row(id);
      expect(r).toMatchObject({ uploadState: 'awaiting_upload', publicKey: null, publicUrl: null, status: 'pending' });
      expect(storage.has(qKey(u, id))).toBe(true); // kept for the retry

      processor.videoToolsAvailable = true;
      await confirm(u, id).expect(200);
      expect((await row(id)).uploadState).toBe('ready');
    });

    it("another user's upload is a 404 for confirm, get and delete -- an id reveals nothing", async () => {
      const a = await seedUser('a');
      const b = await seedUser('b');
      const id = await startAndPut(a, await makeJpeg(), 'image/jpeg');
      await confirm(b, id).expect(404);
      await getUpload(b, id).expect(404);
      await request(http()).delete(`/media/uploads/${id}`).set(b.auth).expect(404);
      await getUpload(a, id).expect(200);
    });

    it('two simultaneous confirms process the file once', async () => {
      const u = await seedUser('a');
      const id = await startAndPut(u, await makeJpeg(), 'image/jpeg');
      const [x, y] = await Promise.all([confirm(u, id), confirm(u, id)]);
      expect([x.status, y.status].every((s) => s === 200 || s === 409)).toBe(true);
      expect([x.status, y.status]).toContain(200);
      expect(storage.keysWithPrefix('private-media/')).toHaveLength(1);
      expect((await row(id)).uploadState).toBe('ready');
    });

    it('a failed delete of the quarantined original keeps its key on the row so the purge can finish the job; the upload still succeeds', async () => {
      const u = await seedUser('a');
      const id = await startAndPut(u, await makeJpeg(), 'image/jpeg');
      storage.failDeleteFor.add(qKey(u, id));
      await confirm(u, id).expect(200);
      const r = await row(id);
      expect(r.uploadState).toBe('ready');
      expect(r.quarantineKey).toBe(qKey(u, id));
    });
  });

  // =================================================================================================
  describe('the automatic check (Rekognition) -- the three outcomes', () => {
    it('every label below the pass threshold on every frame -> APPROVED, decisionSource auto; the request used the lower of the two thresholds as MinConfidence', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.labelsFor = () => [{ name: 'Alcohol', parentName: null, confidence: 39.9 }];
      const out = await runChecks();

      expect(out).toEqual({ checked: 1, outcomes: { approved: 1 } });
      const r = await row(id);
      expect(r).toMatchObject({ status: 'approved', decisionSource: 'auto', rejectionReason: null, checkState: 'done', decidedBy: null });
      expect(r.decidedAt).toEqual(new Date('2026-11-05T10:00:00Z'));
      expect(moderation.calls).toHaveLength(1);
      expect(moderation.calls[0].minConfidence).toBe(40);
      expect(moderation.calls[0].bytes).toBeGreaterThan(0);
    });

    it('a reject category at or above the reject threshold -> REJECTED with the generic reason; only category NAMES are stored; the owner sees the reason', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.labelsFor = () => [
        { name: 'Explicit', parentName: null, confidence: 97.123456 },
        { name: 'Explicit Nudity', parentName: 'Explicit', confidence: 96.5 },
      ];
      expect(await runChecks()).toEqual({ checked: 1, outcomes: { rejected: 1 } });

      const r = await row(id);
      expect(r).toMatchObject({ status: 'rejected', decisionSource: 'auto', rejectionReason: "This file didn't meet our rules" });
      expect(r.checkLabels).toEqual(['Explicit', 'Explicit Nudity']);
      expect(JSON.stringify(r.checkLabels)).not.toMatch(/97|96/); // no confidences

      const mine = await getUpload(u, id).expect(200);
      expect(mine.body).toMatchObject({ status: 'rejected', rejectionReason: "This file didn't meet our rules" });
      expect(JSON.stringify(mine.body)).not.toMatch(/Explicit|checkLabels/); // labels are owner-hidden
    });

    it('anything between the thresholds is LEFT PENDING for a moderator: no decision, checked once, not re-checked', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.labelsFor = () => [{ name: 'Swimwear or Underwear', parentName: null, confidence: 70 }];
      expect(await runChecks()).toEqual({ checked: 1, outcomes: { pending: 1 } });

      const r = await row(id);
      expect(r).toMatchObject({ status: 'pending', decisionSource: null, decidedAt: null, checkState: 'done' });
      expect(r.checkLabels).toEqual(['Swimwear or Underwear']);
      expect(await runChecks()).toEqual({ checked: 0, outcomes: {} });
      expect(moderation.calls).toHaveLength(1);
    });

    it('is STRICTER for an uploader who is a minor: the same label approves an adult and holds a minor', async () => {
      const adult = await seedUser('adult');
      const minor = await seedUser('minor', { minor: 'confirmed' });
      const a = await uploadImage(adult);
      const m = await uploadImage(minor);
      moderation.labelsFor = () => [{ name: 'Alcohol', parentName: null, confidence: 30 }];
      await runChecks();
      expect((await row(a)).status).toBe('approved');
      expect((await row(m)).status).toBe('pending');
      expect((await row(m)).checkState).toBe('done');

      // and a reject label between the two reject thresholds: held for an adult, rejected for a minor
      const a2 = await uploadImage(adult);
      const m2 = await uploadImage(minor);
      moderation.labelsFor = () => [{ name: 'Violence', parentName: null, confidence: 85 }];
      await runChecks();
      expect((await row(a2)).status).toBe('pending');
      expect((await row(m2)).status).toBe('rejected');
    });

    it('a VIDEO is sampled into frames (interval and cap from configuration) and judged by its worst frame', async () => {
      const u = await seedUser('a');
      processor.probe = { durationSeconds: 30, hasVideoStream: true };
      const id = await uploadVideo(u);
      moderation.labelsFor = (i) => (i === 3 ? [{ name: 'Hate Symbols', parentName: null, confidence: 93 }] : []);
      expect(await runChecks()).toEqual({ checked: 1, outcomes: { rejected: 1 } });

      expect(processor.frameRequests[0]).toEqual([2.5, 7.5, 12.5, 17.5, 22.5, 27.5]); // 30 s / 5 s
      expect(moderation.calls).toHaveLength(6);
      expect((await row(id)).status).toBe('rejected');
    });

    it('caps the number of frames at the configured maximum (the interval widens to spread them)', async () => {
      const u = await seedUser('a');
      processor.probe = { durationSeconds: 120, hasVideoStream: true };
      await uploadVideo(u);
      const before = process.env.MEDIA_CHECK_VIDEO_MAX_FRAMES;
      process.env.MEDIA_CHECK_VIDEO_MAX_FRAMES = '4';
      try {
        await runChecks();
      } finally {
        if (before === undefined) delete process.env.MEDIA_CHECK_VIDEO_MAX_FRAMES;
        else process.env.MEDIA_CHECK_VIDEO_MAX_FRAMES = before;
      }
      expect(processor.frameRequests[0]).toEqual([15, 45, 75, 105]);
      expect(moderation.calls).toHaveLength(4);
    });

    it('an image over the 5 MB API limit is downscaled for the CHECK only; the stored file is untouched', async () => {
      const u = await seedUser('a');
      // ~5.9 MB of incompressible PNG: under the 10 MB upload cap, over Rekognition's 5 MB.
      const big = await makeNoisePng(1400);
      expect(big.length).toBeGreaterThan(5 * 1024 * 1024);
      expect(big.length).toBeLessThan(10 * 1024 * 1024);
      const id = await startAndPut(u, big, 'image/png');
      await confirm(u, id).expect(200);
      const storedBefore = storage.objects.get(`private-media/${u.id}/${id}.png`)!.buffer.length;
      expect(storedBefore).toBeGreaterThan(5 * 1024 * 1024);

      await runChecks();
      expect(moderation.calls[0].bytes).toBeLessThanOrEqual(5 * 1024 * 1024);
      // approved -> published byte-for-byte to the public prefix, and the private original removed
      expect(storage.objects.get(`post-media/${u.id}/${id}.png`)!.buffer.length).toBe(storedBefore);
      expect(storage.has(`private-media/${u.id}/${id}.png`)).toBe(false);
      expect((await row(id)).status).toBe('approved');
    });
  });

  // =================================================================================================
  describe('the check is NEVER approve-by-default', () => {
    it('with Rekognition unconfigured nothing is checked and nothing is approved; the upload waits for a moderator, and is picked up once configured', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.configured = false;
      expect(await runChecks()).toEqual({ checked: 0, outcomes: {} });
      expect(await runChecks()).toEqual({ checked: 0, outcomes: {} });
      expect(moderation.calls).toHaveLength(0);
      expect(await row(id)).toMatchObject({ status: 'pending', decisionSource: null, checkState: 'queued', checkAttempts: 0 });

      moderation.configured = true;
      await runChecks();
      expect((await row(id)).status).toBe('approved');
    });

    it('a failing service is retried with back-off, and never approves meanwhile', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.failTimes = 1;
      expect(await runChecks()).toEqual({ checked: 1, outcomes: { retry: 1 } });
      expect(await row(id)).toMatchObject({ status: 'pending', checkState: 'queued', checkAttempts: 1, checkError: 'Error' });
      expect((await row(id)).checkNextAt).toEqual(new Date('2026-11-05T10:01:00Z')); // +60 s

      expect(await runChecks()).toEqual({ checked: 0, outcomes: {} }); // not due yet
      advance(60_000);
      expect(await runChecks()).toEqual({ checked: 1, outcomes: { approved: 1 } });
      expect(await row(id)).toMatchObject({ status: 'approved', checkError: null });
    });

    it('the back-off doubles each attempt', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.failTimes = 3;
      const nexts: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        await runChecks();
        const r = await row(id);
        nexts.push((r.checkNextAt as Date).getTime() - clockNow.getTime());
        at(new Date((r.checkNextAt as Date).getTime()).toISOString());
      }
      expect(nexts).toEqual([60_000, 120_000, 240_000]);
    });

    it('after the configured number of attempts it is left pending ("gave_up") for a moderator, not approved and not retried again', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.failTimes = 1000;
      for (let i = 0; i < 5; i += 1) {
        await runChecks();
        advance(2 * 3600 * 1000);
      }
      expect(await row(id)).toMatchObject({ status: 'pending', decisionSource: null, checkState: 'gave_up', checkAttempts: 5 });
      const calls = moderation.calls.length;
      advance(24 * 3600 * 1000);
      expect(await runChecks()).toEqual({ checked: 0, outcomes: {} });
      expect(moderation.calls).toHaveLength(calls);
    });

    it('a crashed worker\'s lease expires and another worker takes the row over', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      await prisma().postMedia.update({ where: { id }, data: { checkState: 'checking', checkLeaseUntil: new Date('2026-11-05T10:05:00Z') } });
      expect(await runChecks()).toEqual({ checked: 0, outcomes: {} }); // leased
      at('2026-11-05T10:05:01Z');
      expect(await runChecks()).toEqual({ checked: 1, outcomes: { approved: 1 } });
    });

    it('a moderator decision made while the check runs is never overwritten by the automatic result', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.onCall = async () => {
        // The moderator rejects while Rekognition is still thinking.
        await prisma().postMedia.update({
          where: { id },
          data: { status: 'rejected', decisionSource: 'moderator', decidedAt: new Date(), decidedBy: 'admin-1', rejectionReason: 'Moderator reason' },
        });
      };
      const out = await runChecks();
      expect(out.outcomes).toEqual({ skipped: 1 }); // the check wanted to approve; the guarded write matched nothing
      expect(await row(id)).toMatchObject({ status: 'rejected', decisionSource: 'moderator', rejectionReason: 'Moderator reason', decidedBy: 'admin-1' });
    });

    it('an upload deleted mid-check is skipped quietly', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.onCall = async () => {
        await prisma().postMedia.deleteMany({ where: { id } });
      };
      const out = await runChecks();
      expect(out.outcomes).toEqual({ skipped: 1 });
      expect(await prisma().postMedia.count({ where: { id } })).toBe(0);
    });
  });

  // =================================================================================================
  describe('POST /posts with mediaIds -- the visibility gate', () => {
    it('a post with media still under review is visible to its AUTHOR ONLY: 404 / absent for everyone else on every read path', async () => {
      const author = await seedUser('author');
      const fan = await seedUser('fan');
      await request(http()).post(`/users/${author.id}/follow`).set(fan.auth).expect(200);
      const mediaId = await uploadImage(author);

      const created = await createPost(author, { contentText: 'pending pic #review', mediaIds: [mediaId] }).expect(201);
      const postId = created.body.id as string;
      expect(created.body.mediaUrls).toEqual([`https://cdn.test/post-media/${author.id}/${mediaId}.jpg`]);
      expect((await row(mediaId)).postId).toBe(postId);

      // the author sees it everywhere
      await getPost(author, postId).expect(200);
      expect((await request(http()).get('/posts/feed').set(author.auth).expect(200)).body.items.map((p: { id: string }) => p.id)).toContain(postId);
      // everyone else: a plain 404 / absent
      await getPost(fan, postId).expect(404);
      expect((await request(http()).get('/posts/feed').set(fan.auth).expect(200)).body.items.map((p: { id: string }) => p.id)).not.toContain(postId);
      await request(http()).post(`/posts/${postId}/like`).set(fan.auth).expect(404);
      await request(http()).post(`/posts/${postId}/comments`).set(fan.auth).send({ contentText: 'hi' }).expect(404);
      await request(http()).get(`/posts/${postId}/comments`).set(fan.auth).expect(404);
      await request(http()).post(`/posts/${postId}/save`).set(fan.auth).expect(404);
      const search = await request(http()).get('/search/posts').query({ q: 'pending' }).set(fan.auth);
      if (search.status === 200) expect(JSON.stringify(search.body)).not.toContain(postId);
    });

    it('becomes visible to everyone the moment its media are approved', async () => {
      const author = await seedUser('author');
      const fan = await seedUser('fan');
      await request(http()).post(`/users/${author.id}/follow`).set(fan.auth).expect(200);
      const mediaId = await uploadImage(author);
      const postId = (await createPost(author, { contentText: 'soon visible', mediaIds: [mediaId] }).expect(201)).body.id as string;
      await getPost(fan, postId).expect(404);

      await runChecks();
      await getPost(fan, postId).expect(200);
      expect((await request(http()).get('/posts/feed').set(fan.auth).expect(200)).body.items.map((p: { id: string }) => p.id)).toContain(postId);
    });

    it('stays hidden while ANY of several media is not approved; visible only when all are', async () => {
      const author = await seedUser('author');
      const fan = await seedUser('fan');
      const m1 = await uploadImage(author);
      const m2 = await uploadImage(author);
      moderation.labelsFor = (i) => (i === 1 ? [{ name: 'Alcohol', parentName: null, confidence: 60 }] : []);
      await runChecks();
      expect((await row(m1)).status).toBe('approved');
      expect((await row(m2)).status).toBe('pending');
      const postId = (await createPost(author, { contentText: 'two pics', mediaIds: [m1, m2] }).expect(201)).body.id as string;
      await getPost(fan, postId).expect(404);

      await prisma().postMedia.update({ where: { id: m2 }, data: { status: 'approved', decisionSource: 'moderator', decidedAt: new Date(), decidedBy: 'admin-1' } });
      await getPost(fan, postId).expect(200);
    });

    it("a REJECTED file keeps its post hidden; removing that file makes the post (now without it) visible, and its PRIVATE object is KEPT (B-206 OPEN)", async () => {
      const author = await seedUser('author');
      const fan = await seedUser('fan');
      const mediaId = await uploadImage(author);
      const postId = (await createPost(author, { contentText: 'will be rejected', mediaIds: [mediaId] }).expect(201)).body.id as string;
      const privateKey = `private-media/${author.id}/${mediaId}.jpg`;
      expect(storage.has(privateKey)).toBe(true);

      await prisma().postMedia.update({
        where: { id: mediaId },
        data: { status: 'rejected', decisionSource: 'moderator', decidedAt: new Date(), decidedBy: 'admin-1', rejectionReason: 'Not suitable' },
      });
      await getPost(fan, postId).expect(404);
      await getPost(author, postId).expect(200);

      await request(http()).delete(`/media/uploads/${mediaId}`).set(author.auth).expect(204);
      expect(storage.has(privateKey)).toBe(true); // a rejected file is never deleted
      expect(await prisma().postMedia.count({ where: { id: mediaId } })).toBe(0);
      const after = await getPost(fan, postId).expect(200);
      expect(after.body.mediaUrls).toEqual([]);
    });

    it('a post with no media, or posts created before this feature, are untouched', async () => {
      const author = await seedUser('author');
      const fan = await seedUser('fan');
      const plain = (await createPost(author, { contentText: 'just text' }).expect(201)).body.id as string;
      await getPost(fan, plain).expect(200);
      const legacy = await prisma().post.create({ data: { authorId: author.id, contentText: 'legacy', mediaUrls: ['https://old.example.com/a.jpg'] } });
      await getPost(fan, legacy.id).expect(200);
    });
  });

  // =================================================================================================
  describe('attaching media to a post (POST /posts mediaIds) -- who may attach what', () => {
    it('a free URL is not accepted from a user any more: mediaUrls is refused, no post is created', async () => {
      const u = await seedUser('a');
      await createPost(u, { contentText: 'x', mediaUrls: ['https://evil.example.com/a.jpg'] }).expect(400);
      expect(await prisma().post.count()).toBe(0);
    });

    it("refuses media that is not the author's, already attached, rejected, not yet confirmed, unknown, or listed twice -- with ONE indistinguishable 400 and no post", async () => {
      const a = await seedUser('a');
      const b = await seedUser('b');
      const theirs = await uploadImage(b);
      const mine = await uploadImage(a);
      await createPost(a, { contentText: 'first', mediaIds: [mine] }).expect(201);
      const rejected = await uploadImage(a);
      await prisma().postMedia.update({
        where: { id: rejected },
        data: { status: 'rejected', decisionSource: 'auto', decidedAt: new Date(), rejectionReason: "This file didn't meet our rules" },
      });
      const notReady = (await link(a, 'image/jpeg', 100).expect(201)).body.id as string;
      const fresh = await uploadImage(a);
      const baseline = await prisma().post.count();

      const bodies = [];
      for (const mediaIds of [[theirs], [mine], [rejected], [notReady], ['3f1b8c7e-6a53-4f0e-9d77-2f6f6f0a1b11'], [fresh, fresh]]) {
        const res = await createPost(a, { contentText: 'nope', mediaIds }).expect(400);
        bodies.push(res.body);
      }
      for (const body of bodies) expect(body.code).toBe('media_not_attachable');
      expect(new Set(bodies.map((b) => b.message)).size).toBe(1);
      expect(await prisma().post.count()).toBe(baseline);
      expect((await row(fresh)).postId).toBeNull(); // a refused post attaches nothing
      await createPost(a, { contentText: 'not a uuid', mediaIds: ['nope'] }).expect(400);
    });

    it('a post may carry several images but only ONE video', async () => {
      const a = await seedUser('a');
      const v1 = await uploadVideo(a);
      const v2 = await uploadVideo(a);
      const i1 = await uploadImage(a);
      const two = await createPost(a, { contentText: 'two videos', mediaIds: [v1, v2] }).expect(400);
      expect(two.body.code).toBe('too_many_videos');
      await createPost(a, { contentText: 'video and photo', mediaIds: [v1, i1] }).expect(201);
      expect((await row(v1)).postId).not.toBeNull();
    });

    it('two posts racing for the same file: exactly one wins, the other rolls back whole', async () => {
      const a = await seedUser('a');
      const m = await uploadImage(a);
      const [x, y] = await Promise.all([
        createPost(a, { contentText: 'race one', mediaIds: [m] }),
        createPost(a, { contentText: 'race two', mediaIds: [m] }),
      ]);
      expect([x.status, y.status].sort()).toEqual([201, 400]);
      expect(await prisma().post.count()).toBe(1);
      expect((await row(m)).postId).not.toBeNull();
    });

    it('a restricted-pending minor cannot create the post that would carry media either', async () => {
      const pending = await seedUser('pending', { minor: 'pending' });
      await createPost(pending, { contentText: 'x' }).expect(403);
    });
  });

  // =================================================================================================
  describe('deleting a post, and anonymising an account, deletes the files', () => {
    it("DELETE /posts/:id removes the post's media rows AND its stored objects", async () => {
      const a = await seedUser('a');
      const mediaId = await approvedImage(a);
      const keep = await approvedImage(a); // an unrelated, unattached upload of the same user
      const postId = (await createPost(a, { contentText: 'to delete', mediaIds: [mediaId] }).expect(201)).body.id as string;
      const key = `post-media/${a.id}/${mediaId}.jpg`;
      expect(storage.has(key)).toBe(true);

      await request(http()).delete(`/posts/${postId}`).set(a.auth).expect(204);

      expect(storage.has(key)).toBe(false);
      expect(await prisma().postMedia.count({ where: { id: mediaId } })).toBe(0);
      expect(await prisma().postMedia.count({ where: { id: keep } })).toBe(1);
      expect(storage.has(`post-media/${a.id}/${keep}.jpg`)).toBe(true);
    });

    it("a storage failure while deleting a post's files never fails the deletion", async () => {
      const a = await seedUser('a');
      const mediaId = await approvedImage(a);
      const postId = (await createPost(a, { contentText: 'x', mediaIds: [mediaId] }).expect(201)).body.id as string;
      storage.failDeleteFor.add(`post-media/${a.id}/${mediaId}.jpg`);
      await request(http()).delete(`/posts/${postId}`).set(a.auth).expect(204);
      expect(await prisma().post.count({ where: { id: postId } })).toBe(0);
    });

    it('anonymising an account deletes ALL its upload rows and objects (attached, unattached, quarantined) and strips the files from the posts that survive (#341)', async () => {
      const a = await seedUser('a');
      const other = await seedUser('other');
      const attached = await approvedImage(a);
      await uploadImage(a); // unattached
      const awaiting = (await link(a, 'image/jpeg', 10).expect(201)).body.id as string;
      storage.put(qKey(a, awaiting), Buffer.from('half an upload'), 'image/jpeg');
      const postId = (await createPost(a, { contentText: 'survives anonymisation', mediaIds: [attached] }).expect(201)).body.id as string;
      const otherMedia = await approvedImage(other);

      await app.get(AccountDeletionSweepService).anonymizeUser(a.id, false);

      expect(await prisma().postMedia.count({ where: { uploaderId: a.id } })).toBe(0);
      expect(storage.keysWithPrefix(`post-media/${a.id}/`)).toEqual([]);
      expect(storage.keysWithPrefix(`private-media/${a.id}/`)).toEqual([]); // none of them was rejected
      expect(storage.keysWithPrefix(`quarantine/${a.id}/`)).toEqual([]);
      const post = await prisma().post.findUniqueOrThrow({ where: { id: postId } });
      expect(post.mediaUrls).toEqual([]); // the post is kept; its files are not
      expect(await prisma().postMedia.count({ where: { id: otherMedia } })).toBe(1); // nobody else's
      expect(storage.has(`post-media/${other.id}/${otherMedia}.jpg`)).toBe(true);
    });

    it("an ordinary post's file CAN be removed by its owner (the post keeps its text)", async () => {
      const a = await seedUser('a');
      const mediaId = await approvedImage(a);
      const postId = (await createPost(a, { contentText: 'x', mediaIds: [mediaId] }).expect(201)).body.id as string;
      await request(http()).delete(`/media/uploads/${mediaId}`).set(a.auth).expect(204);
      expect((await prisma().post.findUniqueOrThrow({ where: { id: postId } })).mediaUrls).toEqual([]);
    });
  });

  // =================================================================================================
  describe('the quarantine purge (24 h)', () => {
    it('removes objects and rows older than 24 hours that were never confirmed; leaves fresh ones and ready uploads alone', async () => {
      const a = await seedUser('a');
      const stale = (await link(a, 'image/jpeg', 10).expect(201)).body.id as string; // link only, never uploaded
      const staleUploaded = await startAndPut(a, await makeJpeg(), 'image/jpeg'); // uploaded, never confirmed
      advance(23 * 3600 * 1000);
      const fresh = (await link(a, 'image/jpeg', 10).expect(201)).body.id as string;
      storage.put(qKey(a, fresh), Buffer.from('x'));
      const ready = await uploadImage(a);
      advance(2 * 3600 * 1000); // stale ones are now 25 h old; fresh 2 h; ready 2 h

      const out = await app.get(PostMediaService).purgeQuarantine(new Date(clockNow));

      expect(out.purged).toBe(2);
      expect(await prisma().postMedia.count({ where: { id: { in: [stale, staleUploaded] } } })).toBe(0);
      expect(storage.has(qKey(a, staleUploaded))).toBe(false);
      expect(await prisma().postMedia.count({ where: { id: fresh } })).toBe(1);
      expect(storage.has(qKey(a, fresh))).toBe(true);
      expect((await row(ready)).uploadState).toBe('ready');
      expect(storage.keysWithPrefix('private-media/')).toHaveLength(1);
    });

    it('a confirmed upload whose original could not be deleted loses only the original, after 24 h', async () => {
      const a = await seedUser('a');
      const id = await startAndPut(a, await makeJpeg(), 'image/jpeg');
      storage.failDeleteFor.add(qKey(a, id));
      await confirm(a, id).expect(200);
      expect(storage.has(qKey(a, id))).toBe(true);

      advance(25 * 3600 * 1000);
      storage.failDeleteFor.clear();
      await app.get(PostMediaService).purgeQuarantine(new Date(clockNow));

      expect(storage.has(qKey(a, id))).toBe(false);
      const r = await row(id);
      expect(r.quarantineKey).toBeNull();
      expect(r.uploadState).toBe('ready');
      expect(storage.has(`private-media/${a.id}/${id}.jpg`)).toBe(true); // the processed file stays
    });

    it('a storage outage during the purge stops quietly and retries next time', async () => {
      const a = await seedUser('a');
      const id = (await link(a, 'image/jpeg', 10).expect(201)).body.id as string;
      storage.put(qKey(a, id), Buffer.from('x'));
      advance(25 * 3600 * 1000);
      storage.failDeleteFor.add(qKey(a, id));
      expect(await app.get(PostMediaService).purgeQuarantine(new Date(clockNow))).toEqual({ purged: 0 });
      expect(await prisma().postMedia.count({ where: { id } })).toBe(1);
      storage.failDeleteFor.clear();
      expect(await app.get(PostMediaService).purgeQuarantine(new Date(clockNow))).toEqual({ purged: 1 });
    });

    it('a confirm after the purge is a plain 404 (the upload no longer exists)', async () => {
      const a = await seedUser('a');
      const id = (await link(a, 'image/jpeg', 10).expect(201)).body.id as string;
      advance(25 * 3600 * 1000);
      await app.get(PostMediaService).purgeQuarantine(new Date(clockNow));
      await confirm(a, id).expect(404);
    });
  });

  // =================================================================================================
  describe('the contest final entry takes an uploaded VIDEO (#419 item 7)', () => {
    const REVEAL = '2026-11-25T00:00:00.000Z';
    const MONTH_END = '2026-12-01T00:00:00.000Z';

    async function adminToken(): Promise<string> {
      const admin = await prisma().adminUser.create({
        data: { email: `e2e-media-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Media Admin', role: 'superadmin' },
      });
      return (await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token;
    }

    // The November contest, with `finalists` already decided (their weekly wins seeded) and week 4 open.
    async function setupFinal(finalists: U[]) {
      at('2026-10-30T12:00:00Z');
      const res = await request(http())
        .post('/admin/contest/cycles')
        .set(bearer(await adminToken()))
        .send({
          month: '2026-11',
          title: 'November Challenge',
          description: 'Show us your best skill.',
          weeks: [
            { weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
            { weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
            { weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
          ],
          finalTask: 'Your best goal',
          minimumTally: 1,
        })
        .expect(201);
      const cycleId = res.body.cycle.id as string;
      for (let i = 0; i < finalists.length; i += 1) {
        const weekNumber = i + 1;
        const round = await prisma().contestRound.findUniqueOrThrow({ where: { cycleId_weekNumber: { cycleId, weekNumber } } });
        const p = await prisma().post.create({ data: { authorId: finalists[i].id, contentText: 'seed', mediaUrls: [] } });
        const entry = await prisma().contestEntry.create({
          data: { cycleId, roundId: round.id, postId: p.id, userId: finalists[i].id, qualified: true, phase1Rank: 1, phase1Tally: 1 },
        });
        await prisma().contestRoundWinner.create({ data: { roundId: round.id, entryId: entry.id, userId: finalists[i].id, position: 1 } });
      }
      // weeks 1-3 judged (any week without a winner is simply judged and empty)
      await prisma().contestRound.updateMany({
        where: { cycleId, weekNumber: { lte: 3 } },
        data: { status: 'judged', judgedAt: new Date('2026-01-01T00:00:00Z') },
      });
      at('2026-11-22T08:00:00Z');
      await app.get(ContestLifecycleService).runOnce(new Date(clockNow));
      return cycleId;
    }

    const finalEntry = (u: U, body: Record<string, unknown>) => request(http()).post('/contest/final-entry').set(u.auth).send(body);

    it("refuses an image, someone else's video, an unknown id, a list, and the old free-URL field; each leaves no post", async () => {
      const f = await seedUser('finalist');
      const other = await seedUser('other');
      await setupFinal([f]);
      const image = await uploadImage(f);
      const theirVideo = await uploadVideo(other);
      const baseline = await prisma().post.count();

      const notVideo = await finalEntry(f, { contentText: 'f', mediaId: image }).expect(400);
      expect(notVideo.body.code).toBe('final_entry_needs_one_video');
      expect((await finalEntry(f, { contentText: 'f', mediaId: theirVideo }).expect(400)).body.code).toBe('media_not_attachable');
      expect((await finalEntry(f, { contentText: 'f', mediaId: '3f1b8c7e-6a53-4f0e-9d77-2f6f6f0a1b11' }).expect(400)).body.code).toBe(
        'media_not_attachable',
      );
      await finalEntry(f, { contentText: 'f', mediaIds: [image] }).expect(400);
      await finalEntry(f, { contentText: 'f', mediaUrls: ['https://x.example.com/v.mp4'] }).expect(400);
      await finalEntry(f, { contentText: 'f' }).expect(400);
      expect(await prisma().post.count()).toBe(baseline);
      expect(await prisma().contestEntry.count({ where: { userId: f.id, round: { weekNumber: 4 } } })).toBe(0);
    });

    it('a pending video: the final entry is created and hidden from others even AFTER the reveal; the carousel does not show it until approval', async () => {
      const f = await seedUser('finalist');
      const viewer = await seedUser('viewer');
      await setupFinal([f]);
      const video = await uploadVideo(f);

      const created = await finalEntry(f, { contentText: 'my final', mediaId: video }).expect(201);
      const postId = created.body.post.id as string;
      expect(created.body.post.mediaUrls).toEqual([`https://cdn.test/post-media/${f.id}/${video}.mp4`]);
      expect((await row(video)).postId).toBe(postId);
      await getPost(viewer, postId).expect(404); // before the reveal: hidden by the reveal gate

      at(REVEAL);
      await getPost(viewer, postId).expect(404); // revealed, but the video is not approved: still hidden
      await getPost(f, postId).expect(200);
      let carousel = await request(http()).get('/contest/final-week/carousel').set(viewer.auth).expect(200);
      expect(carousel.body.live).toBe(true);
      expect(carousel.body.items).toEqual([]);

      await runChecks(); // approved by the automatic check
      await getPost(viewer, postId).expect(200);
      carousel = await request(http()).get('/contest/final-week/carousel').set(viewer.auth).expect(200);
      expect(carousel.body.items).toHaveLength(1);
    });

    it('a final entry whose video is not approved by the reveal is not shown, and is not ranked at the crown; an approved one is', async () => {
      const good = await seedUser('good');
      const slow = await seedUser('slow');
      const fan = await seedUser('fan');
      await setupFinal([good, slow]);
      processor.probe = { durationSeconds: 4, hasVideoStream: true }; // one sampled frame per video
      const v1 = await uploadVideo(good);
      const v2 = await uploadVideo(slow);
      // the check approves the first and holds the second (between the thresholds)
      moderation.labelsFor = (i) => (i >= 1 ? [{ name: 'Rude Gestures', parentName: null, confidence: 70 }] : []);
      await finalEntry(good, { contentText: 'a', mediaId: v1 }).expect(201);
      const slowPost = (await finalEntry(slow, { contentText: 'b', mediaId: v2 }).expect(201)).body.post.id as string;
      await runChecks();
      expect((await row(v1)).status).toBe('approved');
      expect((await row(v2)).status).toBe('pending');

      at(REVEAL);
      await getPost(fan, slowPost).expect(404);
      const live = await request(http()).get('/contest/final-week/carousel').set(fan.auth).expect(200);
      expect(live.body.items).toHaveLength(1);

      at(MONTH_END);
      await app.get(ContestLifecycleService).runOnce(new Date(clockNow));
      const entries = await prisma().contestEntry.findMany({ where: { round: { weekNumber: 4 } }, orderBy: { submittedAt: 'asc' } });
      expect(entries).toHaveLength(2);
      const byUser = new Map(entries.map((e) => [e.userId, e]));
      expect(byUser.get(good.id)!.finalRank).not.toBeNull();
      expect(byUser.get(slow.id)!.finalRank).toBeNull(); // hidden entries are never ranked
    });

    it("a contest entry's file cannot be removed by its owner (409), so a finalist cannot swap the video after the window", async () => {
      const f = await seedUser('finalist');
      await setupFinal([f]);
      const video = await uploadVideo(f);
      await finalEntry(f, { contentText: 'my final', mediaId: video }).expect(201);
      const res = await request(http()).delete(`/media/uploads/${video}`).set(f.auth).expect(409);
      expect(res.body.code).toBe('media_in_contest_entry');
      expect(await prisma().postMedia.count({ where: { id: video } })).toBe(1);
    });
  });

  // =================================================================================================
  // backend/media-privacy-vetting-followups (B-257, B-259; Decision Log #430 items 2 and 4)
  describe('private prefix, signed view links, the payload media field, HEIC, guards and the unattached purge', () => {
    it('the uploader reads a pending file through a short-lived signed viewUrl to the PRIVATE object; url (the public location) is unchanged and not fetchable yet', async () => {
      const u = await seedUser('a');
      const other = await seedUser('b');
      const id = await uploadImage(u);

      const own = await getUpload(u, id).expect(200);
      expect(own.body.viewUrl).toBe(`https://view.test/private-media/${u.id}/${id}.jpg?ttl=300`);
      expect(new Date(own.body.viewUrlExpiresAt).getTime()).toBe(clockNow.getTime() + 300_000);
      expect(own.body.url).toBe(`https://cdn.test/post-media/${u.id}/${id}.jpg`); // not removed or renamed
      expect(storage.has(`post-media/${u.id}/${id}.jpg`)).toBe(false); // ... and nothing is there yet
      await getUpload(other, id).expect(404); // nobody else gets a link
    });

    it('once the automatic check approves it, the file is public, the private original is gone, and viewUrl points at the public object', async () => {
      const u = await seedUser('a');
      const id = await approvedImage(u);
      expect(storage.has(`post-media/${u.id}/${id}.jpg`)).toBe(true);
      expect(storage.has(`private-media/${u.id}/${id}.jpg`)).toBe(false);
      expect(storage.copies).toEqual([[`private-media/${u.id}/${id}.jpg`, `post-media/${u.id}/${id}.jpg`]]);
      const own = await getUpload(u, id).expect(200);
      expect(own.body.viewUrl).toContain(`/post-media/${u.id}/${id}.jpg`);
      expect(await row(id)).toMatchObject({ privateKey: null, status: 'approved' });
      expect((await row(id)).publishedAt).not.toBeNull();
    });

    it('a rejected file stays PRIVATE and its author can still view it; no public object ever exists', async () => {
      const u = await seedUser('a');
      const id = await uploadImage(u);
      moderation.labelsFor = () => [{ name: 'Explicit', parentName: null, confidence: 99 }];
      await runChecks();
      expect((await row(id)).status).toBe('rejected');
      expect(storage.has(`private-media/${u.id}/${id}.jpg`)).toBe(true);
      expect(storage.keysWithPrefix('post-media/')).toEqual([]);
      expect(storage.copies).toEqual([]);
      const own = await getUpload(u, id).expect(200);
      expect(own.body.viewUrl).toContain(`private-media/${u.id}/${id}.jpg`);
    });

    it('post payloads list media as [{ id, kind }]; the AUTHOR gets viewUrl only while a file is not public; nobody else can see the post until it is approved', async () => {
      const author = await seedUser('author');
      const fan = await seedUser('fan');
      const mediaId = await uploadImage(author);
      const postId = (await createPost(author, { contentText: 'a picture', mediaIds: [mediaId] }).expect(201)).body.id as string;

      const created = await getPost(author, postId).expect(200);
      expect(created.body.media).toEqual([{ id: mediaId, kind: 'image', viewUrl: `https://view.test/private-media/${author.id}/${mediaId}.jpg?ttl=300` }]);
      await getPost(fan, postId).expect(404);
      const feed = await request(http()).get('/posts/feed').set(author.auth).expect(200);
      expect(feed.body.items.find((p: { id: string }) => p.id === postId).media).toEqual(created.body.media);

      await runChecks(); // approves it (no labels)
      const fanView = await getPost(fan, postId).expect(200);
      expect(fanView.body.media).toEqual([{ id: mediaId, kind: 'image' }]); // exactly { id, kind }, no link
      expect(JSON.stringify(fanView.body.media)).not.toMatch(/private-media|viewUrl/);
      expect(fanView.body.mediaUrls).toEqual([`https://cdn.test/post-media/${author.id}/${mediaId}.jpg`]);
      const authorView = await getPost(author, postId).expect(200);
      expect(authorView.body.media).toEqual([{ id: mediaId, kind: 'image' }]); // public now: no private link either
    });

    it('a post with no files has an empty media list, and the creation response carries the attached files', async () => {
      const u = await seedUser('a');
      const plain = await createPost(u, { contentText: 'text only' }).expect(201);
      expect(plain.body.media).toEqual([]);
      const mediaId = await uploadImage(u);
      const withFile = await createPost(u, { contentText: 'with a file', mediaIds: [mediaId] }).expect(201);
      expect(withFile.body.media).toEqual([expect.objectContaining({ id: mediaId, kind: 'image' })]);
    });

    describe('HEIC / HEIF', () => {
      it.each(['image/heic', 'image/heif'])('a declared %s is refused with its own code and plain message, and nothing is stored', async (contentType) => {
        const u = await seedUser('a');
        const res = await link(u, contentType, 100).expect(400);
        expect(res.body.code).toBe('heic_not_supported');
        expect(res.body.message).toMatch(/HEIC photos/);
        expect(res.body.message).toMatch(/JPEG or PNG/);
        expect(await prisma().postMedia.count()).toBe(0);
        expect(storage.issuedLinks).toHaveLength(0);
      });

      it('a HEIC photo sent under image/jpeg is refused on confirm with the same code, and discarded', async () => {
        const u = await seedUser('a');
        const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(64)]);
        const id = await startAndPut(u, heic, 'image/jpeg');
        const res = await confirm(u, id).expect(400);
        expect(res.body.code).toBe('heic_not_supported');
        expect(storage.keysWithPrefix('private-media/')).toEqual([]);
        expect(storage.keysWithPrefix('post-media/')).toEqual([]);
        expect(storage.has(qKey(u, id))).toBe(false);
        expect(await prisma().postMedia.count({ where: { id } })).toBe(0);
      });
    });

    describe('upload routes carry the POST /posts guards', () => {
      it('an unverified email is refused (403 email_verification_required) on both routes', async () => {
        const u = await seedUser('a');
        await prisma().user.update({ where: { id: u.id }, data: { verificationStatus: 'unverified' } });
        const l = await link(u, 'image/jpeg', 100).expect(403);
        expect(l.body.code).toBe('email_verification_required');
        await confirm(u, 'whatever').expect(403);
        expect(await prisma().postMedia.count()).toBe(0);
      });

      it('an incomplete profile (no username yet) is refused (403 profile_incomplete) on both routes', async () => {
        const u = await seedUser('a');
        await prisma().user.update({ where: { id: u.id }, data: { username: null } });
        const l = await link(u, 'image/jpeg', 100).expect(403);
        expect(l.body.code).toBe('profile_incomplete');
        await confirm(u, 'whatever').expect(403);
        expect(await prisma().postMedia.count()).toBe(0);
      });

      it('reading and deleting your own upload still need only authentication (an account restricted later can remove what it holds)', async () => {
        const u = await seedUser('a');
        const id = await uploadImage(u);
        await prisma().user.update({ where: { id: u.id }, data: { verificationStatus: 'unverified', username: null } });
        await getUpload(u, id).expect(200);
        await request(http()).delete(`/media/uploads/${id}`).set(u.auth).expect(204);
      });
    });

    describe('the 7-day purge of confirmed uploads that were never attached to a post', () => {
      it('removes a stale unattached upload (objects first, then the row), keeps a fresh one and an attached one, and never touches a rejected one', async () => {
        const u = await seedUser('a');
        const stale = await uploadImage(u);
        const rejected = await uploadImage(u);
        const attached = await uploadImage(u);
        await createPost(u, { contentText: 'attached', mediaIds: [attached] }).expect(201);
        await prisma().postMedia.update({ where: { id: rejected }, data: { status: 'rejected', decisionSource: 'auto', decidedAt: new Date(), rejectionReason: 'x' } });

        advance(6 * 24 * 3600 * 1000);
        const fresh = await uploadImage(u);
        advance(2 * 24 * 3600 * 1000); // stale ones are 8 days old, fresh 2 days

        const out = await app.get(PostMediaService).purgeUnattached(new Date(clockNow));

        expect(out).toEqual({ purged: 1, failed: 0 });
        expect(await prisma().postMedia.count({ where: { id: stale } })).toBe(0);
        expect(storage.has(`private-media/${u.id}/${stale}.jpg`)).toBe(false);
        expect(await prisma().postMedia.count({ where: { id: fresh } })).toBe(1);
        expect(await prisma().postMedia.count({ where: { id: attached } })).toBe(1);
        expect(storage.has(`private-media/${u.id}/${attached}.jpg`)).toBe(true);
        // the rejected file: row and private object both kept, however old
        expect(await prisma().postMedia.count({ where: { id: rejected } })).toBe(1);
        expect(storage.has(`private-media/${u.id}/${rejected}.jpg`)).toBe(true);
      });

      it('is exactly 7 days by default: nothing is purged at 6 days', async () => {
        const u = await seedUser('a');
        await uploadImage(u);
        advance(6 * 24 * 3600 * 1000);
        expect((await app.get(PostMediaService).purgeUnattached(new Date(clockNow))).purged).toBe(0);
      });

      it('a storage failure is logged, the row is kept, and the next run removes it', async () => {
        const u = await seedUser('a');
        const id = await uploadImage(u);
        advance(8 * 24 * 3600 * 1000);
        storage.failDeleteFor.add(`private-media/${u.id}/${id}.jpg`);
        const first = await app.get(PostMediaService).purgeUnattached(new Date(clockNow));
        expect(first).toEqual({ purged: 0, failed: 1 });
        expect(await prisma().postMedia.count({ where: { id } })).toBe(1);

        storage.failDeleteFor.clear();
        expect((await app.get(PostMediaService).purgeUnattached(new Date(clockNow))).purged).toBe(1);
        expect(await prisma().postMedia.count({ where: { id } })).toBe(0);
      });

      it('anonymising an account keeps the private object of a REJECTED file (B-206 OPEN) and removes the rest', async () => {
        const a = await seedUser('a');
        const rejected = await uploadImage(a);
        const pending = await uploadImage(a);
        await prisma().postMedia.update({ where: { id: rejected }, data: { status: 'rejected', decisionSource: 'auto', decidedAt: new Date(), rejectionReason: 'x' } });
        await app.get(AccountDeletionSweepService).anonymizeUser(a.id, false);
        expect(await prisma().postMedia.count({ where: { uploaderId: a.id } })).toBe(0);
        expect(storage.has(`private-media/${a.id}/${rejected}.jpg`)).toBe(true);
        expect(storage.has(`private-media/${a.id}/${pending}.jpg`)).toBe(false);
      });
    });
  });
});
