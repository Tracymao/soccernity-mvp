import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AdminArticlesController } from './admin-articles.controller';
import { AdminContentService } from './admin-content.service';

// Exercises the real HTTP layer: routing, DTO validation, AND the REAL
// AdminRolesGuard (left as a genuine DI-resolved instance, matching
// admin-moderation.controller.http.spec.ts's own precedent) — proving a
// moderator is actually rejected and editor/superadmin are actually let
// through, not just documented as such in a comment.
describe('AdminArticlesController (HTTP layer)', () => {
  let app: INestApplication;
  const adminContentService = {
    listArticles: jest.fn(),
    createArticle: jest.fn(),
    updateArticle: jest.fn(),
  };

  let currentAdmin: { sub: string; role: string; aud: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminArticlesController],
      providers: [{ provide: AdminContentService, useValue: adminContentService }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().admin = currentAdmin;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  describe('role gating (editor/superadmin only, not moderator)', () => {
    it('rejects a moderator with 403 on GET /admin/articles', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer()).get('/admin/articles').expect(403);
      expect(adminContentService.listArticles).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on POST /admin/articles', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({ title: 'A title', body: 'A body', categoryId: '123e4567-e89b-42d3-a456-426614174000' })
        .expect(403);
      expect(adminContentService.createArticle).not.toHaveBeenCalled();
    });

    it('rejects a moderator with 403 on PATCH /admin/articles/:id', async () => {
      currentAdmin = { sub: 'admin-1', role: 'moderator', aud: 'admin-console' };

      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ title: 'New title' })
        .expect(403);
      expect(adminContentService.updateArticle).not.toHaveBeenCalled();
    });

    it('allows an editor through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
      adminContentService.listArticles.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/articles').expect(200);
      expect(adminContentService.listArticles).toHaveBeenCalledTimes(1);
    });

    it('allows a superadmin through', async () => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
      adminContentService.listArticles.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/admin/articles').expect(200);
      expect(adminContentService.listArticles).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /admin/articles', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    });

    it('passes the query through to the service', async () => {
      adminContentService.listArticles.mockResolvedValue({ items: [{ id: 'article-1' }], nextCursor: null });

      const res = await request(app.getHttpServer())
        .get('/admin/articles')
        .query({ status: 'draft', limit: 10 })
        .expect(200);

      expect(adminContentService.listArticles).toHaveBeenCalledWith({ status: 'draft', limit: 10 });
      expect(res.body.items).toHaveLength(1);
    });

    it('rejects an invalid status filter', async () => {
      await request(app.getHttpServer()).get('/admin/articles').query({ status: 'bogus' }).expect(400);
    });

    it('rejects a non-UUID categoryId filter', async () => {
      await request(app.getHttpServer()).get('/admin/articles').query({ categoryId: 'not-a-uuid' }).expect(400);
    });
  });

  describe('POST /admin/articles', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'editor', aud: 'admin-console' };
    });

    it('creates an article, forwarding the acting admin id', async () => {
      adminContentService.createArticle.mockResolvedValue({ id: 'article-1', status: 'draft' });

      const res = await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
        })
        .expect(201);

      expect(adminContentService.createArticle).toHaveBeenCalledWith('admin-1', {
        title: 'A title',
        body: 'A body',
        categoryId: '123e4567-e89b-42d3-a456-426614174000',
      });
      expect(res.body.status).toBe('draft');
    });

    it('rejects a missing title', async () => {
      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({ body: 'A body', categoryId: '123e4567-e89b-42d3-a456-426614174000' })
        .expect(400);
    });

    it('rejects a non-UUID categoryId', async () => {
      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({ title: 'A title', body: 'A body', categoryId: 'not-a-uuid' })
        .expect(400);
    });

    it('rejects an unknown field (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
          authorAdminId: 'someone-else',
        })
        .expect(400);
    });

    it('accepts and forwards an optional excerpt', async () => {
      adminContentService.createArticle.mockResolvedValue({ id: 'article-1', status: 'draft' });

      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
          excerpt: 'A curated summary.',
        })
        .expect(201);

      expect(adminContentService.createArticle).toHaveBeenCalledWith('admin-1', {
        title: 'A title',
        body: 'A body',
        categoryId: '123e4567-e89b-42d3-a456-426614174000',
        excerpt: 'A curated summary.',
      });
    });

    it('rejects an excerpt over the max length', async () => {
      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
          excerpt: 'x'.repeat(301),
        })
        .expect(400);
    });

    // Decision Log #334, resolved — coverImageId.
    it('accepts and forwards an optional coverImageId', async () => {
      adminContentService.createArticle.mockResolvedValue({ id: 'article-1', status: 'draft' });

      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
          coverImageId: '223e4567-e89b-42d3-a456-426614174000',
        })
        .expect(201);

      expect(adminContentService.createArticle).toHaveBeenCalledWith('admin-1', {
        title: 'A title',
        body: 'A body',
        categoryId: '123e4567-e89b-42d3-a456-426614174000',
        coverImageId: '223e4567-e89b-42d3-a456-426614174000',
      });
    });

    it('omits coverImageId entirely when not sent', async () => {
      adminContentService.createArticle.mockResolvedValue({ id: 'article-1', status: 'draft' });

      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
        })
        .expect(201);

      const call = adminContentService.createArticle.mock.calls[0][1];
      expect('coverImageId' in call).toBe(false);
    });

    it('rejects a non-UUID coverImageId', async () => {
      await request(app.getHttpServer())
        .post('/admin/articles')
        .send({
          title: 'A title',
          body: 'A body',
          categoryId: '123e4567-e89b-42d3-a456-426614174000',
          coverImageId: 'not-a-uuid',
        })
        .expect(400);
      expect(adminContentService.createArticle).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /admin/articles/:id', () => {
    beforeEach(() => {
      currentAdmin = { sub: 'admin-1', role: 'superadmin', aud: 'admin-console' };
    });

    it('updates an article', async () => {
      adminContentService.updateArticle.mockResolvedValue({ id: 'article-1', status: 'published' });

      const res = await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ status: 'published' })
        .expect(200);

      expect(adminContentService.updateArticle).toHaveBeenCalledWith('article-1', { status: 'published' });
      expect(res.body.status).toBe('published');
    });

    it('rejects an invalid status value', async () => {
      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ status: 'archived' })
        .expect(400);
    });

    it('updates an article excerpt, including clearing it with an empty string', async () => {
      adminContentService.updateArticle.mockResolvedValue({ id: 'article-1', excerpt: null });

      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ excerpt: '' })
        .expect(200);

      expect(adminContentService.updateArticle).toHaveBeenCalledWith('article-1', { excerpt: '' });
    });

    // Decision Log #334, resolved — coverImageId's genuinely three-way
    // optional PATCH semantics, proven against the REAL global
    // ValidationPipe (whitelist + transform), not just asserted in a
    // comment: an explicit `null` in the request body must survive
    // class-transformer's plainToInstance and NOT be stripped by
    // `whitelist: true` (which only removes undeclared properties, never
    // coerces the value of a declared one).
    it('sets a coverImageId', async () => {
      adminContentService.updateArticle.mockResolvedValue({ id: 'article-1', coverImageId: 'media-1' });

      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ coverImageId: '223e4567-e89b-42d3-a456-426614174000' })
        .expect(200);

      expect(adminContentService.updateArticle).toHaveBeenCalledWith('article-1', {
        coverImageId: '223e4567-e89b-42d3-a456-426614174000',
      });
    });

    it('clears a coverImageId with an EXPLICIT null, surviving the real ValidationPipe', async () => {
      adminContentService.updateArticle.mockResolvedValue({ id: 'article-1', coverImageId: null });

      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ coverImageId: null })
        .expect(200);

      expect(adminContentService.updateArticle).toHaveBeenCalledWith('article-1', { coverImageId: null });
    });

    it('leaves coverImageId untouched (not forwarded at all) when omitted from the patch', async () => {
      adminContentService.updateArticle.mockResolvedValue({ id: 'article-1' });

      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ title: 'A new title' })
        .expect(200);

      const call = adminContentService.updateArticle.mock.calls[0][1];
      expect('coverImageId' in call).toBe(false);
    });

    it('rejects a non-UUID coverImageId (a real value, not null)', async () => {
      await request(app.getHttpServer())
        .patch('/admin/articles/article-1')
        .send({ coverImageId: 'not-a-uuid' })
        .expect(400);
      expect(adminContentService.updateArticle).not.toHaveBeenCalled();
    });
  });
});
