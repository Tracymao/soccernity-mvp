import { ExecutionContext, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { EmailVerifiedGuard } from '../auth/guards/email-verified.guard';
import { GuardianConsentGuard } from '../auth/guards/guardian-consent.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// B-061: GET / PATCH /users/me/settings at the HTTP layer -- route order (the `me` routes must
// not be swallowed by :id), the verified token subject as the only id, and DTO validation.
describe('/users/me/settings (HTTP layer)', () => {
  let app: INestApplication;
  const usersService = { getOwnSettings: jest.fn(), updateOwnSettings: jest.fn(), getOwnProfile: jest.fn() };
  const caller = { sub: 'user-1', role: 'fan' };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    })
      .overrideGuard(EmailVerifiedGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(GuardianConsentGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest().user = caller;
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

  it('GET /users/me/settings reaches the settings handler, not GET :id (which would 403 on "me")', async () => {
    usersService.getOwnSettings.mockResolvedValue({ dmPermission: 'everyone', mediaSensitive: false });
    const res = await request(app.getHttpServer()).get('/users/me/settings').expect(200);
    expect(res.body).toEqual({ dmPermission: 'everyone', mediaSensitive: false });
    expect(usersService.getOwnSettings).toHaveBeenCalledWith('user-1');
    expect(usersService.getOwnProfile).not.toHaveBeenCalled();
  });

  it.each([
    [{ dmPermission: 'everyone' }],
    [{ dmPermission: 'following' }],
    [{ dmPermission: 'none' }],
    [{ mediaSensitive: true }],
    [{ mediaSensitive: false }],
    [{ dmPermission: 'none', mediaSensitive: true }],
    [{}],
  ])('PATCH accepts %j and forwards it with the token subject', async (body) => {
    usersService.updateOwnSettings.mockResolvedValue({ dmPermission: 'none', mediaSensitive: true });
    await request(app.getHttpServer()).patch('/users/me/settings').send(body).expect(200);
    expect(usersService.updateOwnSettings).toHaveBeenCalledWith('user-1', body);
  });

  it.each([
    [{ dmPermission: 'nobody' }],
    [{ dmPermission: 'Everyone' }],
    [{ dmPermission: '' }],
    [{ dmPermission: 3 }],
    [{ dmPermission: null }],
    [{ mediaSensitive: 'yes' }],
    [{ mediaSensitive: 1 }],
    [{ readReceipts: true }],
    [{ dmPermission: 'none', role: 'admin' }],
  ])('PATCH rejects %j with a 400 and writes nothing', async (body) => {
    await request(app.getHttpServer()).patch('/users/me/settings').send(body).expect(400);
    expect(usersService.updateOwnSettings).not.toHaveBeenCalled();
  });
});
