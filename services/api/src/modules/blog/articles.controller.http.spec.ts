import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ArticlesController } from './articles.controller';
import { BlogService } from './blog.service';

// HTTP-layer coverage for GET /articles and GET /articles/:id — NO
// guard override needed here (unlike every other *.controller.http.spec.ts
// in this codebase), because there IS no guard: these routes are
// genuinely public. The interesting assertion this suite proves instead
// is the opposite of the usual guard-rejection test — that a request
// with NO Authorization header at all still reaches the service.
describe('ArticlesController (HTTP layer)', () => {
  let app: INestApplication;
  const blogService = { listArticles: jest.fn(), getArticleById: jest.fn() };

  async function buildApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [ArticlesController],
      providers: [{ provide: BlogService, useValue: blogService }],
    }).compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await nestApp.init();
    return nestApp;
  }

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) await app.close();
  });

  describe('GET /articles', () => {
    it('reaches the service with no Authorization header at all — genuinely public', async () => {
      blogService.listArticles.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/articles').expect(200);

      expect(blogService.listArticles).toHaveBeenCalledWith({});
    });

    it('passes categoryId/categorySlug/cursor/limit query params through to the service', async () => {
      blogService.listArticles.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer())
        .get('/articles')
        .query({
          categoryId: '11111111-1111-4111-8111-111111111111',
          categorySlug: 'premier-league',
          cursor: 'abc',
          limit: '10',
        })
        .expect(200);

      expect(blogService.listArticles).toHaveBeenCalledWith({
        categoryId: '11111111-1111-4111-8111-111111111111',
        categorySlug: 'premier-league',
        cursor: 'abc',
        limit: 10,
      });
    });

    it('rejects a non-UUID categoryId with 400 before the service is called', async () => {
      await request(app.getHttpServer()).get('/articles').query({ categoryId: 'not-a-uuid' }).expect(400);
      expect(blogService.listArticles).not.toHaveBeenCalled();
    });

    it('rejects a limit above 50 with 400 before the service is called', async () => {
      await request(app.getHttpServer()).get('/articles').query({ limit: '999' }).expect(400);
      expect(blogService.listArticles).not.toHaveBeenCalled();
    });

    it('rejects an unknown query param with 400 (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer()).get('/articles').query({ status: 'draft' }).expect(400);
      expect(blogService.listArticles).not.toHaveBeenCalled();
    });

    it('returns the service response body as-is on success', async () => {
      const body = {
        items: [
          {
            id: 'article-1',
            title: 'A title',
            excerpt: 'An excerpt',
            publishedAt: '2026-09-01T10:00:00.000Z',
            category: { id: 'category-1', name: 'Premier League', slug: 'premier-league' },
            author: 'Jane Editor',
          },
        ],
        nextCursor: null,
      };
      blogService.listArticles.mockResolvedValue(body);

      const res = await request(app.getHttpServer()).get('/articles').expect(200);
      expect(res.body).toEqual(body);
    });
  });

  describe('GET /articles/:id', () => {
    it('reaches the service with no Authorization header at all', async () => {
      blogService.getArticleById.mockResolvedValue({
        id: 'article-1',
        title: 'A title',
        excerpt: 'x',
        body: 'Full body',
        publishedAt: '2026-09-01T10:00:00.000Z',
        category: { id: 'category-1', name: 'Premier League', slug: 'premier-league' },
        author: 'Jane Editor',
      });

      await request(app.getHttpServer()).get('/articles/article-1').expect(200);

      expect(blogService.getArticleById).toHaveBeenCalledWith('article-1');
    });

    it('propagates a 404 the service throws for a missing or draft article', async () => {
      blogService.getArticleById.mockRejectedValue(new NotFoundException('Article not found'));

      await request(app.getHttpServer()).get('/articles/missing').expect(404);
    });
  });
});
