import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { SearchController } from './search.controller';
import { SearchService } from './search.service';

// HTTP-layer coverage for GET /search — NO guard override needed here
// (same as ArticlesController's own http spec), because there IS no
// guard: this route is genuinely public. The interesting assertion this
// suite proves instead of the usual guard-rejection test is the
// opposite — that a request with NO Authorization header at all still
// reaches the service.
describe('SearchController (HTTP layer)', () => {
  let app: INestApplication;
  const searchService = { search: jest.fn() };

  async function buildApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [SearchController],
      providers: [{ provide: SearchService, useValue: searchService }],
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

  it('reaches the service with no Authorization header at all — genuinely public', async () => {
    searchService.search.mockResolvedValue({
      users: { items: [], nextCursor: null },
      clubs: { items: [], nextCursor: null },
      posts: { items: [], nextCursor: null },
    });

    await request(app.getHttpServer()).get('/search').query({ q: 'chelsea' }).expect(200);

    expect(searchService.search).toHaveBeenCalledWith({ q: 'chelsea' });
  });

  it('rejects a missing q with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/search').expect(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('rejects a q shorter than 2 characters with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/search').query({ q: 'a' }).expect(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('rejects a q longer than 100 characters with 400 before the service is called', async () => {
    await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'a'.repeat(101) })
      .expect(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('rejects an invalid scope with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/search').query({ q: 'chelsea', scope: 'clubz' }).expect(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('rejects a limit above 50 with 400 before the service is called', async () => {
    await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'chelsea', limit: '999' })
      .expect(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('rejects an unknown query param with 400 (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'chelsea', status: 'draft' })
      .expect(400);
    expect(searchService.search).not.toHaveBeenCalled();
  });

  it('passes scope/cursor/limit query params through to the service', async () => {
    searchService.search.mockResolvedValue({ items: [], nextCursor: null });

    await request(app.getHttpServer())
      .get('/search')
      .query({ q: 'chelsea', scope: 'users', cursor: 'abc', limit: '10' })
      .expect(200);

    expect(searchService.search).toHaveBeenCalledWith({
      q: 'chelsea',
      scope: 'users',
      cursor: 'abc',
      limit: 10,
    });
  });

  it('propagates a 400 the service throws (e.g. cursor without scope)', async () => {
    searchService.search.mockRejectedValue(new BadRequestException('cursor requires scope to be specified'));

    await request(app.getHttpServer()).get('/search').query({ q: 'chelsea', cursor: 'abc' }).expect(400);
  });

  it('returns the service response body as-is on success', async () => {
    const body = {
      users: { items: [{ id: 'user-1', displayName: 'Chelsea Fan' }], nextCursor: null },
      clubs: { items: [], nextCursor: null },
      posts: { items: [], nextCursor: null },
    };
    searchService.search.mockResolvedValue(body);

    const res = await request(app.getHttpServer()).get('/search').query({ q: 'chelsea' }).expect(200);
    expect(res.body).toEqual(body);
  });
});
