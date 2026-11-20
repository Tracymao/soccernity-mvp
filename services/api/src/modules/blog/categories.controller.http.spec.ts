import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { BlogService } from './blog.service';
import { CategoriesController } from './categories.controller';

// HTTP-layer coverage for GET /categories — no guard, genuinely public.
describe('CategoriesController (HTTP layer)', () => {
  let app: INestApplication;
  const blogService = { listCategories: jest.fn() };

  async function buildApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [CategoriesController],
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

  it('reaches the service with no Authorization header at all', async () => {
    blogService.listCategories.mockResolvedValue({ items: [], nextCursor: null });

    await request(app.getHttpServer()).get('/categories').expect(200);

    expect(blogService.listCategories).toHaveBeenCalledWith({});
  });

  it('passes cursor/limit query params through to the service', async () => {
    blogService.listCategories.mockResolvedValue({ items: [], nextCursor: null });

    await request(app.getHttpServer()).get('/categories').query({ cursor: 'abc', limit: '10' }).expect(200);

    expect(blogService.listCategories).toHaveBeenCalledWith({ cursor: 'abc', limit: 10 });
  });

  it('rejects an unknown query param with 400 (forbidNonWhitelisted) — no client-controlled status filter', async () => {
    await request(app.getHttpServer()).get('/categories').query({ status: 'inactive' }).expect(400);
    expect(blogService.listCategories).not.toHaveBeenCalled();
  });

  it('rejects a limit above 50 with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/categories').query({ limit: '999' }).expect(400);
    expect(blogService.listCategories).not.toHaveBeenCalled();
  });

  it('returns the service response body as-is on success', async () => {
    const body = { items: [{ id: 'category-1', name: 'Premier League', slug: 'premier-league' }], nextCursor: null };
    blogService.listCategories.mockResolvedValue(body);

    const res = await request(app.getHttpServer()).get('/categories').expect(200);
    expect(res.body).toEqual(body);
  });
});
