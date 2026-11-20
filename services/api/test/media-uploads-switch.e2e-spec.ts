import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TokenService } from '../src/modules/auth/token/token.service';
import { MediaModerationClient } from '../src/modules/post-media/media-moderation-client';
import { MediaProcessor } from '../src/modules/post-media/media-processor';
import { DirectUploadStorageService } from '../src/storage/direct-upload-storage.service';
import { StorageService } from '../src/storage/storage.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { FakeModerationClient, InMemoryStorage, TestMediaProcessor, makeJpeg } from './support/post-media-doubles';

// backend/b306-media-uploads-switch (B-306; Decision Log #501), against the REAL app and REAL Postgres. The
// object store, the video tools and Rekognition are the in-memory doubles of the post-media spec.
//
// With MEDIA_UPLOADS_ENABLED off, the four user upload routes answer 403 { code: 'media_uploads_disabled' }
// BEFORE any storage call or database write; the rest (read and delete of an existing upload, avatar and cover
// delete, post creation without media) is untouched. The switch is read through ConfigService on every request,
// so this spec flips process.env between calls (and restores it afterwards). NODE_ENV is "test" under jest, so
// the unset default is ON; the production default is exercised by temporarily setting NODE_ENV for one request.

const rand = () => Math.random().toString(36).slice(2, 10);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('Media uploads switch e2e (B-306)', () => {
  let app: INestApplication;
  const storage = new InMemoryStorage();
  const processor = new TestMediaProcessor();
  const moderation = new FakeModerationClient();
  const http = () => app.getHttpServer();
  const prisma = () => getTestPrismaClient();
  const savedEnv = { switch: process.env.MEDIA_UPLOADS_ENABLED, nodeEnv: process.env.NODE_ENV };

  const setSwitch = (value: string | undefined) => {
    if (value === undefined) delete process.env.MEDIA_UPLOADS_ENABLED;
    else process.env.MEDIA_UPLOADS_ENABLED = value;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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
    storage.objects.clear();
    storage.issuedLinks.length = 0;
    storage.copies.length = 0;
    setSwitch(undefined);
  });

  afterEach(() => {
    setSwitch(savedEnv.switch);
    if (savedEnv.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv.nodeEnv;
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  async function seedUser(label: string) {
    const suffix = `${Date.now()}-${rand()}`;
    const user = await prisma().user.create({
      data: {
        email: `e2e-switch-${label}-${suffix}@example.com`,
        passwordHash: 'unused-in-this-spec',
        displayName: `Real Name ${label}`,
        username: `s_${label}_${rand()}`.slice(0, 22).toLowerCase(),
        dateOfBirth: seedDob('1994-05-05'),
        isMinor: false,
        verificationStatus: 'verified',
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { id: user.id, auth: bearer(accessToken.token) };
  }

  const link = (auth: { Authorization: string }, contentType = 'image/jpeg', size = 1000) =>
    request(http()).post('/media/uploads').set(auth).send({ contentType, size });
  const sizes = async () => ({
    media: await prisma().postMedia.count(),
    objects: storage.objects.size,
    links: storage.issuedLinks.length,
  });

  const DISABLED = { statusCode: 403, code: 'media_uploads_disabled' };

  describe('switch off', () => {
    beforeEach(() => setSwitch('false'));

    it('POST /media/uploads: 403 media_uploads_disabled, no PostMedia row, no upload link issued', async () => {
      const u = await seedUser('a');
      const res = await link(u.auth).expect(403);
      expect(res.body).toMatchObject(DISABLED);
      expect(await sizes()).toEqual({ media: 0, objects: 0, links: 0 });
    });

    it('POST /media/uploads/:id/confirm: 403 even for an upload created while on; the row is left exactly as it was', async () => {
      const u = await seedUser('b');
      setSwitch('true');
      const created = await link(u.auth).expect(201);
      const before = await prisma().postMedia.findUniqueOrThrow({ where: { id: created.body.id } });
      const objectsBefore = storage.objects.size;
      setSwitch('false');
      const res = await request(http()).post(`/media/uploads/${created.body.id}/confirm`).set(u.auth).expect(403);
      expect(res.body).toMatchObject(DISABLED);
      expect(await prisma().postMedia.findUniqueOrThrow({ where: { id: created.body.id } })).toEqual(before);
      expect(storage.objects.size).toBe(objectsBefore);
    });

    it('POST /users/:id/avatar and /cover: 403 media_uploads_disabled, nothing stored, user columns untouched', async () => {
      const u = await seedUser('c');
      const jpeg = await makeJpeg({});
      for (const kind of ['avatar', 'cover']) {
        const res = await request(http()).post(`/users/${u.id}/${kind}`).set(u.auth).attach('file', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(403);
        expect(res.body).toMatchObject(DISABLED);
      }
      expect(storage.objects.size).toBe(0);
      expect(await prisma().user.findUniqueOrThrow({ where: { id: u.id }, select: { avatarKey: true, avatarStatus: true, coverKey: true, coverStatus: true } })).toEqual({
        avatarKey: null,
        avatarStatus: null,
        coverKey: null,
        coverStatus: null,
      });
    });

    it('an anonymous caller still gets 401 (the sign-in check comes before the switch)', async () => {
      await request(http()).post('/media/uploads').send({ contentType: 'image/jpeg', size: 10 }).expect(401);
    });

    it('GET and DELETE /media/uploads/:id keep working on an upload the account already holds', async () => {
      const u = await seedUser('d');
      setSwitch('true');
      const created = await link(u.auth).expect(201);
      setSwitch('false');
      await request(http()).get(`/media/uploads/${created.body.id}`).set(u.auth).expect(200);
      await request(http()).delete(`/media/uploads/${created.body.id}`).set(u.auth).expect(204);
      expect(await prisma().postMedia.count({ where: { id: created.body.id } })).toBe(0);
    });

    it('DELETE /users/:id/avatar and /cover keep working (200 even with nothing to remove)', async () => {
      const u = await seedUser('e');
      await request(http()).delete(`/users/${u.id}/avatar`).set(u.auth).expect(200);
      await request(http()).delete(`/users/${u.id}/cover`).set(u.auth).expect(200);
    });

    it('a post without media is created as usual', async () => {
      const u = await seedUser('f');
      const res = await request(http()).post('/posts').set(u.auth).send({ contentText: 'Great match today' }).expect(201);
      expect(res.body).toMatchObject({ contentText: 'Great match today' });
    });
  });

  describe('switch on', () => {
    it('the unset default outside production is ON: a link is issued and a row written', async () => {
      const u = await seedUser('g');
      const res = await link(u.auth).expect(201);
      expect(res.body.uploadMethod).toBe('PUT');
      expect(await sizes()).toMatchObject({ media: 1, links: 1 });
    });

    it('"true" works for all four routes', async () => {
      const u = await seedUser('h');
      setSwitch('true');
      await link(u.auth).expect(201);
      const jpeg = await makeJpeg({});
      await request(http()).post(`/users/${u.id}/avatar`).set(u.auth).attach('file', jpeg, { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(201);
      await request(http()).post(`/users/${u.id}/cover`).set(u.auth).attach('file', jpeg, { filename: 'c.jpg', contentType: 'image/jpeg' }).expect(201);
    });
  });

  describe('production default (read per request from NODE_ENV)', () => {
    it('NODE_ENV=production with the switch unset is OFF; with the exact text "true" it is ON; with "TRUE" it is OFF', async () => {
      const u = await seedUser('i');
      process.env.NODE_ENV = 'production';

      setSwitch(undefined);
      const off = await link(u.auth).expect(403);
      expect(off.body).toMatchObject(DISABLED);

      setSwitch('TRUE');
      await link(u.auth).expect(403);

      setSwitch('true');
      await link(u.auth).expect(201);
    });
  });
});
