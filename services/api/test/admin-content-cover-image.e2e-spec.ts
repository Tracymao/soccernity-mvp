import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// feat/article-cover-image — resolving Decision Log #334.
//
// Hits test/README.md's third e2e trigger (a genuinely novel Prisma
// relation/constraint): `Article.coverImage` is the FIRST relation
// anywhere in this schema to use an EXPLICIT `onDelete: SetNull` — every
// other optional relation in this codebase that needed a non-default
// on-delete behaviour states so explicitly (`Report.reporter`'s own
// comment on `onDelete: Restrict`, right next to this one, notes that
// Prisma's own DEFAULT for an optional relation is already SetNull — but
// nothing had ever actually exercised that default/explicit behaviour
// against a real Postgres FK constraint before this PR). A mocked
// Prisma client can't prove whether Postgres's real `ON DELETE SET NULL`
// constraint genuinely fires when the referenced MediaAsset row is
// deleted — only a real database can.
//
// Admins/categories/media are seeded directly via Prisma + a real
// AdminTokenService-minted access token (createAdmin), the same pattern
// admin-staff-vetting.e2e-spec.ts / admin-users.e2e-spec.ts use. Neither
// /admin/articles nor /admin/media carries @AuthRateLimit(), so there is
// no shared-throttler workaround needed here.
describe('Admin Content Cover Image e2e: Article.coverImageId against real Postgres', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);

  function server() {
    return app.getHttpServer();
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function createAdmin(label: string, role: string): Promise<{ adminId: string; accessToken: string }> {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-cover-admin-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `E2E Cover Admin ${label}`,
        role,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { adminId: admin.id, accessToken: accessToken.token };
  }

  async function createCategory(label: string): Promise<string> {
    const prisma = getTestPrismaClient();
    const category = await prisma.category.create({
      data: { name: `E2E Category ${label} ${rand()}`, slug: `e2e-category-${label}-${rand()}` },
    });
    return category.id;
  }

  async function createMediaAsset(label: string): Promise<string> {
    const prisma = getTestPrismaClient();
    const media = await prisma.mediaAsset.create({
      data: {
        uploaderId: 'e2e-uploader',
        url: `https://media.example.com/e2e-${label}-${rand()}.jpg`,
        type: 'image',
        size: 1024,
        key: `media/e2e/${label}-${rand()}.jpg`,
      },
    });
    return media.id;
  }

  it('creates an article with a real coverImageId, returning the resolved nested coverImage', async () => {
    const editor = await createAdmin('creator', 'editor');
    const categoryId = await createCategory('news');
    const mediaId = await createMediaAsset('cover');

    const res = await request(server())
      .post('/admin/articles')
      .set(auth(editor.accessToken))
      .send({ title: 'A title', body: 'A body', categoryId, coverImageId: mediaId })
      .expect(201);

    expect(res.body.coverImageId).toBe(mediaId);
    expect(res.body.coverImage).toMatchObject({ id: mediaId, type: 'image' });
    expect(typeof res.body.coverImage.url).toBe('string');
    // The pre-existing `category` gap this PR fixed as a direct side
    // effect (see admin-content.service.ts's own comment): the real HTTP
    // response now genuinely carries the nested category too, not just
    // the new coverImage field.
    expect(res.body.category).toMatchObject({ id: categoryId });

    const prisma = getTestPrismaClient();
    const row = await prisma.article.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row.coverImageId).toBe(mediaId);
  });

  it('404s creating an article with a coverImageId that does not reference a real MediaAsset', async () => {
    const editor = await createAdmin('bad-create', 'editor');
    const categoryId = await createCategory('news');

    await request(server())
      .post('/admin/articles')
      .set(auth(editor.accessToken))
      .send({
        title: 'A title',
        body: 'A body',
        categoryId,
        coverImageId: '11111111-1111-4111-8111-111111111111',
      })
      .expect(404);

    const prisma = getTestPrismaClient();
    const count = await prisma.article.count();
    expect(count).toBe(0);
  });

  it('creates an article with no coverImageId at all — coverImageId/coverImage both null', async () => {
    const editor = await createAdmin('no-cover', 'editor');
    const categoryId = await createCategory('news');

    const res = await request(server())
      .post('/admin/articles')
      .set(auth(editor.accessToken))
      .send({ title: 'A title', body: 'A body', categoryId })
      .expect(201);

    expect(res.body.coverImageId).toBeNull();
    expect(res.body.coverImage).toBeNull();
  });

  it('sets a cover image on an existing article via PATCH, then clears it via an explicit null', async () => {
    const editor = await createAdmin('patch-flow', 'editor');
    const categoryId = await createCategory('news');
    const mediaId = await createMediaAsset('patch');
    const prisma = getTestPrismaClient();

    const article = await prisma.article.create({
      data: { title: 'A title', body: 'A body', categoryId, authorAdminId: editor.adminId },
    });
    expect(article.coverImageId).toBeNull();

    const setRes = await request(server())
      .patch(`/admin/articles/${article.id}`)
      .set(auth(editor.accessToken))
      .send({ coverImageId: mediaId })
      .expect(200);
    expect(setRes.body.coverImageId).toBe(mediaId);
    expect(setRes.body.coverImage).toMatchObject({ id: mediaId });

    const afterSet = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(afterSet.coverImageId).toBe(mediaId);

    // An explicit `null` clears it back — distinct from omitting the
    // field entirely (proven by the next test).
    const clearRes = await request(server())
      .patch(`/admin/articles/${article.id}`)
      .set(auth(editor.accessToken))
      .send({ coverImageId: null })
      .expect(200);
    expect(clearRes.body.coverImageId).toBeNull();
    expect(clearRes.body.coverImage).toBeNull();

    const afterClear = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(afterClear.coverImageId).toBeNull();
  });

  it('omitting coverImageId on PATCH leaves a previously-set cover image untouched', async () => {
    const editor = await createAdmin('patch-untouched', 'editor');
    const categoryId = await createCategory('news');
    const mediaId = await createMediaAsset('untouched');
    const prisma = getTestPrismaClient();

    const article = await prisma.article.create({
      data: { title: 'A title', body: 'A body', categoryId, authorAdminId: editor.adminId, coverImageId: mediaId },
    });

    const res = await request(server())
      .patch(`/admin/articles/${article.id}`)
      .set(auth(editor.accessToken))
      .send({ title: 'A new title' })
      .expect(200);

    expect(res.body.coverImageId).toBe(mediaId);

    const row = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(row.coverImageId).toBe(mediaId);
  });

  it('404s patching a coverImageId that does not reference a real MediaAsset, leaving the existing article untouched', async () => {
    const editor = await createAdmin('bad-patch', 'editor');
    const categoryId = await createCategory('news');
    const mediaId = await createMediaAsset('kept');
    const prisma = getTestPrismaClient();

    const article = await prisma.article.create({
      data: { title: 'A title', body: 'A body', categoryId, authorAdminId: editor.adminId, coverImageId: mediaId },
    });

    await request(server())
      .patch(`/admin/articles/${article.id}`)
      .set(auth(editor.accessToken))
      .send({ coverImageId: '11111111-1111-4111-8111-111111111111' })
      .expect(404);

    const row = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(row.coverImageId).toBe(mediaId);
  });

  it('the real Postgres FK: deleting the referenced MediaAsset sets Article.coverImageId to NULL, not blocking the delete and not touching the Article row otherwise', async () => {
    const editor = await createAdmin('fk-setnull', 'editor');
    const categoryId = await createCategory('news');
    const mediaId = await createMediaAsset('deleted-later');
    const prisma = getTestPrismaClient();

    const article = await prisma.article.create({
      data: {
        title: 'A title that must survive',
        body: 'A body',
        categoryId,
        authorAdminId: editor.adminId,
        coverImageId: mediaId,
      },
    });

    const beforeDelete = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(beforeDelete.coverImageId).toBe(mediaId);

    // No DELETE /admin/media/:id route exists yet (see media/README.md's
    // own "What this PR does NOT do") — deleting directly via Prisma is
    // the only way to exercise the real FK constraint today, and is
    // exactly what a future delete endpoint would do at the database
    // level regardless of how it's reached over HTTP.
    await prisma.mediaAsset.delete({ where: { id: mediaId } });

    const afterDelete = await prisma.article.findUniqueOrThrow({ where: { id: article.id } });
    expect(afterDelete.coverImageId).toBeNull();
    // Nothing else about the Article row was touched by the FK firing.
    expect(afterDelete.title).toBe('A title that must survive');
    expect(afterDelete.body).toBe('A body');
    expect(afterDelete.categoryId).toBe(categoryId);

    // And the real HTTP read surfaces the same thing — a null
    // coverImageId, null nested coverImage, article otherwise intact.
    const res = await request(server())
      .get('/admin/articles')
      .set(auth(editor.accessToken))
      .expect(200);
    const row = res.body.items.find((a: { id: string }) => a.id === article.id);
    expect(row).toBeDefined();
    expect(row.coverImageId).toBeNull();
    expect(row.coverImage).toBeNull();
    expect(row.title).toBe('A title that must survive');
  });
});
