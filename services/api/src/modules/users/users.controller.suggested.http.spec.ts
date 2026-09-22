import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { SUGGESTED_USERS_DEFAULT_LIMIT, SUGGESTED_USERS_MAX_LIMIT } from './suggested-users.constants';

// HTTP-layer coverage for GET /users/suggested (Decision Log #139's
// Search & Trending "Suggested" follow panel; sprint-6/suggested-people-backend).
// Same JwtAuthGuard-override pattern as users.controller.follow.http.spec.ts
// — this route only ever applies the class-level JwtAuthGuard, no
// GuardianConsentGuard (see UsersService.getSuggestedUsers's own header
// comment for why there's nothing safety-sensitive here to gate). The
// one route-ordering regression worth a dedicated HTTP-layer test:
// GET /users/suggested must not be swallowed by GET /users/:id (which
// would bind :id to the literal string "suggested" and 403 via
// assertSelf) -- Nest/Express match routes in declaration order, so this
// is a real regression risk if @Get('suggested') is ever moved below
// @Get(':id') in users.controller.ts.
describe('UsersController (HTTP layer) — GET /users/suggested', () => {
  let app: INestApplication;
  const usersService = {
    getOwnProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
    getSuggestedUsers: jest.fn(),
  };

  const CALLER = { sub: 'caller-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = CALLER;
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
  });

  it('is NOT swallowed by GET /users/:id — reaches UsersService.getSuggestedUsers, not getOwnProfile', async () => {
    usersService.getSuggestedUsers.mockResolvedValue({ items: [] });

    await request(app.getHttpServer()).get('/users/suggested').expect(200);

    expect(usersService.getSuggestedUsers).toHaveBeenCalledWith('caller-1', SUGGESTED_USERS_DEFAULT_LIMIT);
    expect(usersService.getOwnProfile).not.toHaveBeenCalled();
  });

  it('defaults to SUGGESTED_USERS_DEFAULT_LIMIT when no limit query param is given', async () => {
    usersService.getSuggestedUsers.mockResolvedValue({ items: [] });

    await request(app.getHttpServer()).get('/users/suggested').expect(200);

    expect(usersService.getSuggestedUsers).toHaveBeenCalledWith('caller-1', SUGGESTED_USERS_DEFAULT_LIMIT);
  });

  it('passes a valid limit query param through to the service', async () => {
    usersService.getSuggestedUsers.mockResolvedValue({ items: [] });

    await request(app.getHttpServer()).get('/users/suggested').query({ limit: '5' }).expect(200);

    expect(usersService.getSuggestedUsers).toHaveBeenCalledWith('caller-1', 5);
  });

  it('rejects a limit above SUGGESTED_USERS_MAX_LIMIT with 400 before the service is called (same @Max-at-the-DTO-layer convention as TrendingQueryDto/SearchQueryDto)', async () => {
    await request(app.getHttpServer())
      .get('/users/suggested')
      .query({ limit: String(SUGGESTED_USERS_MAX_LIMIT + 100) })
      .expect(400);

    expect(usersService.getSuggestedUsers).not.toHaveBeenCalled();
  });

  it('rejects a non-integer limit with 400 before the service is called', async () => {
    await request(app.getHttpServer()).get('/users/suggested').query({ limit: 'abc' }).expect(400);
    expect(usersService.getSuggestedUsers).not.toHaveBeenCalled();
  });

  it('rejects an unknown query param with 400 (forbidNonWhitelisted)', async () => {
    await request(app.getHttpServer()).get('/users/suggested').query({ q: 'chelsea' }).expect(400);
    expect(usersService.getSuggestedUsers).not.toHaveBeenCalled();
  });

  it('returns the service response body as-is on success', async () => {
    const body = { items: [{ id: 'user-2', displayName: 'Suggested Person' }] };
    usersService.getSuggestedUsers.mockResolvedValue(body);

    const res = await request(app.getHttpServer()).get('/users/suggested').expect(200);
    expect(res.body).toEqual(body);
  });
});
