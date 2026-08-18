import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// Regression coverage for a deliberate PR B7 scope decision: GuardianConsentGuard
// (../auth/guards/guardian-consent.guard.ts) is NOT applied to
// GET/PATCH /users/:id. Build Plan Section 8.3 step 5's restricted-pending
// state is about other users seeing/contacting a minor, not the minor
// managing their own account -- so a minor awaiting guardian consent must
// still be able to view/edit their own profile. This is the one case worth
// a dedicated regression test (per B7's PR brief) since it's easy to
// over-apply the guard to `@Controller('users')` by accident later.
//
// This test overrides JwtAuthGuard (bypassing real token verification,
// same pattern as registration.controller.spec.ts) to simulate a minor
// with outstanding guardian consent, and never provides
// GuardianConsentGuard or its PrismaService dependency to this testing
// module at all -- if GuardianConsentGuard were ever added to
// UsersController's @UseGuards() without also updating this test, module
// compilation itself would fail (unresolvable dependency), not just this
// assertion.
describe('UsersController (HTTP layer) — guardian-consent guard exclusion', () => {
  let app: INestApplication;
  const usersService = {
    getOwnProfile: jest.fn(),
    updateOwnProfile: jest.fn(),
  };

  const pendingMinor = { sub: 'minor-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const req = context.switchToHttp().getRequest();
          req.user = pendingMinor;
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

  it('GET /users/:id succeeds for a minor with outstanding guardian consent (not blocked)', async () => {
    usersService.getOwnProfile.mockResolvedValueOnce({
      id: 'minor-1',
      displayName: 'A Minor',
      isMinor: true,
      verificationStatus: 'unverified',
    });

    const response = await request(app.getHttpServer()).get('/users/minor-1').expect(200);

    expect(response.body.id).toBe('minor-1');
    expect(usersService.getOwnProfile).toHaveBeenCalledWith('minor-1');
  });

  it('PATCH /users/:id succeeds for a minor with outstanding guardian consent (not blocked)', async () => {
    usersService.updateOwnProfile.mockResolvedValueOnce({
      id: 'minor-1',
      displayName: 'Updated Name',
      isMinor: true,
      verificationStatus: 'unverified',
    });

    const response = await request(app.getHttpServer())
      .patch('/users/minor-1')
      .send({ displayName: 'Updated Name' })
      .expect(200);

    expect(response.body.displayName).toBe('Updated Name');
    expect(usersService.updateOwnProfile).toHaveBeenCalledWith('minor-1', { displayName: 'Updated Name' });
  });
});
