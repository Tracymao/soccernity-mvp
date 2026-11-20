import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { ADMIN_ROLES_KEY } from '../admin/guards/admin-roles.decorator';
import { AdminActionLogReadController } from './admin-action-log-read.controller';
import { AdminActionLogReadService } from './admin-action-log-read.service';

// GET /admin/action-log at the real HTTP layer: the REAL AdminRolesGuard and ValidationPipe, the service mocked.
// Only AdminJwtAuthGuard (a stand-in that 401s when nobody is signed in) is replaced. The scope and child-safety
// rules are proven against the whole app in test/admin-action-log-read.e2e-spec.ts.
describe('GET /admin/action-log (HTTP layer)', () => {
  let app: INestApplication;
  let currentAdmin: { sub: string; role: string; aud: string } | null;
  const service = { list: jest.fn() };

  beforeEach(async () => {
    service.list.mockReset().mockResolvedValue({ items: [], nextCursor: null });
    currentAdmin = null;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminActionLogReadController],
      providers: [{ provide: AdminActionLogReadService, useValue: service }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentAdmin) throw new UnauthorizedException();
          context.switchToHttp().getRequest().admin = currentAdmin;
          return true;
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterEach(async () => app.close());

  const get = (qs = '') => request(app.getHttpServer()).get(`/admin/action-log${qs}`);

  it('401s with no admin signed in, and never calls the service', async () => {
    await get().expect(401);
    expect(service.list).not.toHaveBeenCalled();
  });

  it.each(['editor', 'moderator', 'superadmin'])('lets a %s call it, passing the token subject and role to the service', async (role) => {
    currentAdmin = { sub: `admin-${role}`, role, aud: 'admin-console' };
    await get().expect(200, { items: [], nextCursor: null });
    expect(service.list).toHaveBeenCalledWith({}, currentAdmin);
  });

  it('the controller declares no required roles (every admin role may call it)', () => {
    expect(Reflect.getMetadata(ADMIN_ROLES_KEY, AdminActionLogReadController)).toBeUndefined();
    expect(Reflect.getMetadata(ADMIN_ROLES_KEY, AdminActionLogReadController.prototype.list)).toBeUndefined();
  });

  it('passes every filter through as the raw strings (the service validates, with stable codes)', async () => {
    currentAdmin = { sub: 'a1', role: 'superadmin', aud: 'admin-console' };
    await get('?limit=5&action=report.actioned&from=2026-11-01&to=2026-11-02&adminId=abc&cursor=xyz').expect(200);
    expect(service.list.mock.calls[0][0]).toEqual({
      limit: '5',
      action: 'report.actioned',
      from: '2026-11-01',
      to: '2026-11-02',
      adminId: 'abc',
      cursor: 'xyz',
    });
  });

  it('rejects an unknown query parameter (400) and never calls the service', async () => {
    currentAdmin = { sub: 'a1', role: 'superadmin', aud: 'admin-console' };
    await get('?targetId=anything').expect(400);
    await get('?adminId=a&adminId=b').expect(400);
    expect(service.list).not.toHaveBeenCalled();
  });
});
