import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AnonymizedRowPurgeService } from '../src/modules/account-deletion/anonymized-row-purge.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { PostMediaService } from '../src/modules/post-media/post-media.service';
import { RejectedMediaSweepService } from '../src/modules/post-media/rejected-media-sweep.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor } from './support/post-media-doubles';

// backend/b283-delete-rejected-media (B-283; Decision Log #462 (g), #464), against the REAL app and REAL
// Postgres. A REJECTED file's private object is deleted on every path that removes its row (post deleted,
// upload deleted, quarantine purge, unattached purge, account anonymised, account purged) -- EXCEPT when the
// uploader has an active admin hold or the post has a report not yet closed. Then the object stays, a
// PostMediaDeferredDeletion record is written in the same transaction, and the daily sweep deletes it once
// the protection ends. The sweep also deletes strays (objects with no database row) older than the minimum age.
//
// The object store is the in-memory double; cron jobs are stopped so only the explicit calls below run.

const rand = () => Math.random().toString(36).slice(2, 10);
const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-10T04:00:00Z');

describe('Rejected media deletion e2e (B-283)', () => {
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
        email: `e2e-rej-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `r_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
        ...over,
      } as never,
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  const keys = (u: string, id: string) => ({ priv: `private-media/${u}/${id}.jpg`, pub: `post-media/${u}/${id}.jpg` });

  /** A processed (ready) media row with its private object in the store. */
  async function seedMedia(
    u: U,
    over: { status?: 'rejected' | 'pending' | 'approved'; postId?: string | null; quarantine?: boolean; confirmedAt?: Date } = {},
  ) {
    const id = `${rand()}${rand()}`;
    const k = keys(u.id, id);
    const status = over.status ?? 'rejected';
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
        privateKey: k.priv,
        publicKey: k.pub,
        publicUrl: `https://cdn.test/${k.pub}`,
        contentType: 'image/jpeg',
        byteSize: 10,
        confirmedAt: over.confirmedAt ?? new Date(NOW.getTime() - 30 * DAY),
        createdAt: over.confirmedAt ?? new Date(NOW.getTime() - 30 * DAY),
        quarantineKey: over.quarantine ? `quarantine/${u.id}/${id}` : null,
        postId: over.postId ?? null,
        checkState: 'done',
      } as never,
    });
    storage.put(k.priv, Buffer.from('x'.repeat(10)), 'image/jpeg');
    if (over.quarantine) storage.put(`quarantine/${u.id}/${id}`, Buffer.from('orig'), 'image/jpeg');
    return { ...row, priv: k.priv, pub: k.pub };
  }

  const seedPost = (u: U) => prisma().post.create({ data: { authorId: u.id, contentText: 'a post with media' } });
  const seedAdmin = () =>
    prisma().adminUser.create({
      data: { email: `rej-admin-${Date.now()}-${rand()}@example.com`, passwordHash: 'x', fullName: 'Rej Admin', role: 'moderator' },
    });
  const openReportOn = (postId: string) =>
    prisma().report.create({ data: { targetType: 'post', targetId: postId, reason: 'e2e', status: 'open' } as never });

  async function hold(userId: string, over: Record<string, unknown> = {}) {
    const admin = await seedAdmin();
    const r = await prisma().report.create({ data: { targetType: 'user', targetId: userId, reason: 'e2e hold', status: 'open' } as never });
    return prisma().accountHold.create({
      data: { userId, reportId: r.id, placedByAdminId: admin.id, placeReason: 'e2e legal hold reason', type: 'legal_hold', ...over } as never,
    });
  }

  const sweep = () => app.get(RejectedMediaSweepService);
  const deferrals = () => prisma().postMediaDeferredDeletion.findMany();

  // =================================================================================================
  describe('post deleted by a live account (DELETE /posts/:id)', () => {
    it('deletes the REJECTED file\'s private object along with the row', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      await request(http()).delete(`/posts/${post.id}`).set(u.auth).expect(204);
      expect(await prisma().postMedia.count({ where: { id: m.id } })).toBe(0);
      expect(storage.has(m.priv)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });

    it('an OPEN report on the post: the object stays, the deferral is recorded, and the sweep deletes it once the report is closed', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      const report = await openReportOn(post.id);
      await request(http()).delete(`/posts/${post.id}`).set(u.auth).expect(204);

      expect(await prisma().postMedia.count({ where: { id: m.id } })).toBe(0); // the row is gone
      expect(storage.has(m.priv)).toBe(true); // the object is not
      expect(await deferrals()).toMatchObject([{ objectKey: m.priv, mediaId: m.id, uploaderId: u.id, postId: post.id }]);

      // still open: the daily step leaves it alone
      expect(await sweep().processDeferred(NOW)).toMatchObject({ deleted: 0, stillProtected: 1 });
      expect(storage.has(m.priv)).toBe(true);

      // the report is dismissed long ago: it no longer protects
      await prisma().report.update({ where: { id: report.id }, data: { status: 'reviewed', reviewedAt: new Date('2026-01-01T00:00:00Z') } });
      expect(await sweep().processDeferred(NOW)).toMatchObject({ deleted: 1, stillProtected: 0 });
      expect(storage.has(m.priv)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });

    it('an uploader under an ACTIVE HOLD: the object stays; after the hold is lifted the sweep deletes it', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      const h = await hold(u.id);
      await request(http()).delete(`/posts/${post.id}`).set(u.auth).expect(204);
      expect(storage.has(m.priv)).toBe(true);
      expect(await deferrals()).toHaveLength(1);

      expect(await sweep().processDeferred(NOW)).toMatchObject({ deleted: 0, stillProtected: 1 });

      const admin = await seedAdmin();
      await prisma().accountHold.update({ where: { id: h.id }, data: { liftedAt: NOW, liftedByAdminId: admin.id, liftReason: 'e2e lift reason' } });
      expect(await sweep().processDeferred(NOW)).toMatchObject({ deleted: 1 });
      expect(storage.has(m.priv)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });

    it('a report on ANOTHER post does not protect this one', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const other = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      await openReportOn(other.id);
      await request(http()).delete(`/posts/${post.id}`).set(u.auth).expect(204);
      expect(storage.has(m.priv)).toBe(false);
    });
  });

  // =================================================================================================
  describe('DELETE /media/uploads/:id', () => {
    it("deletes a rejected file's private object", async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      await request(http()).delete(`/media/uploads/${m.id}`).set(u.auth).expect(204);
      expect(storage.has(m.priv)).toBe(false);
      expect(await prisma().postMedia.count({ where: { id: m.id } })).toBe(0);
    });

    it('an uploader under an active hold: the row goes, the object stays and is recorded', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      await hold(u.id);
      await request(http()).delete(`/media/uploads/${m.id}`).set(u.auth).expect(204);
      expect(storage.has(m.priv)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: m.priv, mediaId: m.id, uploaderId: u.id, postId: null }]);
    });
  });

  // =================================================================================================
  describe('the purges', () => {
    it('the unattached purge deletes a rejected file (object, then row); a held uploader\'s file stays, row and object', async () => {
      const free = await seedUser('free');
      const held = await seedUser('held');
      const a = await seedMedia(free);
      const b = await seedMedia(held);
      await hold(held.id);
      const r = await app.get(PostMediaService).purgeUnattached(NOW);
      expect(r).toEqual({ purged: 1, failed: 0, heldBack: 1 });
      expect(storage.has(a.priv)).toBe(false);
      expect(await prisma().postMedia.count({ where: { id: a.id } })).toBe(0);
      expect(storage.has(b.priv)).toBe(true);
      expect(await prisma().postMedia.count({ where: { id: b.id } })).toBe(1);
      // a second run is idempotent: the held file is still held back, nothing else happens
      expect(await app.get(PostMediaService).purgeUnattached(NOW)).toEqual({ purged: 0, failed: 0, heldBack: 1 });
    });

    it('the quarantine purge deletes a rejected file\'s private object with its leftover original; a held uploader\'s row is left whole', async () => {
      const free = await seedUser('free');
      const held = await seedUser('held');
      const a = await seedMedia(free, { quarantine: true });
      const b = await seedMedia(held, { quarantine: true });
      await hold(held.id);
      expect(await app.get(PostMediaService).purgeQuarantine(NOW)).toEqual({ purged: 1 });
      expect(storage.has(a.priv)).toBe(false);
      expect(storage.has(`quarantine/${free.id}/${a.id}`)).toBe(false);
      expect(await prisma().postMedia.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ privateKey: null, quarantineKey: null });
      expect(storage.has(b.priv)).toBe(true);
      expect(storage.has(`quarantine/${held.id}/${b.id}`)).toBe(true);
      expect(await prisma().postMedia.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ privateKey: b.priv });
    });
  });

  // =================================================================================================
  describe('account anonymisation and purge', () => {
    it('anonymising an account deletes its rejected files\' private objects', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, NOW);
      expect(await prisma().postMedia.count({ where: { uploaderId: u.id } })).toBe(0);
      expect(storage.has(m.priv)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });

    it('a surviving post with an OPEN report: the account\'s rejected object is kept and recorded', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      await openReportOn(post.id);
      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, NOW);
      expect(await prisma().postMedia.count({ where: { uploaderId: u.id } })).toBe(0);
      expect(storage.has(m.priv)).toBe(true);
      expect(await deferrals()).toHaveLength(1);
    });

    it('the deferral does not depend on the account row: the purge runs, the record stays, and the sweep still finishes the job', async () => {
      const u = await seedUser('a');
      const post = await seedPost(u);
      const m = await seedMedia(u, { postId: post.id });
      const report = await openReportOn(post.id);
      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, new Date(NOW.getTime() - 40 * DAY));
      expect(storage.has(m.priv)).toBe(true); // kept: the post has an open report
      expect(await deferrals()).toHaveLength(1);

      // The purge job runs (the surviving post still points at the anonymised user, so it keeps that row);
      // either way it neither fails nor touches the record, which has no foreign key to the user.
      const purge = await app.get(AnonymizedRowPurgeService).purgeAnonymizedRows(NOW);
      expect(purge.erroredUserIds).toEqual([]);
      expect(await deferrals()).toHaveLength(1);

      await prisma().report.update({ where: { id: report.id }, data: { status: 'reviewed', reviewedAt: new Date('2026-01-01T00:00:00Z') } });
      expect(await sweep().processDeferred(NOW)).toMatchObject({ deleted: 1 });
      expect(storage.has(m.priv)).toBe(false);
    });

    it("the account purge removes whatever is left under a purged user's prefixes (a stray with no row)", async () => {
      const u = await seedUser('gone', { accountStatus: 'deleted', anonymizedAt: new Date(NOW.getTime() - 40 * DAY), dateOfBirth: null });
      storage.put(`private-media/${u.id}/leftover.jpg`, Buffer.from('x'), 'image/jpeg');
      storage.put(`post-media/${u.id}/leftover2.jpg`, Buffer.from('x'), 'image/jpeg');
      const bystander = await seedUser('bystander');
      storage.put(`private-media/${bystander.id}/other.jpg`, Buffer.from('x'), 'image/jpeg');

      const r = await app.get(AnonymizedRowPurgeService).purgeAnonymizedRows(NOW);
      expect(r.purgedUserIds).toEqual([u.id]);
      expect(storage.has(`private-media/${u.id}/leftover.jpg`)).toBe(false);
      expect(storage.has(`post-media/${u.id}/leftover2.jpg`)).toBe(false);
      expect(storage.has(`private-media/${bystander.id}/other.jpg`)).toBe(true);
    });

    it('a purge still succeeds when the store refuses to list (the cleanup is best effort)', async () => {
      const u = await seedUser('gone', { accountStatus: 'deleted', anonymizedAt: new Date(NOW.getTime() - 40 * DAY), dateOfBirth: null });
      storage.listNotPermitted = true;
      const r = await app.get(AnonymizedRowPurgeService).purgeAnonymizedRows(NOW);
      expect(r.purgedUserIds).toEqual([u.id]);
    });
  });

  // =================================================================================================
  describe('the stray sweep (objects with no database row)', () => {
    it('deletes a stray older than the minimum age and leaves a younger one; after the age it goes', async () => {
      const u = await seedUser('a');
      const oldKey = `private-media/${u.id}/old.jpg`;
      const youngKey = `private-media/${u.id}/young.jpg`;
      storage.put(oldKey, Buffer.from('x'), 'image/jpeg');
      storage.put(youngKey, Buffer.from('x'), 'image/jpeg');
      storage.modified.set(oldKey, new Date(NOW.getTime() - 8 * DAY));
      storage.modified.set(youngKey, new Date(NOW.getTime() - 3 * DAY));

      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 1, skippedTooYoung: 1 });
      expect(storage.has(oldKey)).toBe(false);
      expect(storage.has(youngKey)).toBe(true);

      expect(await sweep().sweepStrays(new Date(NOW.getTime() + 5 * DAY))).toMatchObject({ deleted: 1 });
      expect(storage.has(youngKey)).toBe(false);
    });

    it('never touches an object that has a database row, even an old rejected one', async () => {
      const u = await seedUser('a');
      const m = await seedMedia(u);
      storage.modified.set(m.priv, new Date(NOW.getTime() - 60 * DAY));
      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 0, skippedHasRow: 1 });
      expect(storage.has(m.priv)).toBe(true);
    });

    it('never touches a stray whose uploader is under an active hold', async () => {
      const u = await seedUser('a');
      const key = `private-media/${u.id}/old.jpg`;
      storage.put(key, Buffer.from('x'), 'image/jpeg');
      storage.modified.set(key, new Date(NOW.getTime() - 30 * DAY));
      await hold(u.id);
      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 0, skippedUploaderHeld: 1 });
      expect(storage.has(key)).toBe(true);
    });

    it('leaves an object with a deferral record to the deferred step', async () => {
      const u = await seedUser('a');
      const key = `private-media/${u.id}/old.jpg`;
      storage.put(key, Buffer.from('x'), 'image/jpeg');
      storage.modified.set(key, new Date(NOW.getTime() - 30 * DAY));
      await prisma().postMediaDeferredDeletion.create({ data: { objectKey: key, mediaId: 'old', uploaderId: u.id, postId: 'p' } });
      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 0, skippedDeferred: 1 });
      expect(storage.has(key)).toBe(true);
    });

    it('a missing list permission is reported, not thrown, and nothing is deleted; the deferred step still runs', async () => {
      const u = await seedUser('a');
      const key = `private-media/${u.id}/old.jpg`;
      storage.put(key, Buffer.from('x'), 'image/jpeg');
      storage.modified.set(key, new Date(NOW.getTime() - 30 * DAY));
      storage.listNotPermitted = true;
      expect((await sweep().sweepStrays(NOW)).outcome).toBe('list_not_permitted');
      expect(storage.has(key)).toBe(true);
      await expect(sweep().runDaily()).resolves.toBeUndefined();
    });

    it('is idempotent and paginates: five old strays over pages of two are all cleared, and a rerun finds nothing', async () => {
      const u = await seedUser('a');
      storage.pageSize = 2;
      for (let i = 0; i < 5; i += 1) {
        const key = `private-media/${u.id}/s${i}.jpg`;
        storage.put(key, Buffer.from('x'), 'image/jpeg');
        storage.modified.set(key, new Date(NOW.getTime() - 30 * DAY));
      }
      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 5, scanned: 5 });
      expect(await sweep().sweepStrays(NOW)).toMatchObject({ deleted: 0, scanned: 0 });
    });
  });

  // =================================================================================================
  describe('PostMediaDeferredDeletion (the table)', () => {
    it('is unique per object key and has no foreign key to the user or the post (it outlives both)', async () => {
      await prisma().postMediaDeferredDeletion.create({ data: { objectKey: 'k1', mediaId: 'm', uploaderId: 'no-such-user', postId: 'no-such-post' } });
      await expect(prisma().postMediaDeferredDeletion.create({ data: { objectKey: 'k1', mediaId: 'm', uploaderId: 'x' } })).rejects.toThrow();
      const r = await prisma().postMediaDeferredDeletion.createMany({
        data: [{ objectKey: 'k1', mediaId: 'm', uploaderId: 'x' }],
        skipDuplicates: true,
      });
      expect(r.count).toBe(0);
    });
  });
});
