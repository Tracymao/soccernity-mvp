import { ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminJwtAuthGuard } from '../admin/guards/admin-jwt-auth.guard';
import { AdminRolesGuard } from '../admin/guards/admin-roles.guard';
import { AuthThrottlerGuard } from '../auth/rate-limit/auth-throttler.guard';
import { SKIP_GLOBAL_WRITE_LIMIT_KEY } from '../../rate-limit/global-rate-limit.constants';
import { ADMIN_SEARCH_MAX_LENGTH } from './admin-search.constants';
import { AdminSearchController } from './admin-search.controller';
import { AdminSearchService } from './admin-search.service';

// GET /admin/search at the real HTTP layer: the REAL AdminRolesGuard and ValidationPipe, the service mocked. Only
// AdminJwtAuthGuard (a stand-in that 401s when nobody is signed in) and AuthThrottlerGuard (the per-IP limiter;
// its real behaviour is proven against the whole app in test/admin-search.e2e-spec.ts) are replaced.
describe('GET /admin/search (HTTP layer)', () => {
  let app: INestApplication;
  let currentAdmin: { sub: string; role: string; aud: string } | null;
  const service = { search: jest.fn() };

  beforeEach(async () => {
    service.search.mockReset().mockResolvedValue({ groups: {} });
    currentAdmin = null;
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminSearchController],
      providers: [{ provide: AdminSearchService, useValue: service }, AdminRolesGuard],
    })
      .overrideGuard(AdminJwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentAdmin) throw new UnauthorizedException();
          context.switchToHttp().getRequest().admin = currentAdmin;
          return true;
        },
      })
      .overrideGuard(AuthThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterEach(async () => app.close());

  const get = (qs: string) => request(app.getHttpServer()).get(`/admin/search${qs}`);

  it('401s with no admin signed in, and never calls the service', async () => {
    await get('?q=nelson').expect(401);
    expect(service.search).not.toHaveBeenCalled();
  });

  it.each(['editor', 'moderator', 'superadmin'])('lets a %s call it (the groups are decided inside, by role)', async (role) => {
    currentAdmin = { sub: 'a1', role, aud: 'admin-console' };
    await get('?q=nelson').expect(200);
    expect(service.search).toHaveBeenCalledWith('nelson', currentAdmin);
  });

  it('passes the text through untouched (the service trims and validates)', async () => {
    currentAdmin = { sub: 'a1', role: 'moderator', aud: 'admin-console' };
    await get('?q=%20%20nelson%20').expect(200);
    expect(service.search.mock.calls[0][0]).toBe('  nelson ');
  });

  it('rejects an unknown query parameter and an array q (400)', async () => {
    currentAdmin = { sub: 'a1', role: 'moderator', aud: 'admin-console' };
    await get('?q=nelson&limit=500').expect(400);
    await get('?q=nelson&q=other').expect(400);
    expect(service.search).not.toHaveBeenCalled();
  });

  it('is limited per IP by the shared limiter and tagged for the global writes-class coverage rule', () => {
    const guards = Reflect.getMetadata('__guards__', AdminSearchController.prototype.run) as unknown[];
    expect(guards).toContain(AuthThrottlerGuard);
    expect(Reflect.getMetadata(SKIP_GLOBAL_WRITE_LIMIT_KEY, AdminSearchController.prototype.run)).toBe(true);
  });

  it('the max-length constant is the one the contact form uses for an email address', () => {
    expect(ADMIN_SEARCH_MAX_LENGTH).toBe(254);
  });
});
