import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

// HTTP-layer coverage for the user-facing Contest endpoints. JwtAuthGuard
// is overridden (token verification isn't this suite's concern) but
// GuardianConsentGuard is left REAL / DI-resolved (backed by a mocked
// PrismaService) — the same discipline feed.controller.http.spec.ts uses,
// so "POST /contest/entries is consent-gated, the two GETs are not" is a
// genuine regression test, not just a comment.
describe('ContestController (HTTP layer)', () => {
  let app: INestApplication;
  const contestService = {
    getCurrentContest: jest.fn(),
    getCycleById: jest.fn(),
    submitEntry: jest.fn(),
  };
  const prisma = {
    user: { findUnique: jest.fn() },
    guardian: { findUnique: jest.fn() },
  };

  const CALLER = { sub: 'user-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContestController],
      providers: [
        { provide: ContestService, useValue: contestService },
        GuardianConsentGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = CALLER;
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

  describe('GET /contest/current', () => {
    it('passes the caller id through, no consent gate', async () => {
      contestService.getCurrentContest.mockResolvedValue({ cycle: null, phase: null, isAcceptingEntries: false });

      await request(app.getHttpServer()).get('/contest/current').expect(200);

      expect(contestService.getCurrentContest).toHaveBeenCalledWith('user-1');
      // GuardianConsentGuard would have queried prisma.user.findUnique if
      // it ran on this route.
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('GET /contest/cycles/:id', () => {
    it('does not collide with GET /contest/current', async () => {
      contestService.getCycleById.mockResolvedValue({ cycle: { id: 'cyc-1' }, phase: 'crowned' });

      await request(app.getHttpServer()).get('/contest/cycles/cyc-1').expect(200);
      expect(contestService.getCycleById).toHaveBeenCalledWith('cyc-1');
      expect(contestService.getCurrentContest).not.toHaveBeenCalled();
    });

    it('propagates a 404 from the service', async () => {
      contestService.getCycleById.mockRejectedValue(new NotFoundException('Contest cycle not found'));
      await request(app.getHttpServer()).get('/contest/cycles/missing').expect(404);
    });
  });

  describe('POST /contest/entries', () => {
    it('rejects a non-UUID postId with 400 before the service is called', async () => {
      await request(app.getHttpServer()).post('/contest/entries').send({ postId: 'not-a-uuid' }).expect(400);
      expect(contestService.submitEntry).not.toHaveBeenCalled();
    });

    it('is GuardianConsentGuard-gated — a pending-consent minor is blocked 403, service never called', async () => {
      prisma.user.findUnique.mockResolvedValue({ isMinor: true });
      prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'pending' });

      await request(app.getHttpServer())
        .post('/contest/entries')
        .send({ postId: '11111111-1111-4111-8111-111111111111' })
        .expect(403);

      expect(contestService.submitEntry).not.toHaveBeenCalled();
    });

    it('a consented caller reaches the service and gets 201', async () => {
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });
      contestService.submitEntry.mockResolvedValue({ id: 'e-1', roundId: 'rd-1', weekNumber: 1, postId: '11111111-1111-4111-8111-111111111111' });

      await request(app.getHttpServer())
        .post('/contest/entries')
        .send({ postId: '11111111-1111-4111-8111-111111111111' })
        .expect(201);

      expect(contestService.submitEntry).toHaveBeenCalledWith('user-1', '11111111-1111-4111-8111-111111111111');
    });

    it('propagates service 409 (no open round) and 403 (not your post)', async () => {
      prisma.user.findUnique.mockResolvedValue({ isMinor: false });

      contestService.submitEntry.mockRejectedValueOnce(new ConflictException('No contest round is currently open for entries'));
      await request(app.getHttpServer())
        .post('/contest/entries')
        .send({ postId: '11111111-1111-4111-8111-111111111111' })
        .expect(409);

      contestService.submitEntry.mockRejectedValueOnce(new ForbiddenException('not your post'));
      await request(app.getHttpServer())
        .post('/contest/entries')
        .send({ postId: '11111111-1111-4111-8111-111111111111' })
        .expect(403);
    });
  });
});
