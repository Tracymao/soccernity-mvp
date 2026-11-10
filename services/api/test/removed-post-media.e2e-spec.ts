import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { PostMediaObjectsService } from '../src/modules/post-media/post-media-objects.service';
import { RejectedMediaSweepService } from '../src/modules/post-media/rejected-media-sweep.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor } from './support/post-media-doubles';

// backend/b290-removed-post-media (B-290; Decision Log #484, on the content-removal columns of #483), against the
// REAL app and REAL Postgres with an in-memory object store.
//
// When a moderator records Remove Content on a POST:
//   * the public copy of every file attached to it is withdrawn right away; a PRIVATE copy is kept as evidence
//     (an approved file normally has none, so the withdraw makes one first);
//   * an overturned appeal clears the removal and the same reconciler publishes the file again;
//   * the private copy is deleted only when the REMOVING report closes (the appeal window lapsed, or the appeal was
//     upheld), through the one protection rule: an uploader under an active admin hold keeps it, and a failed
//     delete is retried on the next run. The media row and the post stay; the row records deletedByModerationAt.
//
// Cron jobs are stopped so only the explicit calls below run. The moderator's PATCH withdraws in the background
// (after the commit), so the tests poll for the outcome.

const rand = () => Math.random().toString(36).slice(2, 10);
const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-10T04:00:00Z');

describe('Removed post media e2e (B-290)', () => {
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
    storage.copies.length = 0;
    storage.failCopy = false;
    storage.unavailable = false;
  });

  // Remove Content / an overturned appeal start their media work in the background (fire and forget, after the commit).
  // Let it finish before the next test's TRUNCATE, or the two can deadlock on the same tables (a test-isolation
  // issue only: production has no TRUNCATE).
  afterEach(async () => {
    await new Promise((r) => setTimeout(r, 750));
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
        email: `e2e-rmv-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `r_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
      } as never,
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  async function seedAdmin(label: string, role = 'moderator') {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-rmv-admin-${label}-${Date.now()}-${rand()}@example.com`, passwordHash: 'x', fullName: `Rmv Admin ${label}`, role },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  /**
   * A post with one APPROVED, PUBLISHED file, as the normal pipeline leaves it: the object is in the public prefix
   * and there is NO private copy (finishPublish deleted it, privateKey is null).
   */
  async function seedPublishedPost(u: U, kind: 'image' | 'video' = 'image') {
    const post = await prisma().post.create({ data: { authorId: u.id, contentText: `post ${rand()}` } });
    const id = `${rand()}${rand()}`;
    const ext = kind === 'image' ? 'jpg' : 'mp4';
    const type = kind === 'image' ? 'image/jpeg' : 'video/mp4';
    const pub = `post-media/${u.id}/${id}.${ext}`;
    const priv = `private-media/${u.id}/${id}.${ext}`;
    await prisma().postMedia.create({
      data: {
        id,
        uploaderId: u.id,
        kind,
        declaredContentType: type,
        declaredSize: 10,
        uploadState: 'ready',
        status: 'approved',
        decisionSource: 'auto',
        decidedAt: NOW,
        privateKey: null,
        publicKey: pub,
        publicUrl: `https://cdn.test/${pub}`,
        publishedAt: new Date(NOW.getTime() - DAY),
        contentType: type,
        byteSize: 10,
        confirmedAt: new Date(NOW.getTime() - 2 * DAY),
        postId: post.id,
        checkState: 'done',
      } as never,
    });
    storage.put(pub, Buffer.from('x'.repeat(10)), type);
    return { postId: post.id, mediaId: id, pub, priv };
  }

  /** A weekly-free "final" round-4 entry on the post, i.e. the post is a contest entry. */
  async function makeContestEntry(u: U, postId: string) {
    const cycle = await prisma().contestCycle.create({
      data: { title: 'Nov', startsAt: new Date('2026-11-01T00:00:00Z'), endsAt: new Date('2026-11-30T23:59:59Z') } as never,
    });
    const round = await prisma().contestRound.create({
      data: { cycleId: cycle.id, weekNumber: 4, opensAt: new Date('2026-11-22T08:00:00Z'), closesAt: new Date('2026-11-25T00:00:00Z') } as never,
    });
    await prisma().contestEntry.create({ data: { cycleId: cycle.id, roundId: round.id, postId, userId: u.id } as never });
  }

  /** The reporter files a report on the post and the moderator removes the content. */
  async function removeContent(postId: string, moderator: { auth: object }) {
    const reporter = await seedUser(`rep-${rand()}`);
    const created = await request(http())
      .post('/reports')
      .set(reporter.auth)
      .send({ targetType: 'post', targetId: postId, reasonCategory: 'harassment_or_bullying', reason: 'e2e' })
      .expect(201);
    const reportId = created.body.id as string;
    await request(http()).patch(`/admin/moderation/reports/${reportId}`).set(moderator.auth as never).send({ action: 'content_removed' }).expect(200);
    return reportId;
  }

  async function waitFor(check: () => boolean | Promise<boolean>, what: string): Promise<void> {
    for (let i = 0; i < 100; i++) {
      if (await check()) return;
      await new Promise((r) => setTimeout(r, 30));
    }
    throw new Error(`timed out waiting for: ${what}`);
  }

  async function hold(userId: string) {
    const admin = await seedAdmin('holder');
    const r = await prisma().report.create({ data: { targetType: 'user', targetId: userId, reason: 'e2e hold', status: 'open' } as never });
    return prisma().accountHold.create({
      data: { userId, reportId: r.id, placedByAdminId: admin.id, placeReason: 'e2e legal hold reason', type: 'legal_hold' } as never,
    });
  }

  const sweep = () => app.get(RejectedMediaSweepService);
  const objects = () => app.get(PostMediaObjectsService);
  const row = (id: string) => prisma().postMedia.findUniqueOrThrow({ where: { id } });

  // =================================================================================================
  describe('Remove Content on a post', () => {
    it('withdraws the public copy right away and keeps a PRIVATE copy; the row and the post stay', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      const moderator = await seedAdmin('m');
      await removeContent(m.postId, moderator);

      await waitFor(() => !storage.has(m.pub), 'the public copy to be withdrawn');
      expect(storage.has(m.priv)).toBe(true); // the evidence copy
      expect(storage.copies).toEqual([[m.pub, m.priv]]); // made by copy-then-delete, not a move
      expect(await row(m.mediaId)).toMatchObject({ status: 'approved', privateKey: m.priv, publishedAt: null, deletedByModerationAt: null });
      const post = await prisma().post.findUniqueOrThrow({ where: { id: m.postId } });
      expect(post.removedByModerationAt).not.toBeNull();
    });

    it('a contest-entry video follows the same path (a contest entry is a post with a PostMedia)', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u, 'video');
      await makeContestEntry(u, m.postId);
      const moderator = await seedAdmin('m');
      await removeContent(m.postId, moderator);

      await waitFor(() => !storage.has(m.pub), 'the video to be withdrawn');
      expect(storage.has(m.priv)).toBe(true);
      expect(await row(m.mediaId)).toMatchObject({ kind: 'video', privateKey: m.priv, publishedAt: null });
      expect(await prisma().contestEntry.count({ where: { postId: m.postId } })).toBe(1); // the entry row is not touched
    });

    it('every file of the post is withdrawn, and other posts of the same author are not', async () => {
      const u = await seedUser('a');
      const a = await seedPublishedPost(u);
      const other = await seedPublishedPost(u);
      // a second file on the first post
      const second = `${rand()}${rand()}`;
      const secondPub = `post-media/${u.id}/${second}.jpg`;
      await prisma().postMedia.create({
        data: {
          id: second, uploaderId: u.id, kind: 'image', declaredContentType: 'image/jpeg', declaredSize: 10, uploadState: 'ready',
          status: 'approved', decisionSource: 'auto', decidedAt: NOW, publicKey: secondPub, publicUrl: `https://cdn.test/${secondPub}`,
          publishedAt: NOW, contentType: 'image/jpeg', byteSize: 10, postId: a.postId, checkState: 'done',
        } as never,
      });
      storage.put(secondPub, Buffer.from('y'.repeat(10)), 'image/jpeg');
      await removeContent(a.postId, await seedAdmin('m'));

      await waitFor(() => !storage.has(a.pub) && !storage.has(secondPub), 'both files to be withdrawn');
      expect(storage.has(`private-media/${u.id}/${second}.jpg`)).toBe(true);
      expect(storage.has(other.pub)).toBe(true);
      expect(await row(other.mediaId)).toMatchObject({ publishedAt: expect.any(Date) });
    });

    it('a withdraw that fails leaves the public object in place (the post is already hidden) and the reconciler repairs it', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      storage.failCopy = true;
      await removeContent(m.postId, await seedAdmin('m'));
      expect(await objects().withdrawForPost(m.postId)).toMatchObject({ withdrawn: 0, failed: 1 });
      expect(storage.has(m.pub)).toBe(true);
      expect(await row(m.mediaId)).toMatchObject({ publishedAt: expect.any(Date) });

      storage.failCopy = false;
      expect(await objects().reconcile()).toMatchObject({ withdrawn: 1 });
      expect(storage.has(m.pub)).toBe(false);
      expect(storage.has(m.priv)).toBe(true);
    });

    it('the reconciler never republishes a file whose post is removed', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      await removeContent(m.postId, await seedAdmin('m'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      expect(await objects().reconcile()).toEqual({ withdrawn: 0, published: 0, cleaned: 0 });
      expect(storage.has(m.pub)).toBe(false);
    });
  });

  // =================================================================================================
  describe('an overturned appeal', () => {
    it('clears the removal and republishes the file from the private copy', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      const moderatorA = await seedAdmin('a');
      const moderatorB = await seedAdmin('b', 'superadmin');
      const reportId = await removeContent(m.postId, moderatorA);
      await waitFor(() => !storage.has(m.pub), 'withdraw');

      await request(http()).post(`/reports/${reportId}/appeal`).set(u.auth).send({ reason: 'that was fine' }).expect(201);
      await request(http()).patch(`/admin/moderation/reports/${reportId}/appeal`).set(moderatorB.auth).send({ decision: 'overturned' }).expect(200);

      await waitFor(() => storage.has(m.pub), 'the file to be republished');
      await waitFor(async () => (await row(m.mediaId)).privateKey === null, 'the private original to be dropped again');
      expect(storage.has(m.priv)).toBe(false); // back to the normal approved state: public only
      expect(await row(m.mediaId)).toMatchObject({ status: 'approved', publishedAt: expect.any(Date), deletedByModerationAt: null });
      const post = await prisma().post.findUniqueOrThrow({ where: { id: m.postId } });
      expect(post.removedByModerationAt).toBeNull();
    });

    it('an overturn that missed the immediate republish is repaired by the reconciler', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      const reportId = await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      // The post comes back (as the overturn does) but the republish call never ran.
      await prisma().post.update({ where: { id: m.postId }, data: { removedByModerationAt: null, removedByReportId: null } });
      void reportId;
      expect(await objects().reconcile()).toMatchObject({ published: 1 });
      expect(storage.has(m.pub)).toBe(true);
    });
  });

  // =================================================================================================
  describe('deleting the private copy when the removing report closes', () => {
    it('does NOT delete it before closure: not now, not inside the appeal window, not while an appeal is pending', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      const reportId = await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');

      expect(await sweep().confirmModerationRemovals(new Date())).toMatchObject({ deleted: 0, waiting: 1 });
      expect(await sweep().confirmModerationRemovals(new Date(Date.now() + 29 * DAY))).toMatchObject({ deleted: 0, waiting: 1 });
      expect(storage.has(m.priv)).toBe(true);

      // an appeal is filed: the report is not closed even long after the window
      await request(http()).post(`/reports/${reportId}/appeal`).set(u.auth).send({ reason: 'please look again' }).expect(201);
      expect(await sweep().confirmModerationRemovals(new Date(Date.now() + 90 * DAY))).toMatchObject({ deleted: 0, waiting: 1 });
      expect(storage.has(m.priv)).toBe(true);
      expect(await row(m.mediaId)).toMatchObject({ privateKey: m.priv, deletedByModerationAt: null });
    });

    it('deletes it once the appeal window has lapsed; the row and the post stay and the row says so', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      const at = new Date(Date.now() + 31 * DAY);

      expect(await sweep().confirmModerationRemovals(at)).toMatchObject({ deleted: 1, waiting: 0, failed: 0 });
      expect(storage.has(m.priv)).toBe(false);
      expect(storage.has(m.pub)).toBe(false);
      expect(await row(m.mediaId)).toMatchObject({ privateKey: null, deletedByModerationAt: at, publishedAt: null, postId: m.postId });
      expect(await prisma().post.count({ where: { id: m.postId } })).toBe(1);

      // idempotent
      expect(await sweep().confirmModerationRemovals(at)).toMatchObject({ deleted: 0, waiting: 0 });
      // and the reconciler does not bring it back
      expect(await objects().reconcile()).toEqual({ withdrawn: 0, published: 0, cleaned: 0 });
    });

    it('deletes it when the appeal was UPHELD (closure = the appeal decision)', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      const reportId = await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      await request(http()).post(`/reports/${reportId}/appeal`).set(u.auth).send({ reason: 'please look again' }).expect(201);
      const reviewer = await seedAdmin('b', 'superadmin');
      await request(http()).patch(`/admin/moderation/reports/${reportId}/appeal`).set(reviewer.auth).send({ decision: 'upheld' }).expect(200);

      expect(await sweep().confirmModerationRemovals(new Date(Date.now() + 1000))).toMatchObject({ deleted: 1 });
      expect(storage.has(m.priv)).toBe(false);
    });

    it('an uploader under an active admin hold KEEPS the file; after the hold is lifted the next run deletes it', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      const h = await hold(u.id);
      const at = new Date(Date.now() + 31 * DAY);

      expect(await sweep().confirmModerationRemovals(at)).toMatchObject({ deleted: 0, waiting: 1 });
      expect(storage.has(m.priv)).toBe(true);

      const admin = await seedAdmin('lifter');
      await prisma().accountHold.update({ where: { id: h.id }, data: { liftedAt: at, liftedByAdminId: admin.id, liftReason: 'e2e lift reason' } });
      expect(await sweep().confirmModerationRemovals(at)).toMatchObject({ deleted: 1 });
      expect(storage.has(m.priv)).toBe(false);
    });

    it('another report still open on the post also keeps it (the existing protection rule, unchanged)', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      await prisma().report.create({ data: { targetType: 'post', targetId: m.postId, reason: 'a second report', status: 'open' } as never });
      expect(await sweep().confirmModerationRemovals(new Date(Date.now() + 31 * DAY))).toMatchObject({ deleted: 0, waiting: 1 });
      expect(storage.has(m.priv)).toBe(true);
    });

    it('a delete that fails is retried on the next run', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');
      const at = new Date(Date.now() + 31 * DAY);

      storage.failDeleteFor.add(m.priv);
      expect(await sweep().confirmModerationRemovals(at)).toMatchObject({ deleted: 0, failed: 1 });
      expect(storage.has(m.priv)).toBe(true);
      expect(await row(m.mediaId)).toMatchObject({ privateKey: m.priv, deletedByModerationAt: null });

      storage.failDeleteFor.clear();
      expect(await sweep().confirmModerationRemovals(at)).toMatchObject({ deleted: 1, failed: 0 });
      expect(storage.has(m.priv)).toBe(false);
      expect(await row(m.mediaId)).toMatchObject({ privateKey: null, deletedByModerationAt: at });
    });

    it('a file that is still published waits (the reconciler withdraws it first)', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      storage.failCopy = true;
      await removeContent(m.postId, await seedAdmin('a'));
      await objects().withdrawForPost(m.postId);
      expect(await sweep().confirmModerationRemovals(new Date(Date.now() + 31 * DAY))).toMatchObject({ deleted: 0 });
      expect(storage.has(m.pub)).toBe(true);
    });
  });

  // =================================================================================================
  describe('the author deletes the removed post before the report closes', () => {
    it('the private copy is NOT deleted with the row: it is recorded and deleted by the daily sweep once the report is closed', async () => {
      const u = await seedUser('a');
      const m = await seedPublishedPost(u);
      await removeContent(m.postId, await seedAdmin('a'));
      await waitFor(() => !storage.has(m.pub), 'withdraw');

      await request(http()).delete(`/posts/${m.postId}`).set(u.auth).expect(204);
      expect(await prisma().postMedia.count({ where: { id: m.mediaId } })).toBe(0);
      expect(storage.has(m.priv)).toBe(true);
      expect(await prisma().postMediaDeferredDeletion.findMany()).toMatchObject([{ objectKey: m.priv, mediaId: m.mediaId, uploaderId: u.id }]);

      expect(await sweep().processDeferred(new Date())).toMatchObject({ deleted: 0, stillProtected: 1 });
      expect(storage.has(m.priv)).toBe(true);
      expect(await sweep().processDeferred(new Date(Date.now() + 31 * DAY))).toMatchObject({ deleted: 1 });
      expect(storage.has(m.priv)).toBe(false);
    });
  });
});
