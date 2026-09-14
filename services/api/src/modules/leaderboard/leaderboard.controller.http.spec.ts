import { BadRequestException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LeaderboardController } from './leaderboard.controller';
import { LeaderboardService } from './leaderboard.service';

// HTTP-layer coverage for GET /leaderboard — JwtAuthGuard is overridden
// (token verification isn't this suite's concern, matching every other
// *.controller.http.spec.ts in this codebase) so the interesting
// assertion is that an UNauthenticated request is genuinely rejected
// when the guard is left to run for real.
describe('LeaderboardController (HTTP layer)', () => {
  let app: INestApplication;
  const leaderboardService = { getLeaderboard: jest.fn() };

  const CALLER = { sub: 'user-1', role: 'fan' };

  async function buildApp(guardResult: boolean | 'real' = true) {
    const moduleRef = await Test.createTestingModule({
      controllers: [LeaderboardController],
      providers: [{ provide: LeaderboardService, useValue: leaderboardService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (guardResult === false) return false;
          context.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .compile();

    const nestApp = moduleRef.createNestApplication();
    nestApp.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await nestApp.init();
    return nestApp;
  }

  afterEach(async () => {
    jest.clearAllMocks();
    if (app) await app.close();
  });

  describe('GET /leaderboard', () => {
    it('is JwtAuthGuard-gated — a caller the guard rejects never reaches the service', async () => {
      app = await buildApp(false);
      await request(app.getHttpServer()).get('/leaderboard').expect(403);
      expect(leaderboardService.getLeaderboard).not.toHaveBeenCalled();
    });

    it('an authenticated caller reaches the service with no query params', async () => {
      app = await buildApp(true);
      leaderboardService.getLeaderboard.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer()).get('/leaderboard').expect(200);

      expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith({});
    });

    it('passes period/cursor/limit query params through to the service', async () => {
      app = await buildApp(true);
      leaderboardService.getLeaderboard.mockResolvedValue({ items: [], nextCursor: null });

      await request(app.getHttpServer())
        .get('/leaderboard')
        .query({ period: '2026-W33', cursor: 'abc', limit: '10' })
        .expect(200);

      expect(leaderboardService.getLeaderboard).toHaveBeenCalledWith({
        period: '2026-W33',
        cursor: 'abc',
        limit: 10,
      });
    });

    it('rejects a limit above 50 with 400 before the service is called', async () => {
      app = await buildApp(true);

      await request(app.getHttpServer()).get('/leaderboard').query({ limit: '999' }).expect(400);

      expect(leaderboardService.getLeaderboard).not.toHaveBeenCalled();
    });

    it('rejects an unknown query param with 400 (forbidNonWhitelisted)', async () => {
      app = await buildApp(true);

      await request(app.getHttpServer()).get('/leaderboard').query({ clubId: 'not-a-real-param' }).expect(400);

      expect(leaderboardService.getLeaderboard).not.toHaveBeenCalled();
    });

    it('propagates a 400 the service throws for a malformed period', async () => {
      app = await buildApp(true);
      leaderboardService.getLeaderboard.mockRejectedValue(new BadRequestException('period must be in the form "YYYY-Www"'));

      await request(app.getHttpServer()).get('/leaderboard').query({ period: 'garbage' }).expect(400);
    });

    it('returns the service response body as-is on success', async () => {
      app = await buildApp(true);
      const body = {
        items: [{ userId: 'u-1', displayName: 'Alice', points: 250, rank: 1 }],
        nextCursor: null,
      };
      leaderboardService.getLeaderboard.mockResolvedValue(body);

      const res = await request(app.getHttpServer()).get('/leaderboard').expect(200);
      expect(res.body).toEqual(body);
    });
  });
});
