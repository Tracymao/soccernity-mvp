import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { RegistrationEmailService } from '../src/modules/auth/registration/email/registration-email.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { RejectedMediaSweepService } from '../src/modules/post-media/rejected-media-sweep.service';
import { ProfileImagePublishService } from '../src/modules/users/profile-image-publish.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor } from './support/post-media-doubles';

// backend/suspected-illegal-profile-images (B-206; founder decision 2026-11-15), against the REAL app and REAL Postgres.
//
// A child-safety-vetted admin sets a PROFILE PICTURE or COVER aside as suspected illegal imagery. The picture is
// rejected through the existing generic rejection (a published file is first withdrawn to the private prefix), a
// SuspectedIllegalMedia record is written (kind profile_avatar / profile_cover, postId null), and the stored FILE is then
// protected from every path that would remove the object (user replace/delete, account anonymisation and minimisation,
// the publish step's private-original delete, rejection's discard of a withdrawn copy) while the record is `set_aside`
// or before `preserveUntil`. Protection is file-level only: the person can still replace or delete the picture and
// their account. A protected deletion is written to PostMediaDeferredDeletion and finished by processDeferred.
//
// The object store, Rekognition and ffmpeg are in-memory doubles; cron jobs are stopped so only explicit calls run.

const rand = () => Math.random().toString(36).slice(2, 10);
const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-12-15T04:00:00Z');
// A real (8x8) JPEG: uploads are re-encoded with real sharp (B-205).
const JPEG = Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIMAnDx//9k=',
  'base64',
);

describe('Suspected illegal imagery: profile pictures and covers e2e (B-206)', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  const fakeClock = { now: () => new Date(NOW) };
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();
  // one recorder for every RegistrationEmailService instance (only send* methods, or Nest would treat it as a thenable)
  const sent: Array<{ method: string; args: unknown[] }> = [];
  const recorder = new Proxy(
    {},
    {
      get: (_t, name: string | symbol) => {
        if (typeof name !== 'string' || !name.startsWith('send')) return undefined;
        return (...args: unknown[]) => {
          sent.push({ method: name, args });
          return Promise.resolve(undefined);
        };
      },
    },
  );
  const safetyNotices = () => sent.filter((c) => c.method === 'sendGuardianSafetyNoticeEmail');

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RegistrationEmailService)
      .useValue(recorder)
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
    storage.failCopy = false;
    storage.unavailable = false;
    sent.length = 0;
  });

  // the guardian notice and the background steps settle after the response; let them finish before the next reset
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
  type Kind = 'avatar' | 'cover';

  async function seedUser(label: string, o: { minor?: boolean } = {}): Promise<U> {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-sip-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `p_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob(o.minor ? '2012-03-03' : '1994-05-05'),
        isMinor: Boolean(o.minor),
        verificationStatus: 'verified',
      } as never,
    });
    if (o.minor) {
      await prisma().guardian.create({
        data: {
          minorUserId: user.id,
          name: 'Guardian Person',
          email: `guardian-${suffix}@example.com`,
          relationship: 'Parent',
          consentToken: `consent-${suffix}`,
          consentTokenExpiresAt: new Date(NOW.getTime() + 48 * 3600 * 1000),
          consentStatus: 'confirmed',
        },
      });
    }
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: { Authorization: `Bearer ${accessToken.token}` } };
  }

  async function seedAdmin(role: 'moderator' | 'superadmin' | 'editor', vetted: boolean): Promise<A> {
    const admin = await prisma().adminUser.create({
      data: { email: `sip-admin-${Date.now()}-${rand()}@example.com`, passwordHash: 'x', fullName: `Sip ${role}`, role, childSafetyVetted: vetted } as never,
    });
    const pair = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, auth: { Authorization: `Bearer ${pair.accessToken.token}` } };
  }

  /** A profile picture written straight into the row and the store (the upload route is covered elsewhere). */
  async function seedPicture(u: U, kind: Kind, status: 'pending' | 'approved' | 'rejected', file = `${rand()}.jpg`) {
    const key = status === 'approved' ? `profile-media/${u.id}/${file}` : `private-profile/${u.id}/${file}`;
    const data: Record<string, unknown> = {
      [`${kind}Key`]: key,
      [`${kind}Url`]: `https://cdn.test/${key}`,
      [`${kind}Status`]: status,
      [`${kind}UploadedAt`]: new Date(NOW.getTime() - 3 * DAY),
    };
    if (status === 'rejected') data[`${kind}RejectionReason`] = "This file didn't meet our rules";
    await prisma().user.update({ where: { id: u.id }, data: data as never });
    storage.put(key, Buffer.from('picture-bytes'), 'image/jpeg');
    return { key, file, itemId: `${kind}:${u.id}:${file}`, privateKey: `private-profile/${u.id}/${file}`, publicKey: `profile-media/${u.id}/${file}` };
  }

  const row = (u: U) => prisma().user.findUniqueOrThrow({ where: { id: u.id } });
  const record = (mediaId: string) => prisma().suspectedIllegalMedia.findUnique({ where: { mediaId } });
  const deferrals = () => prisma().postMediaDeferredDeletion.findMany();
  const sweep = () => app.get(RejectedMediaSweepService);
  const setAside = (itemId: string, admin: A, body: Record<string, unknown> = { reason: 'looks like illegal imagery' }) =>
    request(http()).post(`/admin/media-review/${encodeURIComponent(itemId)}/suspected-illegal`).set(admin.auth).send(body);
  const notificationsOf = (u: U) => prisma().notification.findMany({ where: { userId: u.id } });
  const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

  /** A set-aside record written directly so each deletion path can be probed on its own. */
  async function recordFor(u: U, kind: Kind, p: { itemId: string; privateKey: string }, admin: A, over: Record<string, unknown> = {}) {
    return prisma().suspectedIllegalMedia.create({
      data: {
        mediaId: p.itemId,
        uploaderId: u.id,
        postId: null,
        objectKey: p.privateKey,
        kind: kind === 'avatar' ? 'profile_avatar' : 'profile_cover',
        reason: 'e2e reason',
        setAsideByAdminId: admin.id,
        setAsideAt: NOW,
        preserveUntil: new Date(NOW.getTime() + 365 * DAY),
        ...over,
      } as never,
    });
  }

  // =================================================================================================
  describe('POST /admin/media-review/:id/suspected-illegal on a profile picture or cover', () => {
    it('an APPROVED (public) avatar of a minor: rejected, withdrawn to the private prefix, still present, one record, one audit row, one notification, guardian notice as for any rejection', async () => {
      const u = await seedUser('minor', { minor: true });
      const p = await seedPicture(u, 'avatar', 'approved');
      const admin = await seedAdmin('moderator', true);

      const res = await setAside(p.itemId, admin, { reason: 'secret reason text' }).expect(201);
      expect(res.body).toMatchObject({ mediaId: p.itemId, status: 'set_aside', kind: 'profile_avatar', uploaderId: u.id });

      const after = await row(u);
      expect(after).toMatchObject({ avatarStatus: 'rejected', avatarKey: p.privateKey, avatarRejectionReason: "This file didn't meet our rules" });
      // no public address is served and the object is private and present
      expect(storage.has(p.publicKey)).toBe(false);
      expect(storage.has(p.privateKey)).toBe(true);

      const rec = await record(p.itemId);
      expect(rec).toMatchObject({
        kind: 'profile_avatar',
        postId: null,
        uploaderId: u.id,
        objectKey: p.privateKey,
        status: 'set_aside',
        setAsideByAdminId: admin.id,
        reason: 'secret reason text',
      });
      expect(rec!.preserveUntil.getTime() - rec!.setAsideAt.getTime()).toBe(365 * DAY);

      const log = await prisma().adminActionLog.findMany({ where: { action: 'media.suspected_illegal_set_aside' } });
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ adminId: admin.id, targetType: 'profile_image', targetId: u.id });
      expect(log[0].notes ?? '').not.toContain('secret reason text');

      await settle();
      // the person sees the same generic "not approved" as for any rejection: ONE notification, nothing naming this path
      const notes = await notificationsOf(u);
      expect(notes).toHaveLength(1);
      expect(notes[0].type).toBe('profile_image_rejected');
      for (const n of notes) expect(JSON.stringify(n)).not.toMatch(/illegal|suspected|set_aside/i);
      // the guardian notice is the existing one (profile picture not approved), once; nothing else
      expect(safetyNotices()).toHaveLength(1);
      expect(JSON.stringify(safetyNotices()[0].args)).not.toMatch(/illegal|suspected|set aside/i);
      expect(await prisma().accountHold.count({ where: { userId: u.id } })).toBe(0);
    });

    it('a PENDING cover: rejected, record kind profile_cover, the private object stays', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'cover', 'pending');
      const admin = await seedAdmin('superadmin', true);

      await setAside(p.itemId, admin).expect(201);
      expect(await row(u)).toMatchObject({ coverStatus: 'rejected', coverKey: p.privateKey });
      expect(storage.has(p.privateKey)).toBe(true);
      expect(await record(p.itemId)).toMatchObject({ kind: 'profile_cover', postId: null, objectKey: p.privateKey });
      expect(await prisma().adminActionLog.count({ where: { action: 'media.suspected_illegal_set_aside' } })).toBe(1);
    });

    it('an already auto-REJECTED picture: the record only, no second notification', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'rejected');
      const admin = await seedAdmin('moderator', true);
      await setAside(p.itemId, admin).expect(201);
      await settle();
      expect(await prisma().notification.count({ where: { userId: u.id } })).toBe(0);
      expect(await record(p.itemId)).toMatchObject({ objectKey: p.privateKey });
      expect(storage.has(p.privateKey)).toBe(true);
    });

    it('a withdraw that cannot complete (storage down): the error is returned, nothing is rejected or recorded', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'approved');
      const admin = await seedAdmin('moderator', true);
      storage.failCopy = true;
      const res = await setAside(p.itemId, admin);
      expect(res.status).toBe(503);
      expect(await row(u)).toMatchObject({ avatarStatus: 'approved', avatarKey: p.publicKey });
      expect(storage.has(p.publicKey)).toBe(true);
      expect(await record(p.itemId)).toBeNull();
      expect(await prisma().adminActionLog.count({ where: { action: 'media.suspected_illegal_set_aside' } })).toBe(0);
      storage.failCopy = false;
    });

    it('vetting: a non-vetted admin gets 404 on a MINOR\'s picture and a coded 403 on an adult\'s; an editor is refused; nothing changes', async () => {
      const minor = await seedUser('minor', { minor: true });
      const adult = await seedUser('adult');
      const pm = await seedPicture(minor, 'avatar', 'pending');
      const pa = await seedPicture(adult, 'avatar', 'pending');
      const unvetted = await seedAdmin('moderator', false);
      const editor = await seedAdmin('editor', true);

      const a = await setAside(pm.itemId, unvetted);
      expect(a.status).toBe(404);
      const b = await setAside(pa.itemId, unvetted);
      expect(b.status).toBe(403);
      expect(b.body.code).toBe('child_safety_vetting_required');
      await setAside(pa.itemId, editor).expect(403);

      for (const [u, p] of [
        [minor, pm],
        [adult, pa],
      ] as const) {
        expect(await row(u)).toMatchObject({ avatarStatus: 'pending', avatarKey: p.privateKey });
        expect(await record(p.itemId)).toBeNull();
      }
      expect(await prisma().adminActionLog.count({ where: { action: 'media.suspected_illegal_set_aside' } })).toBe(0);
    });

    it('a stale id (the person re-uploaded since the page loaded) is a 404 and nothing is set aside', async () => {
      const u = await seedUser('adult');
      const first = await seedPicture(u, 'avatar', 'pending');
      const second = await seedPicture(u, 'avatar', 'pending'); // a re-upload changes the file name
      const admin = await seedAdmin('moderator', true);
      expect((await setAside(first.itemId, admin)).status).toBe(404);
      expect(await record(first.itemId)).toBeNull();
      expect(await row(u)).toMatchObject({ avatarStatus: 'pending', avatarKey: second.privateKey });
    });

    it('409 when the picture was already set aside, and nothing is written twice', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'pending');
      const admin = await seedAdmin('moderator', true);
      await setAside(p.itemId, admin).expect(201);
      const second = await setAside(p.itemId, admin);
      expect(second.status).toBe(409);
      expect(await prisma().suspectedIllegalMedia.count()).toBe(1);
      expect(await prisma().adminActionLog.count({ where: { action: 'media.suspected_illegal_set_aside' } })).toBe(1);
    });

    it('GET /admin/media-review/:id carries the record id and status for a profile item, read only', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'pending');
      await prisma().profileImageCheck.create({ data: { userId: u.id, kind: 'avatar', objectKey: p.privateKey, state: 'review' } as never });
      const admin = await seedAdmin('moderator', true);
      const before = await request(http()).get(`/admin/media-review/${encodeURIComponent(p.itemId)}`).set(admin.auth).expect(200);
      expect(before.body.suspectedIllegalRecord ?? null).toBeNull();
      await setAside(p.itemId, admin).expect(201);
      const after = await request(http()).get(`/admin/media-review/${encodeURIComponent(p.itemId)}`).set(admin.auth).expect(200);
      expect(after.body.suspectedIllegalRecord).toMatchObject({ status: 'set_aside' });
      expect(typeof after.body.suspectedIllegalRecord.id).toBe('string');
    });
  });

  // =================================================================================================
  describe('the list and detail endpoints for a profile record', () => {
    it('lists the profile record with its kind and shows it with a signed link to the private object', async () => {
      const u = await seedUser('minor', { minor: true });
      const p = await seedPicture(u, 'avatar', 'approved');
      const admin = await seedAdmin('moderator', true);
      await setAside(p.itemId, admin).expect(201);
      await settle();

      const list = await request(http()).get('/admin/suspected-illegal-media').set(admin.auth).expect(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0]).toMatchObject({ kind: 'profile_avatar', mediaId: p.itemId, postId: null, status: 'set_aside' });

      const detail = await request(http()).get(`/admin/suspected-illegal-media/${list.body.items[0].id}`).set(admin.auth).expect(200);
      expect(detail.body).toMatchObject({ kind: 'profile_avatar', uploaderId: u.id });
      expect(detail.body.viewUrl).toContain(p.privateKey);
      expect(Array.isArray(detail.body.suggestedBodies)).toBe(true); // empty here: the person has no declared country

      // the same vetted-only rule post media follows
      const unvetted = await seedAdmin('moderator', false);
      await request(http()).get('/admin/suspected-illegal-media').set(unvetted.auth).expect(403);
      await request(http()).get(`/admin/suspected-illegal-media/${list.body.items[0].id}`).set(unvetted.auth).expect(403);
    });

    it('a cover record is listed with kind profile_cover', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'cover', 'pending');
      const admin = await seedAdmin('moderator', true);
      await setAside(p.itemId, admin).expect(201);
      const list = await request(http()).get('/admin/suspected-illegal-media').set(admin.auth).expect(200);
      expect(list.body.items[0]).toMatchObject({ kind: 'profile_cover', mediaId: p.itemId });
    });
  });

  // =================================================================================================
  describe('protection: every path that removes a profile object honours a record', () => {
    const uploadAvatar = (u: U) =>
      request(http()).post(`/users/${u.id}/avatar`).set(u.auth).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' });

    it('the person REPLACES a set-aside picture: the new one is accepted, the old FILE stays and is deferred; with no record the old file is deleted as before', async () => {
      const u = await seedUser('adult');
      const old = await seedPicture(u, 'avatar', 'rejected');
      const admin = await seedAdmin('moderator', true);
      await recordFor(u, 'avatar', old, admin);

      await uploadAvatar(u).expect(201);
      const live = (await row(u)).avatarKey!;
      expect(live).not.toBe(old.privateKey);
      expect(storage.has(live)).toBe(true);
      expect(storage.has(old.privateKey)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: old.privateKey, mediaId: old.itemId, uploaderId: u.id, postId: null }]);
      expect((await record(old.itemId))!.status).toBe('set_aside');

      // control: a picture with no record is deleted by the same replace
      const v = await seedUser('other');
      const plain = await seedPicture(v, 'avatar', 'rejected');
      await uploadAvatar(v).expect(201);
      expect(storage.has(plain.privateKey)).toBe(false);
      expect(await deferrals()).toHaveLength(1);
    });

    it('the person DELETES a set-aside picture: the picture goes from the profile, the FILE stays and is deferred', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'cover', 'rejected');
      await recordFor(u, 'cover', p, await seedAdmin('moderator', true));
      await request(http()).delete(`/users/${u.id}/cover`).set(u.auth).expect(200);
      expect(await row(u)).toMatchObject({ coverKey: null, coverStatus: null });
      expect(storage.has(p.privateKey)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: p.privateKey, mediaId: p.itemId }]);
    });

    it('account ANONYMISED with a set-aside avatar: the account is anonymised, the file stays, a deferral is written; the unprotected cover is removed', async () => {
      const u = await seedUser('adult');
      const a = await seedPicture(u, 'avatar', 'rejected');
      const c = await seedPicture(u, 'cover', 'rejected');
      await recordFor(u, 'avatar', a, await seedAdmin('moderator', true));

      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, NOW);
      expect(await row(u)).toMatchObject({ avatarKey: null, coverKey: null, accountStatus: 'deleted' });
      expect(storage.has(a.privateKey)).toBe(true);
      expect(storage.has(c.privateKey)).toBe(false);
      expect(await deferrals()).toMatchObject([{ objectKey: a.privateKey, mediaId: a.itemId, uploaderId: u.id }]);
      // the record has no foreign key to the user and is untouched
      expect(await prisma().suspectedIllegalMedia.count({ where: { mediaId: a.itemId } })).toBe(1);
    });

    it('account MINIMISED (held) with a set-aside cover: the file stays, a deferral is written', async () => {
      const u = await seedUser('adult');
      const c = await seedPicture(u, 'cover', 'approved');
      await recordFor(u, 'cover', c, await seedAdmin('moderator', true));
      await app.get(AccountDeletionSweepService).minimiseHeldUser(u.id);
      expect(await row(u)).toMatchObject({ coverKey: null });
      expect(storage.has(c.publicKey)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: c.publicKey, mediaId: c.itemId }]);
    });

    it('the publish step: a set-aside file\'s private original is kept and deferred; without a record it is deleted as before', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'pending');
      await recordFor(u, 'avatar', p, await seedAdmin('moderator', true));
      expect(await app.get(ProfileImagePublishService).publish({ userId: u.id, kind: 'avatar', key: p.privateKey })).toBe(true);
      expect(await row(u)).toMatchObject({ avatarStatus: 'approved', avatarKey: p.publicKey });
      expect(storage.has(p.privateKey)).toBe(true);
      expect(await deferrals()).toMatchObject([{ objectKey: p.privateKey, mediaId: p.itemId }]);

      const v = await seedUser('other');
      const plain = await seedPicture(v, 'avatar', 'pending');
      await app.get(ProfileImagePublishService).publish({ userId: v.id, kind: 'avatar', key: plain.privateKey });
      expect(storage.has(plain.privateKey)).toBe(false);
      expect(await deferrals()).toHaveLength(1);
    });

    it('the race: a publish whose private-original delete runs AFTER a set-aside withdrew the file back to the same key does not delete it', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'approved');
      const admin = await seedAdmin('moderator', true);
      await setAside(p.itemId, admin).expect(201); // withdrawn to p.privateKey, row points at it, record exists
      expect(storage.has(p.privateKey)).toBe(true);
      // the late private-original delete of a publish that ran before the set-aside
      const svc = app.get(ProfileImagePublishService) as unknown as {
        deletePrivateOriginal(userId: string, kind: Kind, key: string): Promise<void>;
      };
      await svc.deletePrivateOriginal(u.id, 'avatar', p.privateKey);
      expect(storage.has(p.privateKey)).toBe(true);
      expect(await row(u)).toMatchObject({ avatarStatus: 'rejected', avatarKey: p.privateKey });
    });

    it('processDeferred: held while set_aside and during preserveUntil; deleted once decided AND past preserveUntil', async () => {
      const u = await seedUser('adult');
      const p = await seedPicture(u, 'avatar', 'rejected');
      const admin = await seedAdmin('moderator', true);
      const rec = await recordFor(u, 'avatar', p, admin);
      await request(http()).delete(`/users/${u.id}/avatar`).set(u.auth).expect(200);
      expect(await deferrals()).toHaveLength(1);

      expect(await sweep().processDeferred(new Date(NOW.getTime() + 800 * DAY))).toMatchObject({ deleted: 0, stillProtected: 1 });
      expect(storage.has(p.privateKey)).toBe(true);

      await prisma().suspectedIllegalMedia.update({
        where: { id: rec.id },
        data: { status: 'not_filed', notFiledReason: 'decided', decidedAt: NOW, decidedByAdminId: admin.id },
      });
      expect(await sweep().processDeferred(new Date(NOW.getTime() + 100 * DAY))).toMatchObject({ deleted: 0, stillProtected: 1 });
      expect(storage.has(p.privateKey)).toBe(true);

      expect(await sweep().processDeferred(new Date(NOW.getTime() + 366 * DAY))).toMatchObject({ deleted: 1, stillProtected: 0 });
      expect(storage.has(p.privateKey)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });

    it('a rejected file with NO record: replace, delete and anonymise behave exactly as before (deleted, nothing deferred)', async () => {
      const u = await seedUser('adult');
      const a = await seedPicture(u, 'avatar', 'rejected');
      const c = await seedPicture(u, 'cover', 'rejected');
      await request(http()).delete(`/users/${u.id}/avatar`).set(u.auth).expect(200);
      expect(storage.has(a.privateKey)).toBe(false);
      await app.get(AccountDeletionSweepService).anonymizeUser(u.id, false, NOW);
      expect(storage.has(c.privateKey)).toBe(false);
      expect(await deferrals()).toHaveLength(0);
    });
  });

  // =================================================================================================
  describe('post and contest behaviour is unchanged', () => {
    it('a post-media id is still routed to post media (an unknown one is a 404, not a profile lookup)', async () => {
      const admin = await seedAdmin('moderator', true);
      expect((await setAside('no-such-media', admin)).status).toBe(404);
      expect(await prisma().suspectedIllegalMedia.count()).toBe(0);
    });
  });
});
