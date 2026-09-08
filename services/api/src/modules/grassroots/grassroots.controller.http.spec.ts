import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GrassrootsFixturesController } from './grassroots-fixtures.controller';
import { GrassrootsTeamsController } from './grassroots-teams.controller';
import { GrassrootsService } from './grassroots.service';

// Exercises the real HTTP layer: routing, DTO validation, guard wiring —
// following clubs.controller.http.spec.ts's precedent. Both JwtAuthGuard
// and GuardianConsentGuard are overridden (token verification / real
// consent lookup aren't this suite's concern).
describe('Grassroots controllers (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  let consentGuardCalls = 0;

  const grassroots = {
    createTeam: jest.fn(),
    getTeamById: jest.fn(),
    listTeams: jest.fn(),
    listTeamFixtures: jest.fn(),
    createFixture: jest.fn(),
    getFixtureById: jest.fn(),
    logResult: jest.fn(),
    updateFixtureStatus: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GrassrootsTeamsController, GrassrootsFixturesController],
      providers: [{ provide: GrassrootsService, useValue: grassroots }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = CALLER;
          return true;
        },
      })
      .overrideGuard(GuardianConsentGuard)
      .useValue({
        canActivate: () => {
          consentGuardCalls += 1;
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

  afterEach(() => {
    jest.clearAllMocks();
    consentGuardCalls = 0;
  });

  // ---------- /teams ----------

  describe('POST /teams', () => {
    it('creates a team, delegating to GrassrootsService.createTeam(caller, dto) — and the consent guard ran', async () => {
      grassroots.createTeam.mockResolvedValue({ id: 't-1' });

      await request(app.getHttpServer())
        .post('/teams')
        .send({ name: 'Hackney Wick FC', city: 'London', leagueType: 'informal' })
        .expect(201);

      expect(grassroots.createTeam).toHaveBeenCalledWith('user-1', {
        name: 'Hackney Wick FC',
        city: 'London',
        leagueType: 'informal',
      });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects an unknown leagueType with 400', async () => {
      await request(app.getHttpServer())
        .post('/teams')
        .send({ name: 'A B', city: 'C D', leagueType: 'pro' })
        .expect(400);
      expect(grassroots.createTeam).not.toHaveBeenCalled();
    });

    it('rejects a missing name with 400', async () => {
      await request(app.getHttpServer()).post('/teams').send({ city: 'London', leagueType: 'school' }).expect(400);
    });

    it('strips an attempt to set createdById via the body (whitelist)', async () => {
      grassroots.createTeam.mockResolvedValue({});
      await request(app.getHttpServer())
        .post('/teams')
        .send({ name: 'A B', city: 'C D', leagueType: 'academy', createdById: 'someone-else' })
        .expect(400); // forbidNonWhitelisted
    });
  });

  describe('GET /teams', () => {
    it('passes cursor/limit/city through', async () => {
      grassroots.listTeams.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/teams?limit=5&city=Bristol&cursor=abc').expect(200);
      expect(grassroots.listTeams).toHaveBeenCalledWith({ limit: 5, city: 'Bristol', cursor: 'abc' });
    });

    it('rejects a limit above the max with 400', async () => {
      await request(app.getHttpServer()).get('/teams?limit=999').expect(400);
      expect(grassroots.listTeams).not.toHaveBeenCalled();
    });

    it('does not shadow GET /teams/:id', async () => {
      grassroots.getTeamById.mockResolvedValue({ id: 't-1' });
      await request(app.getHttpServer()).get('/teams/t-1').expect(200);
      expect(grassroots.getTeamById).toHaveBeenCalledWith('t-1');
      expect(grassroots.listTeams).not.toHaveBeenCalled();
    });
  });

  describe('GET /teams/:id', () => {
    it('propagates a 404 from the service', async () => {
      grassroots.getTeamById.mockRejectedValue(new NotFoundException('Team not found'));
      await request(app.getHttpServer()).get('/teams/missing').expect(404);
    });
  });

  describe('GET /teams/:id/fixtures', () => {
    it('delegates to listTeamFixtures(id, query), no collision with GET /teams/:id', async () => {
      grassroots.listTeamFixtures.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/teams/t-1/fixtures?limit=3').expect(200);
      expect(grassroots.listTeamFixtures).toHaveBeenCalledWith('t-1', { limit: 3 });
      expect(grassroots.getTeamById).not.toHaveBeenCalled();
    });

    it('propagates a 404 for a missing team', async () => {
      grassroots.listTeamFixtures.mockRejectedValue(new NotFoundException('Team not found'));
      await request(app.getHttpServer()).get('/teams/missing/fixtures').expect(404);
    });
  });

  // ---------- /fixtures ----------

  describe('POST /fixtures', () => {
    it('creates a fixture, delegating with the caller id — consent guard ran', async () => {
      grassroots.createFixture.mockResolvedValue({ id: 'f-1' });
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({ teamAId: '11111111-1111-4111-8111-111111111111', scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(201);
      expect(grassroots.createFixture).toHaveBeenCalledWith('user-1', {
        teamAId: '11111111-1111-4111-8111-111111111111',
        scheduledAt: '2026-10-01T14:00:00.000Z',
      });
      expect(consentGuardCalls).toBe(1);
    });

    it('passes a free-text opponentName through to the service (Decision Log #256)', async () => {
      grassroots.createFixture.mockResolvedValue({ id: 'f-1' });
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({
          teamAId: '11111111-1111-4111-8111-111111111111',
          opponentName: 'Riverside FC',
          scheduledAt: '2026-10-01T14:00:00.000Z',
        })
        .expect(201);
      expect(grassroots.createFixture).toHaveBeenCalledWith('user-1', {
        teamAId: '11111111-1111-4111-8111-111111111111',
        opponentName: 'Riverside FC',
        scheduledAt: '2026-10-01T14:00:00.000Z',
      });
    });

    it('rejects an opponentName longer than 120 chars with 400', async () => {
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({
          teamAId: '11111111-1111-4111-8111-111111111111',
          opponentName: 'x'.repeat(121),
          scheduledAt: '2026-10-01T14:00:00.000Z',
        })
        .expect(400);
      expect(grassroots.createFixture).not.toHaveBeenCalled();
    });

    it('propagates the service 400 when both teamBId and opponentName are supplied', async () => {
      grassroots.createFixture.mockRejectedValue(
        new BadRequestException(
          'Provide either a registered opponent team or an opponent name, not both.',
        ),
      );
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({
          teamAId: '11111111-1111-4111-8111-111111111111',
          teamBId: '22222222-2222-4222-8222-222222222222',
          opponentName: 'Riverside FC',
          scheduledAt: '2026-10-01T14:00:00.000Z',
        })
        .expect(400);
    });

    it('rejects a non-UUID teamAId with 400', async () => {
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({ teamAId: 'not-a-uuid', scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(400);
    });

    it('rejects a non-ISO scheduledAt with 400', async () => {
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({ teamAId: '11111111-1111-4111-8111-111111111111', scheduledAt: 'next tuesday' })
        .expect(400);
    });

    it('propagates a 403 from the service (not teamA creator)', async () => {
      grassroots.createFixture.mockRejectedValue(new ForbiddenException());
      await request(app.getHttpServer())
        .post('/fixtures')
        .send({ teamAId: '11111111-1111-4111-8111-111111111111', scheduledAt: '2026-10-01T14:00:00.000Z' })
        .expect(403);
    });
  });

  describe('GET /fixtures/:id', () => {
    it('propagates a 404 from the service', async () => {
      grassroots.getFixtureById.mockRejectedValue(new NotFoundException('Fixture not found'));
      await request(app.getHttpServer()).get('/fixtures/missing').expect(404);
    });
  });

  describe('POST /fixtures/:id/result', () => {
    it('returns 200 (not 201) and delegates with the caller id — consent guard ran', async () => {
      grassroots.logResult.mockResolvedValue({ id: 'f-1', status: 'full_time' });
      await request(app.getHttpServer())
        .post('/fixtures/f-1/result')
        .send({ scoreA: 2, scoreB: 1 })
        .expect(200);
      expect(grassroots.logResult).toHaveBeenCalledWith('user-1', 'f-1', { scoreA: 2, scoreB: 1 });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects a negative score with 400', async () => {
      await request(app.getHttpServer()).post('/fixtures/f-1/result').send({ scoreA: -1, scoreB: 0 }).expect(400);
      expect(grassroots.logResult).not.toHaveBeenCalled();
    });

    it('rejects a non-integer score with 400', async () => {
      await request(app.getHttpServer()).post('/fixtures/f-1/result').send({ scoreA: 1.5, scoreB: 0 }).expect(400);
    });

    it('propagates a 409 from the service (result already exists / race)', async () => {
      grassroots.logResult.mockRejectedValue(new ConflictException('already recorded'));
      await request(app.getHttpServer()).post('/fixtures/f-1/result').send({ scoreA: 0, scoreB: 0 }).expect(409);
    });
  });

  describe('PATCH /fixtures/:id/status', () => {
    it('delegates to updateFixtureStatus with the caller id — consent guard ran', async () => {
      grassroots.updateFixtureStatus.mockResolvedValue({ id: 'f-1', status: 'live' });
      await request(app.getHttpServer()).patch('/fixtures/f-1/status').send({ status: 'live' }).expect(200);
      expect(grassroots.updateFixtureStatus).toHaveBeenCalledWith('user-1', 'f-1', { status: 'live' });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects status: "scheduled" with 400 (not a patchable target)', async () => {
      await request(app.getHttpServer()).patch('/fixtures/f-1/status').send({ status: 'scheduled' }).expect(400);
      expect(grassroots.updateFixtureStatus).not.toHaveBeenCalled();
    });

    it('rejects an unknown status value with 400', async () => {
      await request(app.getHttpServer()).patch('/fixtures/f-1/status').send({ status: 'postponed' }).expect(400);
    });

    it('propagates a 409 from the service (illegal transition)', async () => {
      grassroots.updateFixtureStatus.mockRejectedValue(new ConflictException('cannot move'));
      await request(app.getHttpServer()).patch('/fixtures/f-1/status').send({ status: 'full_time' }).expect(409);
    });
  });
});
