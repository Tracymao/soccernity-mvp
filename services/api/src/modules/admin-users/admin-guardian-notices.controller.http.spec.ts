import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { CHILD_SAFETY_VETTING_REQUIRED_CODE } from '../moderation/moderation.constants';
import { AdminChildSafetyVettedGuard } from './admin-child-safety-vetted.guard';
import { AdminGuardianNoticesController } from './admin-guardian-notices.controller';
import { AdminGuardianNoticesService } from './admin-guardian-notices.service';

// B-280 (Decision Log #458): guards and wiring. The vetting guard runs FIRST (before the validation pipe and before
// the service touches any account), reads childSafetyVetted FRESH, and applies whatever the role.
describe('AdminGuardianNoticesController (HTTP layer)', () => {
  let app: INestApplication;
  const service = { getState: jest.fn(), withhold: jest.fn(), clear: jest.fn(), review: jest.fn() };
  const prisma = { adminUser: { findUnique: jest.fn() } };
  let currentAdmin: { sub: string; role: string; aud: string };

  const asAdmin = (role: string, vetted: boolean) => {
    currentAdmin = { sub: 'admin-1', role, aud: 'admin-console' };
    prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: vetted });
  };
  const url = (suffix = '') => `/admin/users/user-1/guardian-notices${suffix}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminGuardianNoticesController],
      providers: [
        { provide: AdminGuardianNoticesService, useValue: service },
        { provide: PrismaService, useValue: prisma },
        AdminRolesGuard,
        AdminChildSafetyVettedGuard,
      ],
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

  describe('the vetting check runs first and is identical for every account', () => {
    it.each([
      ['GET', ''],
      ['POST', '/withhold'],
      ['POST', '/clear'],
      ['POST', '/review'],
    ])('an UNVETTED superadmin gets the coded 403 on %s %s, and no service method runs', async (method, suffix) => {
      asAdmin('superadmin', false);
      const res =
        method === 'GET'
          ? await request(app.getHttpServer()).get(url(suffix)).expect(403)
          : await request(app.getHttpServer()).post(url(suffix)).send({ reason: 'x'.repeat(20), note: 'x'.repeat(20) }).expect(403);
      expect(res.body.code).toBe(CHILD_SAFETY_VETTING_REQUIRED_CODE);
      for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    });

    it('answers the same 403 for a malformed body (the check runs before the validation pipe)', async () => {
      asAdmin('moderator', false);
      const bad = await request(app.getHttpServer()).post(url('/withhold')).send({}).expect(403);
      const good = await request(app.getHttpServer()).post(url('/withhold')).send({ reason: 'x'.repeat(20) }).expect(403);
      expect(bad.body).toEqual(good.body);
    });

    it('answers the same 403 for an account that does not exist as for one that does (the id is never looked at)', async () => {
      asAdmin('moderator', false);
      const a = await request(app.getHttpServer()).get('/admin/users/exists/guardian-notices').expect(403);
      const b = await request(app.getHttpServer()).get('/admin/users/no-such-user/guardian-notices').expect(403);
      expect(a.body).toEqual(b.body);
      expect(service.getState).not.toHaveBeenCalled();
    });

    it('reads vetting fresh from Postgres on every request (a stale page is refused the moment they are not vetted)', async () => {
      asAdmin('moderator', true);
      service.getState.mockResolvedValue({ withheld: false });
      await request(app.getHttpServer()).get(url()).expect(200);

      prisma.adminUser.findUnique.mockResolvedValue({ childSafetyVetted: false });
      await request(app.getHttpServer()).get(url()).expect(403);

      expect(prisma.adminUser.findUnique).toHaveBeenCalledTimes(2);
      expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { childSafetyVetted: true } });
    });

    it('rejects an editor with 403 (the role set is moderator / superadmin, like the sibling routes)', async () => {
      asAdmin('editor', true);
      await request(app.getHttpServer()).get(url()).expect(403);
      expect(service.getState).not.toHaveBeenCalled();
    });
  });

  describe('for a vetted moderator or superadmin', () => {
    it.each(['moderator', 'superadmin'])('GET returns the state (%s)', async (role) => {
      asAdmin(role, true);
      service.getState.mockResolvedValue({ withheld: false });
      const res = await request(app.getHttpServer()).get(url()).expect(200);
      expect(res.body).toEqual({ withheld: false });
      expect(service.getState).toHaveBeenCalledWith('user-1');
    });

    it('POST withhold passes the id, the calling admin and the reason, and returns 200 with the new state', async () => {
      asAdmin('moderator', true);
      service.withhold.mockResolvedValue({ withheld: true });
      const res = await request(app.getHttpServer()).post(url('/withhold')).send({ reason: 'A real reason here' }).expect(200);
      expect(res.body).toEqual({ withheld: true });
      expect(service.withhold).toHaveBeenCalledWith('user-1', 'admin-1', 'A real reason here');
    });

    it('POST clear passes the reason', async () => {
      asAdmin('moderator', true);
      service.clear.mockResolvedValue({ withheld: false });
      await request(app.getHttpServer()).post(url('/clear')).send({ reason: 'No longer needed' }).expect(200);
      expect(service.clear).toHaveBeenCalledWith('user-1', 'admin-1', 'No longer needed');
    });

    it('POST review passes the note', async () => {
      asAdmin('moderator', true);
      service.review.mockResolvedValue({ withheld: true });
      await request(app.getHttpServer()).post(url('/review')).send({ note: 'Still needed, reviewed' }).expect(200);
      expect(service.review).toHaveBeenCalledWith('user-1', 'admin-1', 'Still needed, reviewed');
    });

    it.each([
      ['/withhold', {}],
      ['/withhold', { reason: 42 }],
      ['/clear', {}],
      ['/review', {}],
      ['/review', { reason: 'wrong field name for review' }],
      ['/withhold', { reason: 'fine reason here', extra: true }],
    ])('400 for a missing, non-string or unknown field: %s %j', async (suffix, body) => {
      asAdmin('moderator', true);
      await request(app.getHttpServer()).post(url(suffix)).send(body).expect(400);
      expect(service.withhold).not.toHaveBeenCalled();
      expect(service.clear).not.toHaveBeenCalled();
      expect(service.review).not.toHaveBeenCalled();
    });
  });
});
