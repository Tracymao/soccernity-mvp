import { ConflictException, ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProfileCompleteGuard } from '../auth/guards/profile-complete.guard';
import { ContestVotingService } from './contest-voting.service';
import { ContestController } from './contest.controller';
import { ContestService } from './contest.service';

// HTTP-layer coverage for the user-facing Contest endpoints (backend/w7-contest, B-091).
// JwtAuthGuard is overridden (token verification is not this suite's concern) but
// GuardianConsentGuard is left REAL (backed by a mocked PrismaService), so "every write is
// consent-gated, the reads are not" is a genuine regression test. The route -> guard table itself is
// pinned in src/write-route-guards.spec.ts.
describe('ContestController (HTTP layer)', () => {
  let app: INestApplication;
  const contestService = {
    getCurrentContest: jest.fn(),
    getCycleById: jest.fn(),
    listRoundEntries: jest.fn(),
    getPinnedEntry: jest.fn(),
    submitEntry: jest.fn(),
    submitFinalEntry: jest.fn(),
  };
  const votingService = { castVote: jest.fn(), retractVote: jest.fn() };
  const prisma = {
    user: { findUnique: jest.fn() },
    guardian: { findUnique: jest.fn() },
  };

  const CALLER = { sub: 'user-1', role: 'fan' };
  const ENTRY_ID = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ContestController],
      providers: [
        { provide: ContestService, useValue: contestService },
        { provide: ContestVotingService, useValue: votingService },
        GuardianConsentGuard,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProfileCompleteGuard)
      .useValue({ canActivate: () => true })
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

  const consentOk = () => prisma.user.findUnique.mockResolvedValue({ isMinor: false });
  const restrictedMinor = () => {
    prisma.user.findUnique.mockResolvedValue({ isMinor: true });
    prisma.guardian.findUnique.mockResolvedValue({ consentStatus: 'pending' });
  };

  describe('reads (no consent gate)', () => {
    it('GET /contest/current passes the caller id through', async () => {
      contestService.getCurrentContest.mockResolvedValue({ cycle: null });
      await request(app.getHttpServer()).get('/contest/current').expect(200);
      expect(contestService.getCurrentContest).toHaveBeenCalledWith('user-1');
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('GET /contest/cycles/:id passes the id through; "current" is not swallowed by :id', async () => {
      contestService.getCycleById.mockResolvedValue({});
      await request(app.getHttpServer()).get('/contest/cycles/abc').expect(200);
      expect(contestService.getCycleById).toHaveBeenCalledWith('abc');
      contestService.getCurrentContest.mockResolvedValue({});
      await request(app.getHttpServer()).get('/contest/current').expect(200);
      expect(contestService.getCycleById).toHaveBeenCalledTimes(1);
    });

    it('GET /contest/rounds/:roundId/entries passes the round, the caller and the paging query', async () => {
      contestService.listRoundEntries.mockResolvedValue({ items: [] });
      await request(app.getHttpServer()).get('/contest/rounds/r1/entries?limit=5').expect(200);
      expect(contestService.listRoundEntries).toHaveBeenCalledWith('r1', 'user-1', expect.objectContaining({ limit: 5 }));
    });

    it('GET /contest/users/:userId/pinned-entry passes the target and the viewer', async () => {
      contestService.getPinnedEntry.mockResolvedValue({ entry: null });
      await request(app.getHttpServer()).get('/contest/users/u2/pinned-entry').expect(200);
      expect(contestService.getPinnedEntry).toHaveBeenCalledWith('u2', 'user-1');
    });
  });

  describe('POST /contest/entries', () => {
    it('is consent-gated: a restricted-pending minor is refused before the service runs', async () => {
      restrictedMinor();
      await request(app.getHttpServer()).post('/contest/entries').send({ postId: ENTRY_ID }).expect(403);
      expect(contestService.submitEntry).not.toHaveBeenCalled();
    });

    it('creates the entry for the caller with 201', async () => {
      consentOk();
      contestService.submitEntry.mockResolvedValue({ id: 'e1' });
      await request(app.getHttpServer()).post('/contest/entries').send({ postId: ENTRY_ID }).expect(201);
      expect(contestService.submitEntry).toHaveBeenCalledWith('user-1', ENTRY_ID);
    });

    it('rejects a malformed postId and unknown fields', async () => {
      consentOk();
      await request(app.getHttpServer()).post('/contest/entries').send({ postId: 'nope' }).expect(400);
      await request(app.getHttpServer()).post('/contest/entries').send({ postId: ENTRY_ID, extra: 1 }).expect(400);
    });

    it('passes a service 409 through', async () => {
      consentOk();
      contestService.submitEntry.mockRejectedValue(new ConflictException('closed'));
      await request(app.getHttpServer()).post('/contest/entries').send({ postId: ENTRY_ID }).expect(409);
    });
  });

  describe('POST /contest/final-entry', () => {
    const body = { contentText: 'my final', mediaUrls: ['https://cdn.example.com/v.mp4'] };

    it('is consent-gated', async () => {
      restrictedMinor();
      await request(app.getHttpServer()).post('/contest/final-entry').send(body).expect(403);
      expect(contestService.submitFinalEntry).not.toHaveBeenCalled();
    });

    it('creates with 201 and passes the DTO through', async () => {
      consentOk();
      contestService.submitFinalEntry.mockResolvedValue({ entryId: 'e1' });
      await request(app.getHttpServer()).post('/contest/final-entry').send(body).expect(201);
      expect(contestService.submitFinalEntry).toHaveBeenCalledWith('user-1', body);
    });

    it('requires at least one media URL (the final is a video) and valid URLs', async () => {
      consentOk();
      await request(app.getHttpServer()).post('/contest/final-entry').send({ contentText: 'x', mediaUrls: [] }).expect(400);
      await request(app.getHttpServer()).post('/contest/final-entry').send({ contentText: 'x' }).expect(400);
      await request(app.getHttpServer())
        .post('/contest/final-entry')
        .send({ contentText: 'x', mediaUrls: ['not a url'] })
        .expect(400);
      await request(app.getHttpServer()).post('/contest/final-entry').send({ contentText: '', mediaUrls: ['https://a.co/v.mp4'] }).expect(400);
    });
  });

  describe('the vote toggle', () => {
    it('PUT is consent-gated: a restricted account cannot vote', async () => {
      restrictedMinor();
      await request(app.getHttpServer()).put('/contest/entries/e1/vote').expect(403);
      expect(votingService.castVote).not.toHaveBeenCalled();
    });

    it('PUT casts the vote for the caller (200, not 201: it is idempotent)', async () => {
      consentOk();
      votingService.castVote.mockResolvedValue({ voted: true, voteCount: 3 });
      const res = await request(app.getHttpServer()).put('/contest/entries/e1/vote').expect(200);
      expect(votingService.castVote).toHaveBeenCalledWith('user-1', 'e1');
      expect(res.body).toEqual({ voted: true, voteCount: 3 });
    });

    it('DELETE is consent-gated and retracts the caller’s vote', async () => {
      restrictedMinor();
      await request(app.getHttpServer()).delete('/contest/entries/e1/vote').expect(403);
      consentOk();
      votingService.retractVote.mockResolvedValue({ voted: false, voteCount: 2 });
      await request(app.getHttpServer()).delete('/contest/entries/e1/vote').expect(200);
      expect(votingService.retractVote).toHaveBeenCalledWith('user-1', 'e1');
    });

    it('surfaces the 409 for a second vote in the same round', async () => {
      consentOk();
      votingService.castVote.mockRejectedValue(
        new ConflictException({ statusCode: 409, code: 'contest_already_voted', message: 'x' }),
      );
      const res = await request(app.getHttpServer()).put('/contest/entries/e2/vote').expect(409);
      expect(res.body.code).toBe('contest_already_voted');
    });
  });
});
