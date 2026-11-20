import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { ProfileImageCheckService } from '../src/modules/users/profile-image-check.service';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor, makeJpeg } from './support/post-media-doubles';

// backend/b036-avatar-cover-check (B-036; Decision Log #411 item 1, #394 A2, #468), against the REAL app and
// REAL Postgres. External seams are in-memory: the object store (InMemoryStorage), Rekognition
// (FakeModerationClient) and the ffmpeg tools (TestMediaProcessor; images still use the REAL sharp). The clock is
// fake so back-off is exact. Cron jobs are stopped: only the explicit service calls advance the check.
//
// THE PUBLIC-READABILITY MODEL. A real bucket is read through a public address that, per the launch-gate step
// (B-265), serves ONLY the public prefixes. `publiclyReadable(key)` is that rule; every test about "nobody can
// fetch a pending picture" is a statement about it.

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const PUBLIC_PREFIXES = ['post-media/', 'profile-media/'];
const publiclyReadable = (key: string) => PUBLIC_PREFIXES.some((p) => key.startsWith(p));
const keyOfPublicUrl = (url: string) => url.replace('https://cdn.test/', '');
// A real (8x8) JPEG: profile pictures are re-encoded with real sharp (B-205), so a few magic bytes no longer pass.
const JPEG = Buffer.from(
  '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAIAAgDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAB//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AIMAnDx//9k=',
  'base64',
);

describe('Avatar and cover image check e2e', () => {
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
  const run = () => app.get(ProfileImageCheckService).runDueChecks(new Date(clockNow));

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
    storage.issuedViewLinks.length = 0;
    moderation.configured = true;
    moderation.labelsFor = () => [];
    moderation.failTimes = 0;
    moderation.onCall = null;
    moderation.calls.length = 0;
    jest.restoreAllMocks();
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
        email: `e2e-b036-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `p_${label}_${rand()}`.slice(0, 22).toLowerCase(),
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

  const KINDS = ['avatar', 'cover'] as const;
  type Kind = (typeof KINDS)[number];
  const col = (kind: Kind) => ({ key: `${kind}Key`, url: `${kind}Url`, status: `${kind}Status`, reason: `${kind}RejectionReason` }) as const;
  const row = (u: U) => prisma().user.findUniqueOrThrow({ where: { id: u.id } });
  const rec = (r: Record<string, unknown>, k: string) => r[k] as string | null;
  const checkRow = (u: U, kind: Kind) => prisma().profileImageCheck.findUnique({ where: { userId_kind: { userId: u.id, kind } } });

  const upload = (u: U, kind: Kind) =>
    request(http()).post(`/users/${u.id}/${kind}`).set(u.auth).attach('file', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' });
  const publicProfile = (viewer: U, target: U) => request(http()).get(`/users/${target.id}/public-profile`).set(viewer.auth);

  // ---- 1. the public-readability fix ----------------------------------------------------------------

  describe.each(KINDS)('%s: pending and rejected pictures are never publicly readable', (kind) => {
    const c = col(kind);

    it('an upload is stored in the PRIVATE prefix; no URL the API hands out is publicly readable, before or after the owner reads it', async () => {
      const owner = await seedUser('owner');
      const viewer = await seedUser('viewer');
      const res = await upload(owner, kind).expect(201);

      const keys = [...storage.objects.keys()];
      expect(keys).toHaveLength(1);
      expect(keys[0]).toMatch(new RegExp(`^private-profile/${owner.id}/[0-9a-f-]{36}\\.jpg$`));
      expect(publiclyReadable(keys[0])).toBe(false);

      // The owner's response: a signed link to the PRIVATE file, not a public address.
      expect(res.body[kind].url).toBe(`https://view.test/${keys[0]}?ttl=300`);
      const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
      expect(mine.body[kind].url).toBe(res.body[kind].url);

      // The row keeps the FUTURE public URL, which points at an object that does not exist yet.
      const stored = await row(owner);
      const futureKey = keyOfPublicUrl(rec(stored, c.url)!);
      expect(futureKey).toBe(keys[0].replace('private-profile/', 'profile-media/'));
      expect(storage.has(futureKey)).toBe(false);

      // Nobody else is ever given anything for it.
      expect((await publicProfile(viewer, owner).expect(200)).body[`${kind}Url`]).toBeNull();
      expect(JSON.stringify(mine.body)).not.toContain('profile-media');
    });

    it('a REJECTED picture stays in the private prefix (nothing is copied public) and stays unreadable', async () => {
      const owner = await seedUser('owner');
      const viewer = await seedUser('viewer');
      await upload(owner, kind).expect(201);
      moderation.labelsFor = () => [{ name: 'Explicit', parentName: null, confidence: 99 }];
      expect(await run()).toMatchObject({ checked: 1, outcomes: { rejected: 1 } });

      const stored = await row(owner);
      expect(rec(stored, c.status)).toBe('rejected');
      expect(rec(stored, c.key)).toMatch(/^private-profile\//);
      expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
      expect(storage.copies).toEqual([]);
      expect((await publicProfile(viewer, owner).expect(200)).body[`${kind}Url`]).toBeNull();
    });
  });

  // ---- 2. outcomes ---------------------------------------------------------------------------------

  describe.each(KINDS)('%s: outcomes', (kind) => {
    const c = col(kind);

    it('clearly fine -> approved: the file is copied to the PUBLIC prefix first, then the row flips; the private original goes', async () => {
      const owner = await seedUser('owner');
      const viewer = await seedUser('viewer');
      await upload(owner, kind).expect(201);
      const before = await row(owner);
      const privateKey = rec(before, c.key)!;

      expect(await run()).toEqual({ checked: 1, outcomes: { approved: 1 } });

      const after = await row(owner);
      const publicKey = privateKey.replace('private-profile/', 'profile-media/');
      expect(after).toMatchObject({ [c.status]: 'approved', [c.key]: publicKey, [c.url]: `https://cdn.test/${publicKey}` });
      expect(storage.copies).toEqual([[privateKey, publicKey]]);
      expect(storage.has(publicKey)).toBe(true);
      expect(publiclyReadable(publicKey)).toBe(true);
      expect(storage.has(privateKey)).toBe(false); // the private original is removed after the flip
      // Now, and only now, other users are served the public URL; the owner sees the same URL.
      expect((await publicProfile(viewer, owner).expect(200)).body[`${kind}Url`]).toBe(`https://cdn.test/${publicKey}`);
      const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
      expect(mine.body[kind]).toEqual({ url: `https://cdn.test/${publicKey}`, status: 'approved', rejectionReason: null });
      expect(await checkRow(owner, kind)).toBeNull();
      expect(moderation.calls).toHaveLength(1);
    });

    it('a reject category at high confidence -> rejected with the generic reason, one notification, no public copy', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      moderation.labelsFor = () => [{ name: 'Explicit Nudity', parentName: 'Explicit', confidence: 97 }, { name: 'Explicit', parentName: null, confidence: 97 }];

      expect(await run()).toEqual({ checked: 1, outcomes: { rejected: 1 } });

      expect(await row(owner)).toMatchObject({ [c.status]: 'rejected', [c.reason]: "This file didn't meet our rules" });
      const notes = await prisma().notification.findMany({ where: { userId: owner.id } });
      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ type: 'profile_image_rejected', payloadRefId: kind });
      const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
      expect(mine.body[kind]).toMatchObject({ status: 'rejected', rejectionReason: "This file didn't meet our rules" });
      expect(await checkRow(owner, kind)).toBeNull();
    });

    it('in between -> stays pending, recorded as waiting for the moderator queue, and is NOT checked again', async () => {
      const owner = await seedUser('owner');
      await upload(owner, kind).expect(201);
      moderation.labelsFor = () => [{ name: 'Suggestive', parentName: null, confidence: 60 }];

      expect(await run()).toEqual({ checked: 1, outcomes: { pending: 1 } });
      expect(await row(owner)).toMatchObject({ [c.status]: 'pending' });
      expect(await checkRow(owner, kind)).toMatchObject({ state: 'review', nextAttemptAt: null });

      advance(24 * 3600 * 1000);
      expect(await run()).toEqual({ checked: 0, outcomes: {} });
      expect(moderation.calls).toHaveLength(1);
      expect(await row(owner)).toMatchObject({ [c.status]: 'pending' });
    });
  });

  it('NOTHING IS APPROVED BY DEFAULT: with Rekognition unconfigured the check does not run, no call is made and every picture stays pending', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    await upload(owner, 'cover').expect(201);
    moderation.configured = false;

    expect(await run()).toEqual({ checked: 0, outcomes: {} });
    advance(7 * 24 * 3600 * 1000);
    expect(await run()).toEqual({ checked: 0, outcomes: {} });

    expect(moderation.calls).toHaveLength(0);
    expect(await row(owner)).toMatchObject({ avatarStatus: 'pending', coverStatus: 'pending' });
    expect(await prisma().profileImageCheck.count()).toBe(0);
    expect(storage.copies).toEqual([]);
    expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
  });

  it('uses the same thresholds as post media, stricter for a minor: 25 is fine for an adult, but sends a minor to review; 85 rejects a minor and only reviews an adult', async () => {
    const adult = await seedUser('adult');
    const minor = await seedUser('minor', { minor: true });
    await upload(adult, 'avatar').expect(201);
    await upload(minor, 'avatar').expect(201);

    // Label at 25: below the adult pass threshold (40), above the minor's (20).
    moderation.labelsFor = () => [{ name: 'Suggestive', parentName: null, confidence: 25 }];
    const r1 = await run();
    expect(r1.outcomes).toEqual({ approved: 1, pending: 1 });
    expect(await row(adult)).toMatchObject({ avatarStatus: 'approved' });
    expect(await row(minor)).toMatchObject({ avatarStatus: 'pending' });

    // Reject category at 85: below the adult reject threshold (90), above the minor's (80).
    const adult2 = await seedUser('adult2');
    const minor2 = await seedUser('minor2', { minor: true });
    await upload(adult2, 'avatar').expect(201);
    await upload(minor2, 'avatar').expect(201);
    moderation.labelsFor = () => [{ name: 'Explicit', parentName: null, confidence: 85 }];
    const r2 = await run();
    expect(r2.outcomes).toEqual({ pending: 1, rejected: 1 });
    expect(await row(adult2)).toMatchObject({ avatarStatus: 'pending' });
    expect(await row(minor2)).toMatchObject({ avatarStatus: 'rejected' });
    // The minor's rejection sent the guardian notice machinery the same call a post-media rejection does (no throw).
    expect(await prisma().notification.count({ where: { userId: minor2.id, type: 'profile_image_rejected' } })).toBe(1);
  });

  // ---- 3. races ------------------------------------------------------------------------------------

  it('RACE (approve): a re-upload that lands after the copy but before the write is NOT approved by the old file; the stray public copy is removed', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    const oldKey = rec(await row(owner), 'avatarKey')!;
    const oldPublic = oldKey.replace('private-profile/', 'profile-media/');
    const newKey = `private-profile/${owner.id}/replacement.jpg`;
    storage.put(newKey, await makeJpeg(), 'image/jpeg');

    const realCopy = storage.copyObject.bind(storage);
    jest.spyOn(storage, 'copyObject').mockImplementationOnce(async (s, d, t) => {
      await realCopy(s, d, t);
      // The owner replaces the picture right now.
      await prisma().user.update({ where: { id: owner.id }, data: { avatarKey: newKey, avatarUrl: 'https://cdn.test/profile-media/x', avatarStatus: 'pending' } });
    });

    expect(await run()).toEqual({ checked: 1, outcomes: { skipped: 1 } });

    expect(await row(owner)).toMatchObject({ avatarStatus: 'pending', avatarKey: newKey }); // not approved
    expect(storage.has(oldPublic)).toBe(false); // the stale public copy was discarded
    expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
    // The replacement is due for its own check, and gets one.
    const second = await run();
    expect(second.checked).toBe(1);
  });

  it('RACE (reject): a re-upload during the check is NOT rejected by the old file\'s result: no status change, no notification', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    const newKey = `private-profile/${owner.id}/replacement.jpg`;
    moderation.labelsFor = () => [{ name: 'Explicit', parentName: null, confidence: 99 }];
    moderation.onCall = async () => {
      await prisma().user.update({ where: { id: owner.id }, data: { avatarKey: newKey, avatarUrl: 'https://cdn.test/profile-media/x', avatarStatus: 'pending' } });
    };

    expect(await run()).toEqual({ checked: 1, outcomes: { skipped: 1 } });

    expect(await row(owner)).toMatchObject({ avatarStatus: 'pending', avatarKey: newKey, avatarRejectionReason: null });
    expect(await prisma().notification.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('a picture replaced BEFORE the sweep reaches it is checked as the new file (stale bookkeeping for the old key is overwritten)', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    moderation.failTimes = 1;
    expect(await run()).toMatchObject({ outcomes: { retry: 1 } });
    expect((await checkRow(owner, 'avatar'))!.attempts).toBe(1);

    await upload(owner, 'avatar').expect(201); // replaces: new key, attempts must start over
    expect(await run()).toEqual({ checked: 1, outcomes: { approved: 1 } });
    expect(await row(owner)).toMatchObject({ avatarStatus: 'approved' });
  });

  // ---- 4. failures ---------------------------------------------------------------------------------

  it('a failing check retries with back-off and, after 5 failures, gives up: the picture stays pending for a moderator and is never approved', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    moderation.failTimes = 99;

    expect(await run()).toEqual({ checked: 1, outcomes: { retry: 1 } });
    expect(await checkRow(owner, 'avatar')).toMatchObject({ state: 'retry', attempts: 1, nextAttemptAt: new Date(clockNow.getTime() + 60_000) });

    // Not due yet: nothing is called.
    const callsBefore = moderation.calls.length;
    expect(await run()).toEqual({ checked: 0, outcomes: {} });
    expect(moderation.calls).toHaveLength(callsBefore);

    for (let attempt = 2; attempt <= 4; attempt += 1) {
      advance(2 * 3600 * 1000);
      expect(await run()).toEqual({ checked: 1, outcomes: { retry: 1 } });
      expect((await checkRow(owner, 'avatar'))!.attempts).toBe(attempt);
    }
    advance(2 * 3600 * 1000);
    expect(await run()).toEqual({ checked: 1, outcomes: { gave_up: 1 } });
    expect(await checkRow(owner, 'avatar')).toMatchObject({ state: 'gave_up', attempts: 5, nextAttemptAt: null });

    advance(30 * 24 * 3600 * 1000);
    const calls = moderation.calls.length;
    expect(await run()).toEqual({ checked: 0, outcomes: {} });
    expect(moderation.calls).toHaveLength(calls);
    expect(await row(owner)).toMatchObject({ avatarStatus: 'pending' });
    expect([...storage.objects.keys()].filter(publiclyReadable)).toEqual([]);
  });

  it('FAIL CLOSED: if publishing fails (copy error, or a copy that does not match) the picture stays pending and private, and nothing public is left', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    const privateKey = rec(await row(owner), 'avatarKey')!;

    storage.failCopy = true;
    expect(await run()).toEqual({ checked: 1, outcomes: { retry: 1 } });
    expect(await row(owner)).toMatchObject({ avatarStatus: 'pending', avatarKey: privateKey });

    storage.failCopy = false;
    storage.corruptCopyTo = privateKey.replace('private-profile/', 'profile-media/');
    advance(2 * 3600 * 1000);
    expect(await run()).toEqual({ checked: 1, outcomes: { retry: 1 } });
    expect(await row(owner)).toMatchObject({ avatarStatus: 'pending', avatarKey: privateKey });
    expect(storage.has(privateKey.replace('private-profile/', 'profile-media/'))).toBe(false); // the bad copy was deleted
    expect(storage.has(privateKey)).toBe(true);
  });

  // ---- 5. legacy, bookkeeping and the account ---------------------------------------------------------

  it('a pending picture stored BEFORE this design (avatars/<user>/<file>) is checked and published to the public prefix the same way', async () => {
    const owner = await seedUser('owner');
    const legacyKey = `avatars/${owner.id}/legacy.jpg`;
    storage.put(legacyKey, await makeJpeg(), 'image/jpeg');
    await prisma().user.update({
      where: { id: owner.id },
      data: { avatarKey: legacyKey, avatarUrl: `https://cdn.test/${legacyKey}`, avatarStatus: 'pending' },
    });

    // Before the check the owner is given a signed link (never the legacy public URL).
    const mine = await request(http()).get(`/users/${owner.id}`).set(owner.auth).expect(200);
    expect(mine.body.avatar.url).toBe(`https://view.test/${legacyKey}?ttl=300`);

    expect(await run()).toEqual({ checked: 1, outcomes: { approved: 1 } });
    const after = await row(owner);
    expect(after).toMatchObject({ avatarStatus: 'approved', avatarKey: `profile-media/${owner.id}/legacy.jpg` });
    expect(storage.has(legacyKey)).toBe(false);
  });

  it('bookkeeping for a picture that is no longer the pending one is removed (deleted picture, decided elsewhere)', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    moderation.labelsFor = () => [{ name: 'Suggestive', parentName: null, confidence: 60 }];
    await run();
    expect(await checkRow(owner, 'avatar')).not.toBeNull();

    await request(http()).delete(`/users/${owner.id}/avatar`).set(owner.auth).expect(200);
    await run();
    expect(await checkRow(owner, 'avatar')).toBeNull();
  });

  it('anonymising the account removes its bookkeeping, and the stored picture, in the same sweep', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    moderation.labelsFor = () => [{ name: 'Suggestive', parentName: null, confidence: 60 }];
    await run();
    expect(await checkRow(owner, 'avatar')).not.toBeNull();

    await app.get(AccountDeletionSweepService).anonymizeUser(owner.id, false, new Date(clockNow));
    expect(await prisma().profileImageCheck.count({ where: { userId: owner.id } })).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it('the avatar and the cover of one user are checked independently', async () => {
    const owner = await seedUser('owner');
    await upload(owner, 'avatar').expect(201);
    await upload(owner, 'cover').expect(201);
    let n = 0;
    moderation.labelsFor = () => (n++ === 0 ? [{ name: 'Suggestive', parentName: null, confidence: 60 }] : []);
    const result = await run();
    expect(result.checked).toBe(2);
    expect(result.outcomes).toEqual({ approved: 1, pending: 1 });
  });
});
