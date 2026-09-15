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
  });
});
