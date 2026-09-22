import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { TRENDING_DEFAULT_LIMIT, TRENDING_MAX_LIMIT } from './trending.constants';
import { TrendingController } from './trending.controller';
import { TrendingService } from './trending.service';

// HTTP-layer coverage for GET /trending — genuinely public, same
// no-guard-at-all shape as SearchController's own http spec (this
// module's own search.controller.http.spec.ts). The interesting
// assertion is the same one that file proves: a request with NO
// Authorization header at all still reaches the service.
describe('TrendingController (HTTP layer)', () => {
  let app: INestApplication;
  const trendingService = { getTrending: jest.fn() };

  async function buildApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [TrendingController],
      providers: [{ provide: TrendingService, useValue: trendingService }],
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
    trendingService.getTrending.mockResolvedValue({ items: [] });

    await request(app.getHttpServer()).get('/trending').expect(200);

    expect(trendingService.getTrending).toHaveBeenCalledWith(TRENDING_DEFAULT_LIMIT);
  });

  it('defaults to TRENDING_DEFAULT_LIMIT when no limit query param is given', async () => {
    trendingService.getTrending.mockResolvedValue({ items: [] });

    await request(app.getHttpServer()).get('/trending').expect(200);

    expect(trendingService.getTrending).toHaveBeenCalledWith(TRENDING_DEFAULT_LIMIT);
  });

  it('passes a valid limit query param through to the service', async () => {
    trendingService.getTrending.mockResolvedValue({ items: [] });

    await request(app.getHttpServer()).get('/trending').query({ limit: '5' }).expect(200);

    expect(trendingService.getTrending).toHaveBeenCalledWith(5);
  });

  it('rejects a limit above TRENDING_MAX_LIMIT with 400 before the service is called (same @Max-at-the-DTO-layer convention as SearchQueryDto)', async () => {
    await request(app.getHttpServer())
      .get('/trending')
      .query({ limit: String(TRENDING_MAX_LIMIT + 1) })
      .expect(400);
    expect(trendingService.getTrending).not.toHaveBeenCalled();
  });

  it('rejects a non-integer limit with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/trending').query({ limit: 'abc' }).expect(400);
    expect(trendingService.getTrending).not.toHaveBeenCalled();
  });

  it('rejects a limit below 1 with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/trending').query({ limit: '0' }).expect(400);
    expect(trendingService.getTrending).not.toHaveBeenCalled();
  });

  it('rejects an unknown query param with 400 (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer()).get('/trending').query({ q: 'chelsea' }).expect(400);
    expect(trendingService.getTrending).not.toHaveBeenCalled();
  });

  it('returns the service response body as-is on success', async () => {
    const body = { items: [{ tag: 'epl', postCount: 12, score: 9.4 }] };
    trendingService.getTrending.mockResolvedValue(body);

    const res = await request(app.getHttpServer()).get('/trending').expect(200);
    expect(res.body).toEqual(body);
  });
});
