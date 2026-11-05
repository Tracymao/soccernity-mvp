import { INestApplication, ServiceUnavailableException, ValidationPipe } from '@nestjs/common';
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
import { ProfileImageCheckService } from '../src/modules/users/profile-image-check.service';
import { UserImageReviewService } from '../src/modules/users/user-image-review.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor, makeJpeg } from './support/post-media-doubles';

// backend/b037-profile-image-review (B-037; Decision Log #411 item 1, #468), against the REAL app and REAL Postgres:
// avatars and cover photos in the EXISTING moderator media review queue. External seams are in-memory (object store,
// Rekognition, ffmpeg); images still go through the real sharp. The clock is fake and the cron jobs are stopped, so
// only the explicit calls below advance anything.

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const SUGGESTIVE = [{ name: 'Suggestive', parentName: null, confidence: 60 }]; // between pass (40) and reject (90): needs a person
const PUBLIC_PREFIXES = ['post-media/', 'profile-media/'];
const publiclyReadable = (key: string) => PUBLIC_PREFIXES.some((p) => key.startsWith(p));
// A real (8x8) JPEG: profile pictures are re-encoded with real sharp (B-205).
const JPEG = Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIMAnDx//9k=',
  'base64',
);

describe('Profile pictures in the media review queue e2e (B-037)', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  const processor = new TestMediaProcessor();
  const moderation = new FakeModerationClient();
  let clockNow = new Date('2026-11-05T10:00:00Z');
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();
  const advance = (ms: number) => {
    clockNow = new Date(clockNow.getTime() + ms);
  };
  const runProfileChecks = () => app.get(ProfileImageCheckService).runDueChecks(new Date(clockNow));
  const runPostChecks = () => app.get(MediaCheckService).runDueChecks(new Date(clockNow));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue({ now: () => new Date(clockNow) })
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
    storage.unavailable = false;
    storage.failCopy = false;
    storage.corruptCopyTo = null;
    storage.copies.length = 0;
    storage.failDeleteFor.clear();
    storage.issuedLinks.length = 0;
    storage.issuedViewLinks.length = 0;
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

  async function seedUser(label: string, o: { minor?: boolean } = {}): Promise<U> {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-b037-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `q_${label}_${rand()}`.slice(0, 22).toLowerCase(),
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
          consentStatus: 'confirmed',
        },
      });
    }
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: bearer(accessToken.token) };
  }

  async function adminAuth(role: 'moderator' | 'superadmin' | 'editor' = 'moderator', vetted = false) {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-b037-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Review Admin', role, childSafetyVetted: vetted },
    });
    return { id: admin.id, auth: bearer((await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token) };
  }

  type Kind = 'avatar' | 'cover';
  const row = (u: U) => prisma().user.findUniqueOrThrow({ where: { id: u.id } });
  const keyOf = async (u: U, kind: Kind) => (await row(u))[`${kind}Key`] as string | null;
  const statusOf = async (u: U, kind: Kind) => (await row(u))[`${kind}Status`] as string | null;
  const checkRow = (u: U, kind: Kind) => prisma().profileImageCheck.findUnique({ where: { userId_kind: { userId: u.id, kind } } });
  const upload = (u: U, kind: Kind) =>
    request(http()).post(`/users/${u.id}/${kind}`).set(u.auth).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' });
  const itemId = async (u: U, kind: Kind) => `${kind}:${u.id}:${(await keyOf(u, kind))!.split('/').pop()}`;
  const list = (a: { auth: object }, query: Record<string, string | number | undefined> = {}) =>
    request(http()).get('/admin/media-review').query(query).set(a.auth as Record<string, string>);
  const notificationsOf = async (u: U) =>
    (await request(http()).get('/notifications').set(u.auth).expect(200)).body.items as Array<{ type: string; data: unknown }>;
  const setUploadedAt = (u: U, kind: Kind, at: Date | null) =>
    prisma().user.update({ where: { id: u.id }, data: { [`${kind}UploadedAt`]: at } });

  /** Uploads a picture and runs the automatic check so that it comes back "uncertain": waiting for a person. */
  async function waitingForReview(u: U, kind: Kind): Promise<string> {
    moderation.labelsFor = () => SUGGESTIVE;
    await upload(u, kind).expect(201);
    await runProfileChecks();
    expect(await checkRow(u, kind)).toMatchObject({ state: 'review' });
    return itemId(u, kind);
  }

  /** A post-media item that the automatic check left uncertain (so it is in the queue). */
  async function waitingPostMedia(u: U): Promise<string> {
    moderation.labelsFor = () => SUGGESTIVE;
    const buf = await makeJpeg({ width: 10 + Math.floor(Math.random() * 20) });
    const res = await request(http()).post('/media/uploads').set(u.auth).send({ contentType: 'image/jpeg', size: buf.length }).expect(201);
    storage.put(`quarantine/${u.id}/${res.body.id}`, buf, 'image/jpeg');
    await request(http()).post(`/media/uploads/${res.body.id}/confirm`).set(u.auth).expect(200);
    await runPostChecks();
    return res.body.id as string;
  }

  const ids = (body: { items: Array<{ id: string }> }) => body.items.map((i) => i.id);

  // ---- which pictures are in the queue ------------------------------------------------------------

  describe('which pictures are in the queue', () => {
    it('not one the check has yet to look at, or is retrying', async () => {
      const mod = await adminAuth();
      const retrying = await seedUser('retrying');
      moderation.failTimes = 1;
      await upload(retrying, 'avatar').expect(201);
      await runProfileChecks(); // the single check fails -> bookkeeping state 'retry'
      expect(await checkRow(retrying, 'avatar')).toMatchObject({ state: 'retry' });
      moderation.failTimes = 0;

      const unchecked = await seedUser('unchecked');
      await upload(unchecked, 'cover').expect(201); // no check row yet; the configured check will pick it up

      expect((await list(mod).expect(200)).body.items).toEqual([]);
    });

    it('a picture the check left uncertain or gave up on; not one it approved or rejected', async () => {
      const mod = await adminAuth();
      const uncertain = await seedUser('uncertain');
      const gaveUp = await seedUser('gaveup');
      const approved = await seedUser('approved');
      const rejected = await seedUser('rejected');

      moderation.labelsFor = () => SUGGESTIVE;
      await upload(uncertain, 'cover').expect(201);
      await upload(gaveUp, 'avatar').expect(201);
      await runProfileChecks();
      await prisma().profileImageCheck.updateMany({ where: { userId: gaveUp.id }, data: { state: 'gave_up', nextAttemptAt: null } });

      moderation.labelsFor = () => [];
      await upload(approved, 'avatar').expect(201);
      await runProfileChecks();
      moderation.labelsFor = () => [{ name: 'Explicit', parentName: null, confidence: 99 }];
      await upload(rejected, 'avatar').expect(201);
      await runProfileChecks();

      expect(await statusOf(approved, 'avatar')).toBe('approved');
      expect(await statusOf(rejected, 'avatar')).toBe('rejected');

      const res = await list(mod).expect(200);
      expect(ids(res.body).sort()).toEqual([await itemId(uncertain, 'cover'), await itemId(gaveUp, 'avatar')].sort());
    });

    it('with the automatic check NOT configured every pending picture waits for a person, whatever its bookkeeping', async () => {
      const mod = await adminAuth();
      const a = await seedUser('a');
      const b = await seedUser('b');
      await upload(a, 'avatar').expect(201);
      await upload(b, 'cover').expect(201);
      // an orphaned 'retry' row from when the check WAS configured
      await prisma().profileImageCheck.create({ data: { userId: b.id, kind: 'cover', objectKey: (await keyOf(b, 'cover'))!, state: 'retry' } });

      moderation.configured = true;
      expect((await list(mod).expect(200)).body.items).toEqual([]); // configured: the check will decide them
      moderation.configured = false;
      const res = await list(mod).expect(200);
      expect(ids(res.body).sort()).toEqual([await itemId(a, 'avatar'), await itemId(b, 'cover')].sort());
    });

    it('the status and source filters: profile pictures appear only for "pending" and the automatic-check source', async () => {
      const mod = await adminAuth();
      const u = await seedUser('u');
      await waitingForReview(u, 'avatar');
      expect((await list(mod, { status: 'approved' }).expect(200)).body.items).toEqual([]);
      expect((await list(mod, { status: 'rejected' }).expect(200)).body.items).toEqual([]);
      expect((await list(mod, { source: 'user_report' }).expect(200)).body.items).toEqual([]);
      expect((await list(mod, { source: 'auto_check' }).expect(200)).body.items).toHaveLength(1);
    });

    it('is closed to an editor', async () => {
      const editor = await adminAuth('editor');
      await list(editor).expect(403);
    });
  });

  // ---- the item ---------------------------------------------------------------------------------------

  describe('the item', () => {
    it.each(['avatar', 'cover'] as const)('shows the %s: type, public name and id only, age, a signed link to the PRIVATE file, no labels', async (kind) => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      const id = await waitingForReview(owner, kind);
      const at = new Date(clockNow.getTime() - 90 * 1000);
      await setUploadedAt(owner, kind, at);

      const res = await list(mod).expect(200);
      expect(res.body.items).toHaveLength(1);
      const item = res.body.items[0];
      expect(item).toMatchObject({
        id,
        type: kind === 'avatar' ? 'profile_avatar' : 'profile_cover',
        kind: 'image',
        contentType: 'image/jpeg',
        status: 'pending',
        awaitingDecision: true,
        sources: ['auto_check'],
        reportCount: 0,
        reportReasons: [],
        checkLabels: [],
        postId: null,
        uploader: { id: owner.id, publicName: expect.stringMatching(/^q_owner_/) },
        uploadedAt: at.toISOString(),
        ageSeconds: 90,
      });
      const key = (await keyOf(owner, kind))!;
      expect(key).toMatch(/^private-profile\//);
      expect(item.viewUrl).toBe(`https://view.test/${key}?ttl=300`);
      expect(publiclyReadable(key)).toBe(false);
      // No email, no real name, no percentages.
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('@example.com');
      expect(text).not.toContain('Real Name');

      const one = await request(http()).get(`/admin/media-review/${id}`).set(mod.auth).expect(200);
      expect(one.body).toMatchObject({ id, type: item.type, status: 'pending' });
    });

    it('a picture of unknown age (uploaded before the column existed) is listed as the OLDEST, with age null', async () => {
      const mod = await adminAuth();
      const old = await seedUser('old');
      const fresh = await seedUser('fresh');
      await waitingForReview(old, 'avatar');
      await waitingForReview(fresh, 'avatar');
      await setUploadedAt(old, 'avatar', null);
      await setUploadedAt(fresh, 'avatar', new Date(clockNow.getTime() - 1000));
      const newest = await list(mod).expect(200);
      expect(ids(newest.body)).toEqual([await itemId(fresh, 'avatar'), await itemId(old, 'avatar')]);
      expect(newest.body.items[1]).toMatchObject({ uploadedAt: null, ageSeconds: null });
      const oldest = await list(mod, { order: 'oldest' }).expect(200);
      expect(ids(oldest.body)).toEqual([await itemId(old, 'avatar'), await itemId(fresh, 'avatar')]);
    });
  });

  // ---- one list, one cursor, both kinds -----------------------------------------------------------

  describe('paging across both kinds', () => {
    async function seedMixed() {
      const mod = await adminAuth();
      const a = await seedUser('a');
      const b = await seedUser('b');
      const t = (m: number) => new Date(Date.UTC(2026, 10, 5, 9, m));
      const p1 = await waitingPostMedia(a);
      const p2 = await waitingPostMedia(a);
      await prisma().postMedia.update({ where: { id: p1 }, data: { confirmedAt: t(1) } });
      await prisma().postMedia.update({ where: { id: p2 }, data: { confirmedAt: t(3) } });
      const a1 = await waitingForReview(a, 'avatar');
      const c1 = await waitingForReview(a, 'cover');
      const a2 = await waitingForReview(b, 'avatar');
      await setUploadedAt(a, 'avatar', t(2));
      await setUploadedAt(a, 'cover', t(4));
      await setUploadedAt(b, 'avatar', t(5));
      return { mod, expectedNewest: [a2, c1, p2, a1, p1] };
    }

    it.each([1, 2, 3, 20])('newest first, page size %i: every item once, in time order, across post media and pictures', async (limit) => {
      const { mod, expectedNewest } = await seedMixed();
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const res: request.Response = await list(mod, { limit, cursor: cursor ?? undefined }).expect(200);
        seen.push(...ids(res.body));
        cursor = res.body.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(seen).toEqual(expectedNewest);
    });

    it('oldest first walks the same items in the opposite order', async () => {
      const { mod, expectedNewest } = await seedMixed();
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const res: request.Response = await list(mod, { limit: 2, order: 'oldest', cursor: cursor ?? undefined }).expect(200);
        seen.push(...ids(res.body));
        cursor = res.body.nextCursor;
      } while (cursor);
      expect(seen).toEqual([...expectedNewest].reverse());
    });

    it('a page of post media only still carries the old cursor shape, and an old-shape cursor still works', async () => {
      const mod = await adminAuth();
      const a = await seedUser('a');
      const p1 = await waitingPostMedia(a);
      const p2 = await waitingPostMedia(a);
      const first = await list(mod, { limit: 1 }).expect(200);
      expect(ids(first.body)).toEqual([p2]);
      const decoded = JSON.parse(Buffer.from(first.body.nextCursor, 'base64url').toString('utf8'));
      expect(Object.keys(decoded)).toEqual(['sequence']);
      const legacy = Buffer.from(JSON.stringify({ sequence: decoded.sequence }), 'utf8').toString('base64url');
      expect(ids((await list(mod, { limit: 5, cursor: legacy }).expect(200)).body)).toEqual([p1]);
    });

    it('a malformed cursor is a 400', async () => {
      const mod = await adminAuth();
      await list(mod, { cursor: 'nonsense' }).expect(400);
      const bad = Buffer.from(JSON.stringify({ profile: { at: -5, id: 'x' } }), 'utf8').toString('base64url');
      await list(mod, { cursor: bad }).expect(400);
    });
  });

  // ---- approve ---------------------------------------------------------------------------------------

  describe('approve', () => {
    it.each(['avatar', 'cover'] as const)('publishes the %s exactly as the automatic check does: copy, verify, then flip; no notification', async (kind) => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      const viewer = await seedUser('viewer');
      const id = await waitingForReview(owner, kind);
      const privateKey = (await keyOf(owner, kind))!;
      const publicKey = privateKey.replace('private-profile/', 'profile-media/');

      const res = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(200);
      expect(res.body).toEqual({ id, outcome: 'approved', status: 'approved' });

      expect(storage.copies).toEqual([[privateKey, publicKey]]);
      expect(storage.has(publicKey)).toBe(true);
      expect(storage.has(privateKey)).toBe(false);
      expect(await keyOf(owner, kind)).toBe(publicKey);
      expect(await statusOf(owner, kind)).toBe('approved');
      expect(await checkRow(owner, kind)).toBeNull();
      const profile = await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200);
      expect(profile.body[`${kind}Url`]).toBe(`https://cdn.test/${publicKey}`);
      expect(await notificationsOf(owner)).toEqual([]);

      const log = await prisma().adminActionLog.findMany({ where: { targetType: 'profile_image' } });
      expect(log).toEqual([expect.objectContaining({ adminId: mod.id, action: 'media.approved', targetId: owner.id, notes: kind })]);
      // gone from the queue; a repeat is a conflict that changes nothing
      expect((await list(mod).expect(200)).body.items).toEqual([]);
      const again = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(409);
      expect(again.body.code).toBe('already_decided');
      expect(await prisma().adminActionLog.count({ where: { targetType: 'profile_image' } })).toBe(1);
    });

    it('fails closed: if the copy fails nothing is approved, nothing is public, and a retry works', async () => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      const id = await waitingForReview(owner, 'avatar');
      const privateKey = (await keyOf(owner, 'avatar'))!;
      storage.failCopy = true;
      const res = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(503);
      expect(res.body.code).toBe('media_publish_failed');
      expect(await statusOf(owner, 'avatar')).toBe('pending');
      expect(await keyOf(owner, 'avatar')).toBe(privateKey);
      expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
      expect(await prisma().adminActionLog.count({ where: { targetType: 'profile_image' } })).toBe(0);

      storage.failCopy = false;
      await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(200);
      expect(await statusOf(owner, 'avatar')).toBe('approved');
    });

    it('a re-upload since the moderator looked can never be approved by the old decision', async () => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      const oldId = await waitingForReview(owner, 'avatar');
      const oldKey = (await keyOf(owner, 'avatar'))!;

      await upload(owner, 'avatar').expect(201); // a NEW file: new key, pending again
      const newKey = (await keyOf(owner, 'avatar'))!;
      expect(newKey).not.toBe(oldKey);

      await request(http()).post(`/admin/media-review/${oldId}/approve`).set(mod.auth).expect(404);
      await request(http()).post(`/admin/media-review/${oldId}/reject`).set(mod.auth).send({ reason: 'Too dark' }).expect(404);
      await request(http()).get(`/admin/media-review/${oldId}`).set(mod.auth).expect(404);
      // the new picture is untouched and still private
      expect(await statusOf(owner, 'avatar')).toBe('pending');
      expect(await keyOf(owner, 'avatar')).toBe(newKey);
      expect(storage.has(newKey)).toBe(true);
      expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
      expect(await notificationsOf(owner)).toEqual([]);
    });

    it('a picture that is not in the queue (the check is still retrying it) cannot be decided', async () => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      await upload(owner, 'avatar').expect(201);
      const id = await itemId(owner, 'avatar');
      const res = await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(409);
      expect(res.body.code).toBe('not_in_review_queue');
      await request(http()).get(`/admin/media-review/${id}`).set(mod.auth).expect(404);
      expect(await statusOf(owner, 'avatar')).toBe('pending');
    });

    it('with the check not configured a pending picture can be approved straight away', async () => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      moderation.configured = false;
      await upload(owner, 'cover').expect(201);
      const id = await itemId(owner, 'cover');
      await request(http()).post(`/admin/media-review/${id}/approve`).set(mod.auth).expect(200);
      expect(await statusOf(owner, 'cover')).toBe('approved');
    });
  });

  // ---- reject ----------------------------------------------------------------------------------------

  describe('reject', () => {
    it.each(['avatar', 'cover'] as const)('rejects the %s with a reason: one notification, the file stays private, one audit row', async (kind) => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      const id = await waitingForReview(owner, kind);
      const privateKey = (await keyOf(owner, kind))!;

      const res = await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: '  Not a clear photo of you  ' }).expect(200);
      expect(res.body).toEqual({ id, outcome: 'rejected', status: 'rejected' });

      const stored = await row(owner);
      expect(stored[`${kind}Status`]).toBe('rejected');
      expect(stored[`${kind}RejectionReason`]).toBe('Not a clear photo of you');
      expect(stored[`${kind}Key`]).toBe(privateKey);
      expect(storage.has(privateKey)).toBe(true);
      expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
      expect(await checkRow(owner, kind)).toBeNull();
      const notes = (await notificationsOf(owner)).filter((n) => n.type === 'profile_image_rejected');
      expect(notes).toHaveLength(1);

      const log = await prisma().adminActionLog.findMany({ where: { targetType: 'profile_image' } });
      expect(log).toEqual([
        expect.objectContaining({ adminId: mod.id, action: 'media.rejected', targetId: owner.id, notes: `${kind}: Not a clear photo of you` }),
      ]);
      expect((await list(mod).expect(200)).body.items).toEqual([]);

      // a repeat is a 409 with no second notification and no second log row
      const again = await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'again' }).expect(409);
      expect(again.body.code).toBe('already_decided');
      expect((await notificationsOf(owner)).filter((n) => n.type === 'profile_image_rejected')).toHaveLength(1);
      expect(await prisma().adminActionLog.count({ where: { targetType: 'profile_image' } })).toBe(1);
    });

    it('needs a reason: missing, blank and over-long are 400s and decide nothing', async () => {
      const mod = await adminAuth();
      const owner = await seedUser('owner');
      const id = await waitingForReview(owner, 'avatar');
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({}).expect(400);
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: '   ' }).expect(400);
      await request(http()).post(`/admin/media-review/${id}/reject`).set(mod.auth).send({ reason: 'x'.repeat(301) }).expect(400);
      expect(await statusOf(owner, 'avatar')).toBe('pending');
    });
  });

  // ---- rejecting an image that is already approved (the method's own safety) ----------------------

  describe('rejectProfileImage on an already APPROVED picture leaves nothing public', () => {
    async function approvedByCheck(kind: Kind) {
      const owner = await seedUser('owner');
      moderation.labelsFor = () => [];
      await upload(owner, kind).expect(201);
      await runProfileChecks();
      const publicKey = (await keyOf(owner, kind))!;
      expect(publicKey).toMatch(/^profile-media\//);
      expect(storage.has(publicKey)).toBe(true);
      return { owner, publicKey, privateKey: publicKey.replace('profile-media/', 'private-profile/') };
    }
    const reject = (u: U, kind: Kind, key?: string) => app.get(UserImageReviewService).rejectProfileImage(u.id, kind, 'Taken down', key);

    it.each(['avatar', 'cover'] as const)('moves the %s back to the private prefix, deletes the public object, and rejects', async (kind) => {
      const { owner, publicKey, privateKey } = await approvedByCheck(kind);
      await reject(owner, kind);
      expect(storage.has(publicKey)).toBe(false);
      expect(storage.has(privateKey)).toBe(true);
      expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
      const stored = await row(owner);
      expect(stored[`${kind}Status`]).toBe('rejected');
      expect(stored[`${kind}Key`]).toBe(privateKey);
      expect((await notificationsOf(owner)).filter((n) => n.type === 'profile_image_rejected')).toHaveLength(1);
      // the owner now sees a signed link to the private file; other users see nothing
      const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
      expect(mine.body[kind].url).toBe(`https://view.test/${privateKey}?ttl=300`);
      const viewer = await seedUser('viewer');
      expect((await request(http()).get(`/users/${owner.id}/public-profile`).set(viewer.auth).expect(200)).body[`${kind}Url`]).toBeNull();
    });

    it('works the same when the caller passes the published key it saw', async () => {
      const { owner, publicKey, privateKey } = await approvedByCheck('avatar');
      await reject(owner, 'avatar', publicKey);
      expect(storage.has(publicKey)).toBe(false);
      expect(await keyOf(owner, 'avatar')).toBe(privateKey);
    });

    it('if the file cannot be moved NOTHING is rejected and the picture is exactly as it was', async () => {
      const { owner, publicKey } = await approvedByCheck('avatar');
      storage.failCopy = true;
      await expect(reject(owner, 'avatar')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await statusOf(owner, 'avatar')).toBe('approved');
      expect(await keyOf(owner, 'avatar')).toBe(publicKey);
      expect(storage.has(publicKey)).toBe(true);
      expect((await notificationsOf(owner)).filter((n) => n.type === 'profile_image_rejected')).toEqual([]);
    });

    it('if the public object cannot be deleted nothing is rejected; a retry finishes the job with ONE private object', async () => {
      const { owner, publicKey, privateKey } = await approvedByCheck('avatar');
      storage.failDeleteFor.add(publicKey);
      await expect(reject(owner, 'avatar')).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(await statusOf(owner, 'avatar')).toBe('approved');
      expect(storage.has(publicKey)).toBe(true);

      storage.failDeleteFor.clear();
      await reject(owner, 'avatar');
      expect(storage.has(publicKey)).toBe(false);
      expect(storage.keysWithPrefix('private-profile/')).toEqual([privateKey]);
      expect(await statusOf(owner, 'avatar')).toBe('rejected');
      expect((await notificationsOf(owner)).filter((n) => n.type === 'profile_image_rejected')).toHaveLength(1);
    });

    it('a failure between the delete and the database write is recovered by a retry (the file is already moved)', async () => {
      const { owner, publicKey, privateKey } = await approvedByCheck('avatar');
      // Simulate the earlier attempt: private copy made, public object gone, database still says approved.
      await storage.copyObject(publicKey, privateKey, 'image/jpeg');
      await storage.delete(publicKey);
      await reject(owner, 'avatar');
      expect(await statusOf(owner, 'avatar')).toBe('rejected');
      expect(await keyOf(owner, 'avatar')).toBe(privateKey);
      expect(storage.has(privateKey)).toBe(true);
      expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
    });

    it('a re-upload since the caller looked leaves the NEW picture alone and leaves no private copy of the old one', async () => {
      const { owner, publicKey, privateKey } = await approvedByCheck('avatar');
      // The caller saw the published key; the owner then uploads a new picture (which removes the old object).
      await upload(owner, 'avatar').expect(201);
      const newKey = (await keyOf(owner, 'avatar'))!;
      await expect(reject(owner, 'avatar', publicKey)).rejects.toBeDefined();
      expect(await keyOf(owner, 'avatar')).toBe(newKey);
      expect(await statusOf(owner, 'avatar')).toBe('pending');
      expect(storage.has(newKey)).toBe(true);
      expect(storage.has(privateKey)).toBe(false); // the stray copy of the OLD picture is gone
      expect((await notificationsOf(owner)).filter((n) => n.type === 'profile_image_rejected')).toEqual([]);
    });
  });

  // ---- minors -----------------------------------------------------------------------------------------

  describe('a minor\'s picture needs a child-safety-vetted admin', () => {
    it('to anyone else it does not exist: left out of the list, and the SAME 404 as a missing id by id and on a decision', async () => {
      const minor = await seedUser('minor', { minor: true });
      const adult = await seedUser('adult');
      const minorId = await waitingForReview(minor, 'avatar');
      const adultId = await waitingForReview(adult, 'avatar');
      const plain = await adminAuth('moderator', false);
      const vetted = await adminAuth('moderator', true);
      const missing = `avatar:${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}:nofile.jpg`;

      expect(ids((await list(plain).expect(200)).body)).toEqual([adultId]);
      expect(ids((await list(vetted).expect(200)).body).sort()).toEqual([adultId, minorId].sort());

      const gone = await request(http()).get(`/admin/media-review/${missing}`).set(plain.auth).expect(404);
      const calls = [
        () => request(http()).get(`/admin/media-review/${minorId}`).set(plain.auth),
        () => request(http()).post(`/admin/media-review/${minorId}/approve`).set(plain.auth),
        () => request(http()).post(`/admin/media-review/${minorId}/reject`).set(plain.auth).send({ reason: 'x' }),
      ];
      for (const call of calls) {
        const res = await call().expect(404);
        expect(res.body).toEqual(gone.body);
      }
      expect(await statusOf(minor, 'avatar')).toBe('pending');

      await request(http()).get(`/admin/media-review/${minorId}`).set(vetted.auth).expect(200);
      await request(http()).post(`/admin/media-review/${minorId}/reject`).set(vetted.auth).send({ reason: 'Please use a clearer photo' }).expect(200);
      expect(await statusOf(minor, 'avatar')).toBe('rejected');
    });
  });

  // ---- the audit log ----------------------------------------------------------------------------------

  describe('the audit log', () => {
    it('hides a minor\'s profile-picture decisions from an admin who is not vetted, and shows an adult\'s', async () => {
      const minor = await seedUser('minor', { minor: true });
      const adult = await seedUser('adult');
      const minorId = await waitingForReview(minor, 'avatar');
      const adultId = await waitingForReview(adult, 'cover');
      const vetted = await adminAuth('moderator', true);
      await request(http()).post(`/admin/media-review/${minorId}/reject`).set(vetted.auth).send({ reason: 'A reason' }).expect(200);
      await request(http()).post(`/admin/media-review/${adultId}/approve`).set(vetted.auth).expect(200);

      const readLog = (a: { auth: object }) =>
        request(http()).get('/admin/action-log').set(a.auth as Record<string, string>).expect(200).then((r) => r.body.items as Array<{ targetType: string; targetId: string; action: string }>);
      const plainSuper = await adminAuth('superadmin', false);
      const vettedSuper = await adminAuth('superadmin', true);

      const plain = (await readLog(plainSuper)).filter((i) => i.targetType === 'profile_image');
      expect(plain).toEqual([expect.objectContaining({ targetId: adult.id, action: 'media.approved' })]);
      const all = (await readLog(vettedSuper)).filter((i) => i.targetType === 'profile_image');
      expect(all.map((i) => i.targetId).sort()).toEqual([adult.id, minor.id].sort());
    });
  });
});
