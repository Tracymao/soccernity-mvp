import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// B-056 (Decision Log #472): GET /admin/dashboard/latest-posts against the REAL app, real Postgres, real guards.
//
// PROVEN HERE THAT A MOCK CANNOT SHOW
//   - the real WHERE: ordering (newest first, same-millisecond ties by creation order), the limit, and every
//     exclusion (minor, under-16, restricted-pending minor, deactivated / pending-deletion / suspended / deleted
//     author, an unrevealed final entry, any non-approved media)
//   - the response keys, over real rows whose author has a real name and a real email: neither can appear
//   - the guard: 401 without an admin token and with a User token, 200 for every admin role

jest.setTimeout(240_000);

describe('GET /admin/dashboard/latest-posts (real Postgres)', () => {
  let app: INestApplication;
  const prisma = () => getTestPrismaClient();
  const rand = () => Math.random().toString(36).slice(2, 10);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
  const BASE = Date.parse('2026-11-01T10:00:00.000Z');
  let clock = 0;
  const nextTime = () => new Date(BASE + ++clock * 1000);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });
  beforeEach(async () => {
    await resetDatabase();
    clock = 0;
  });
  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  async function admin(role: 'editor' | 'moderator' | 'superadmin') {
    const a = await prisma().adminUser.create({
      data: { email: `e2e-lp-admin-${role}-${rand()}@example.com`, passwordHash: 'unused', fullName: `LP ${role}`, role },
    });
    return (await app.get(AdminTokenService).issueTokenPair(a.id, a.role)).accessToken.token;
  }

  async function user(over: Record<string, unknown> = {}) {
    return prisma().user.create({
      data: {
        email: `e2e-lp-user-${rand()}@example.com`,
        passwordHash: 'unused-hash',
        displayName: 'Real Person Name',
        dateOfBirth: seedDob('1998-07-04'),
        username: `lp_${rand()}`,
        ...over,
      } as never,
    });
  }

  async function post(authorId: string, over: Record<string, unknown> = {}) {
    return prisma().post.create({
      data: { authorId, contentText: `post ${rand()}`, createdAt: nextTime(), ...over } as never,
    });
  }

  function media(uploaderId: string, postId: string, over: Record<string, unknown> = {}) {
    return prisma().postMedia.create({
      data: {
        uploaderId,
        postId,
        kind: 'image',
        declaredContentType: 'image/jpeg',
        declaredSize: 1000,
        uploadState: 'ready',
        // PostMedia_decision_coherent: a decided row carries who decided and when.
        status: 'approved',
        decisionSource: 'auto',
        decidedAt: new Date(),
        ...over,
      } as never,
    });
  }

  const get = (token: string, query = '') =>
    request(app.getHttpServer()).get(`/admin/dashboard/latest-posts${query}`).set(bearer(token));
  const ids = (body: Array<{ id: string }>) => body.map((p) => p.id);

  describe('access', () => {
    it('401 without a token and with a User token; 200 for every admin role', async () => {
      const u = await user();
      const userToken = (await app.get(TokenService).issueTokenPair(u.id, u.role)).accessToken.token;
      await request(app.getHttpServer()).get('/admin/dashboard/latest-posts').expect(401);
      await get(userToken).expect(401);
      for (const role of ['editor', 'moderator', 'superadmin'] as const) {
        await get(await admin(role)).expect(200);
      }
    });
  });

  describe('ordering and limit', () => {
    it('newest first; default and max 5; limit=2 returns the two newest; 6 and 0 are 400', async () => {
      const tok = await admin('editor');
      const u = await user();
      const made = [];
      for (let i = 0; i < 7; i++) made.push(await post(u.id));
      const expected = made.map((p) => p.id).reverse();
      expect(ids((await get(tok).expect(200)).body)).toEqual(expected.slice(0, 5));
      expect(ids((await get(tok, '?limit=2').expect(200)).body)).toEqual(expected.slice(0, 2));
      await get(tok, '?limit=6').expect(400);
      await get(tok, '?limit=0').expect(400);
    });

    it('posts sharing the same millisecond keep creation order (newest created first)', async () => {
      const tok = await admin('editor');
      const u = await user();
      const same = nextTime();
      const first = await post(u.id, { createdAt: same });
      const second = await post(u.id, { createdAt: same });
      const third = await post(u.id, { createdAt: same });
      expect(ids((await get(tok).expect(200)).body)).toEqual([third.id, second.id, first.id]);
    });

    it('an empty table is an empty array', async () => {
      expect((await get(await admin('editor')).expect(200)).body).toEqual([]);
    });
  });

  describe('exclusions', () => {
    it('leaves out minors (confirmed and restricted-pending), under-16s and every non-active author', async () => {
      const tok = await admin('moderator');
      const adult = await user();
      const shown = await post(adult.id);

      const confirmedMinor = await user({ isMinor: true, dateOfBirth: seedDob('2010-01-01') });
      await prisma().guardian.create({
        data: { minorUserId: confirmedMinor.id, name: 'G', email: 'g1@example.com', relationship: 'Parent', consentToken: `c-${rand()}`, consentTokenExpiresAt: new Date(Date.now() + 86_400_000), consentStatus: 'confirmed' },
      });
      const pendingMinor = await user({ isMinor: true, dateOfBirth: seedDob('2010-01-01') });
      await prisma().guardian.create({
        data: { minorUserId: pendingMinor.id, name: 'G', email: 'g2@example.com', relationship: 'Parent', consentToken: `c-${rand()}`, consentTokenExpiresAt: new Date(Date.now() + 86_400_000), consentStatus: 'pending' },
      });
      const under16 = await user({ isMinor: true, isUnder16: true, dateOfBirth: seedDob('2014-01-01') });
      const deactivated = await user({ accountStatus: 'deactivated' });
      const pendingDeletion = await user({ accountStatus: 'pending_deletion' });
      const suspended = await user({ accountStatus: 'suspended' });
      const deleted = await user({ accountStatus: 'deleted' });
      for (const u of [confirmedMinor, pendingMinor, under16, deactivated, pendingDeletion, suspended, deleted]) {
        await post(u.id);
      }
      const res = await get(tok).expect(200);
      expect(ids(res.body)).toEqual([shown.id]);
    });

    it('leaves out an unrevealed final entry, shows it once visibleFrom has passed', async () => {
      const tok = await admin('editor');
      const u = await user();
      const hidden = await post(u.id, { visibleFrom: new Date(Date.now() + 86_400_000) });
      const revealed = await post(u.id, { visibleFrom: new Date(Date.now() - 86_400_000) });
      expect(ids((await get(tok).expect(200)).body)).toEqual([revealed.id]);
      expect(ids((await get(tok).expect(200)).body)).not.toContain(hidden.id);
    });

    it('leaves out a post with ANY pending, rejected or held media; shows approved and no-media posts', async () => {
      const tok = await admin('editor');
      const u = await user();
      const plain = await post(u.id);
      const approved = await post(u.id);
      await media(u.id, approved.id);
      const pending = await post(u.id);
      await media(u.id, pending.id, { status: 'pending', decisionSource: null, decidedAt: null });
      const rejected = await post(u.id);
      await media(u.id, rejected.id, { status: 'rejected', rejectionReason: 'no' });
      const held = await post(u.id);
      await media(u.id, held.id, { hiddenPendingReview: true });
      const mixed = await post(u.id);
      await media(u.id, mixed.id);
      await media(u.id, mixed.id, { status: 'pending', decisionSource: null, decidedAt: null });
      expect(ids((await get(tok).expect(200)).body).sort()).toEqual([plain.id, approved.id].sort());
    });
  });

  describe('fields', () => {
    it('returns exactly the pinned keys; the author is the public name; no real name, email or account id', async () => {
      const tok = await admin('superadmin');
      const named = await user({ username: 'amaka_fc', displayName: 'Amaka Okafor-Realname', email: 'amaka.real@example.com' });
      const unnamed = await user({ username: null, displayName: 'Hidden Realname', email: 'hidden.real@example.com' });
      const longText = 'x'.repeat(300);
      const p1 = await post(named.id, { contentText: longText, likeCount: 4, commentCount: 1 });
      const p2 = await post(unnamed.id);
      await media(unnamed.id, p2.id, { kind: 'video', declaredContentType: 'video/mp4' });
      const res = await get(tok).expect(200);
      expect(res.body).toHaveLength(2);
      for (const item of res.body) {
        expect(Object.keys(item).sort()).toEqual(['author', 'commentCount', 'createdAt', 'excerpt', 'id', 'likeCount', 'mediaType']);
        expect(Object.keys(item.author)).toEqual(['publicName']);
      }
      const byId = Object.fromEntries(res.body.map((i: { id: string }) => [i.id, i]));
      expect(byId[p1.id]).toMatchObject({ mediaType: null, excerpt: 'x'.repeat(140), likeCount: 4, commentCount: 1, author: { publicName: 'amaka_fc' } });
      expect(byId[p2.id]).toMatchObject({ mediaType: 'video', author: { publicName: 'Soccernity member' } });
      const text = JSON.stringify(res.body);
      for (const forbidden of ['Realname', 'Okafor', 'amaka.real', 'hidden.real', '@example.com', named.id, unnamed.id, 'dateOfBirth', 'email']) {
        expect(text).not.toContain(forbidden);
      }
    });

    it('mediaType: photo for an image, video when a video is attached', async () => {
      const tok = await admin('editor');
      const u = await user();
      const photo = await post(u.id);
      await media(u.id, photo.id);
      const mixed = await post(u.id);
      await media(u.id, mixed.id);
      await media(u.id, mixed.id, { kind: 'video', declaredContentType: 'video/mp4' });
      const res = await get(tok).expect(200);
      const byId = Object.fromEntries(res.body.map((i: { id: string }) => [i.id, i]));
      expect(byId[photo.id].mediaType).toBe('photo');
      expect(byId[mixed.id].mediaType).toBe('video');
    });
  });
});
