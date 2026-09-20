import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { Under16RestrictionGuard } from '../auth/guards/under-16-restriction.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CommunityGroupsController } from './community-groups.controller';
import { CommunityGroupsService } from './community-groups.service';

// Exercises the real HTTP layer: routing (incl. that /:id/members isn't
// shadowed by /:id), DTO validation (including the DTO-level
// IsAtLeastOneDimensionPresent cross-field rule), and guard wiring —
// following banter.controller.http.spec.ts / clubs.controller.http.spec.ts.
// Both guards are overridden; the consent guard counts its invocations so
// we can assert it's on exactly the three write routes (create, join,
// leave).
describe('CommunityGroupsController (HTTP layer)', () => {
  let app: INestApplication;
  const CALLER = { sub: 'user-1', role: 'fan' };
  let consentGuardCalls = 0;

  const groups = {
    createGroup: jest.fn(),
    listGroups: jest.fn(),
    getGroupById: jest.fn(),
    joinGroup: jest.fn(),
    leaveGroup: jest.fn(),
    getGroupMembers: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CommunityGroupsController],
      providers: [{ provide: CommunityGroupsService, useValue: groups }],
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
      // sprint-1/under-16-restrictions: guard behaviour is covered by
      // under-16-restriction.guard.spec.ts; here it's a pass-through.
      .overrideGuard(Under16RestrictionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
    consentGuardCalls = 0;
  });

  describe('POST /community-groups', () => {
    it('creates a group, delegating to createGroup(caller, dto) — consent guard ran', async () => {
      groups.createGroup.mockResolvedValue({ id: 'g-1' });
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({ name: 'Lagos Strikers', city: 'Lagos' })
        .expect(201);

      expect(groups.createGroup).toHaveBeenCalledWith('user-1', {
        name: 'Lagos Strikers',
        city: 'Lagos',
      });
      expect(consentGuardCalls).toBe(1);
    });

    it('rejects a name with none of city/positionPlayed/careerTrack set (400)', async () => {
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({ name: 'No Dimensions' })
        .expect(400);
      expect(groups.createGroup).not.toHaveBeenCalled();
    });

    it('rejects an all-blank/whitespace-only dimension set (400)', async () => {
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({ name: 'Blank Dimensions', city: '   ' })
        .expect(400);
    });

    it('accepts positionPlayed alone, or careerTrack alone, as a satisfying dimension', async () => {
      groups.createGroup.mockResolvedValue({ id: 'g-1' });
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({ name: 'Strikers Only', positionPlayed: 'Striker' })
        .expect(201);
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({ name: 'Coaches', careerTrack: 'Coaching' })
        .expect(201);
      expect(groups.createGroup).toHaveBeenCalledTimes(2);
    });

    it('rejects a missing name with 400', async () => {
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({ city: 'Lagos' })
        .expect(400);
    });

    it('strips an attempt to set createdById / memberCount / nameNormalized via the body (forbidNonWhitelisted)', async () => {
      await request(app.getHttpServer())
        .post('/community-groups')
        .send({
          name: 'Lagos Strikers',
          city: 'Lagos',
          createdById: 'someone-else',
          memberCount: 99,
          nameNormalized: 'sneaky',
        })
        .expect(400);
    });
  });

  describe('GET /community-groups routing', () => {
    it('GET /community-groups passes city/positionPlayed/careerTrack/cursor/limit through and does NOT run the consent guard', async () => {
      groups.listGroups.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer())
        .get('/community-groups?city=Lagos&positionPlayed=Striker&careerTrack=Coaching&limit=5')
        .expect(200);
      expect(groups.listGroups).toHaveBeenCalledWith(
        expect.objectContaining({
          city: 'Lagos',
          positionPlayed: 'Striker',
          careerTrack: 'Coaching',
          limit: 5,
        }),
        'user-1',
      );
      expect(consentGuardCalls).toBe(0);
    });

    it('GET /community-groups/:id delegates to getGroupById (no consent guard)', async () => {
      groups.getGroupById.mockResolvedValue({ id: 'g-1', joined: false });
      await request(app.getHttpServer()).get('/community-groups/g-1').expect(200);
      expect(groups.getGroupById).toHaveBeenCalledWith('g-1', 'user-1');
      expect(consentGuardCalls).toBe(0);
    });

    it('GET /community-groups/:id/members hits getGroupMembers, NOT getGroupById (no consent guard)', async () => {
      groups.getGroupMembers.mockResolvedValue({ items: [], nextCursor: null });
      await request(app.getHttpServer()).get('/community-groups/g-1/members?limit=10').expect(200);
      expect(groups.getGroupMembers).toHaveBeenCalledWith(
        'g-1',
        expect.objectContaining({ limit: 10 }),
      );
      expect(groups.getGroupById).not.toHaveBeenCalled();
      expect(consentGuardCalls).toBe(0);
    });
  });

  describe('join / leave', () => {
    it('POST /community-groups/:id/join returns 200 and runs the consent guard', async () => {
      groups.joinGroup.mockResolvedValue({ groupId: 'g-1', joined: true, memberCount: 1 });
      await request(app.getHttpServer()).post('/community-groups/g-1/join').expect(200);
      expect(groups.joinGroup).toHaveBeenCalledWith('user-1', 'g-1');
      expect(consentGuardCalls).toBe(1);
    });

    it('DELETE /community-groups/:id/join returns 200 and runs the consent guard', async () => {
      groups.leaveGroup.mockResolvedValue({ groupId: 'g-1', joined: false, memberCount: 0 });
      await request(app.getHttpServer()).delete('/community-groups/g-1/join').expect(200);
      expect(groups.leaveGroup).toHaveBeenCalledWith('user-1', 'g-1');
      expect(consentGuardCalls).toBe(1);
    });
  });
});
